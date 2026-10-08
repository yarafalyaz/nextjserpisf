import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the inventory-transfer FIFO cost-basis drift fix (1a845e2):
// the transfer form allows duplicate item rows and InventoryTransferItem has no
// unique (transferId, itemId) constraint. Before the fix, duplicate rows created
// one OUT move per row (splitting the FIFO consume) and the IN side reused the
// first OUT move's cost for every duplicate, drifting the destination cost basis.
// The hook now aggregates by itemId: exactly one consume + one OUT move per item.

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  createInLayer: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
  createInLayer: mocks.createInLayer,
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onTransferProcessed, onTransferReceived } from "@/lib/hooks/inventory-transfer.hook"

function wireTx(transferItems: Array<{ id?: number; itemId: number; qty: number; serialNumbers?: unknown; batchAllocations?: unknown }>, status = "draft") {
  const normalizedItems = transferItems.map((item, index) => ({ id: item.id ?? index + 1, ...item }))
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    transferFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "TRF-001",
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      status,
      items: normalizedItems,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveFindMany: vi.fn().mockResolvedValue([]),
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    transferItemUpdate: vi.fn().mockResolvedValue({}),
    serialUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
    batchFindMany: vi.fn().mockResolvedValue([]),
    batchFindFirst: vi.fn().mockResolvedValue(null),
    batchUpdate: vi.fn().mockResolvedValue({}),
    batchCreate: vi.fn().mockResolvedValue({}),
    executeRaw: vi.fn().mockResolvedValue(1),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    inventoryTransfer: { findUniqueOrThrow: spies.transferFindUniqueOrThrow },
    inventoryTransferItem: { update: spies.transferItemUpdate },
    itemSerial: { updateMany: spies.serialUpdateMany },
    itemBatch: {
      findMany: spies.batchFindMany,
      findFirst: spies.batchFindFirst,
      update: spies.batchUpdate,
      create: spies.batchCreate,
    },
    stockMove: { findFirst: spies.moveFindFirst, findMany: spies.moveFindMany, create: spies.moveCreate },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumberBatch.mockImplementation(async (_key: string, count: number) =>
    Array.from({ length: count }, () => `SM-${++n}`),
  )
  // Cost differs per FIFO consume call to make drift detectable if dedup regressed.
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 500, shortfall: 0, consumedSerials: [], consumedBatches: [] })
})

describe("onTransferProcessed item aggregation", () => {
  it("creates exactly one OUT move per item when an item is listed on duplicate rows", async () => {
    // Item 7 appears twice (qty 3 + qty 2 = 5); item 8 once (qty 4).
    const { spies } = wireTx([
      { itemId: 7, qty: 3 },
      { itemId: 7, qty: 2 },
      { itemId: 8, qty: 4 },
    ])

    await onTransferProcessed(100, 1)

    // 2 distinct items -> 2 consumes, 2 OUT moves (NOT 3).
    expect(mocks.consumeFifoLayers).toHaveBeenCalledTimes(2)
    expect(spies.moveCreate).toHaveBeenCalledTimes(2)

    // Item 7 consumed once with the SUMMED qty 5 (not two separate 3 and 2 consumes).
    const consumeForItem7 = mocks.consumeFifoLayers.mock.calls.find(
      (c) => (c[1] as { itemId: number }).itemId === 7,
    )
    expect(consumeForItem7).toBeDefined()
    expect((consumeForItem7![1] as { qty: number }).qty).toBe(5)
    expect((consumeForItem7![1] as { warehouseId: number }).warehouseId).toBe(1) // source

    // The OUT move for item 7 carries qty 5.
    const out7 = spies.moveCreate.mock.calls.find(
      (c) => (c[0] as { data: { itemId: number } }).data.itemId === 7,
    )
    expect((out7![0] as { data: { qty: number; impact: string } }).data.qty).toBe(5)
    expect((out7![0] as { data: { impact: string } }).data.impact).toBe("OUT")
  })

  it("stores consumed batch and serial allocation once on the first duplicate item row", async () => {
    const { spies } = wireTx([
      { id: 41, itemId: 7, qty: 3 },
      { id: 42, itemId: 7, qty: 2 },
    ])
    mocks.consumeFifoLayers.mockResolvedValueOnce({
      consumedCost: 500,
      shortfall: 0,
      consumedSerials: ["SER-1"],
      consumedBatches: [{ batchNumber: "LOT-A", warehouseId: 1, qty: 2 }],
    })

    await onTransferProcessed(100, 1)

    expect(spies.transferItemUpdate).toHaveBeenCalledTimes(1)
    expect(spies.transferItemUpdate).toHaveBeenCalledWith({
      where: { id: 41 },
      data: {
        serialNumbers: ["SER-1"],
        batchAllocations: [{ batchNumber: "LOT-A", warehouseId: 1, qty: 2 }],
      },
    })
  })

  it("aggregates fractional duplicate rows without float drift (exact qty to FIFO)", async () => {
    // Item 7 on two rows: 0.1 + 0.2. Plain JS float addition yields
    // 0.30000000000000004, which (a) writes a drifted value into the
    // Decimal(15,2) qty_on_hand column and (b) falsely trips the
    // consumeFifoLayers shortfall guard when the source warehouse holds
    // exactly 0.3 available. Aggregation must round to the column scale (2dp).
    const { spies } = wireTx([
      { itemId: 7, qty: 0.1 },
      { itemId: 7, qty: 0.2 },
    ])

    await onTransferProcessed(100, 1)

    expect(mocks.consumeFifoLayers).toHaveBeenCalledTimes(1)
    const qtyToFifo = (mocks.consumeFifoLayers.mock.calls[0]![1] as { qty: number }).qty
    expect(qtyToFifo).toBe(0.3) // NOT 0.30000000000000004

    const out7 = spies.moveCreate.mock.calls.find(
      (c) => (c[0] as { data: { itemId: number } }).data.itemId === 7,
    )
    expect((out7![0] as { data: { qty: number } }).data.qty).toBe(0.3)
  })

  it("returns silently (idempotent) when OUT moves already exist", async () => {
    const { spies } = wireTx([{ itemId: 7, qty: 3 }])
    spies.moveFindFirst.mockResolvedValue({ id: 1 }) // existing OUT move
    await onTransferProcessed(100, 1)
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })

  it("bypasses $transaction when txClient is provided", async () => {
    const { spies, tx } = wireTx([{ itemId: 7, qty: 3 }])
    mocks.transaction.mockClear()
    await onTransferProcessed(100, 1, tx as any)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(spies.moveCreate).toHaveBeenCalled()
  })
})

describe("onTransferReceived", () => {
  it("rejects if transfer is not processed", async () => {
    wireTx([{ itemId: 7, qty: 3 }], "draft")
    await expect(onTransferReceived(100)).rejects.toThrow(/Transfer harus berstatus 'processed'/)
  })

  it("returns silently (idempotent) when IN moves already exist", async () => {
    const { spies } = wireTx([{ itemId: 7, qty: 3 }], "processed")
    // First findFirst call is the idempotency check
    spies.moveFindFirst.mockResolvedValueOnce({ id: 1 })
    await onTransferReceived(100, 1)
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })

  it("succeeds when status is 'receiving' (the transient claim set by receiveInventoryTransfer)", async () => {
    // Regression: receiveInventoryTransfer atomically claims the transfer by
    // flipping status processed -> receiving BEFORE invoking this hook (and
    // passes no txClient, so the hook re-reads the committed "receiving" state).
    // The old guard rejected anything !== "processed", so receive ALWAYS threw
    // and left the transfer permanently stuck at "receiving". The guard must
    // accept the transient "receiving" claim state too.
    const { spies } = wireTx([{ itemId: 7, qty: 3 }], "receiving")
    spies.moveFindFirst.mockResolvedValueOnce(null) // idempotency: no existing IN move
    spies.moveFindMany.mockResolvedValueOnce([{ itemId: 7, cost: 15 }]) // item 7 OUT move (cost basis)
    spies.moveCreate.mockResolvedValueOnce({ id: 900 }) // newly created IN move (mock return)

    await expect(onTransferReceived(100, 1)).resolves.not.toThrow()
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect((spies.moveCreate.mock.calls[0]![0] as { data: { impact: string } }).data.impact).toBe("IN")
  })

  it("aggregates items and preserves exact cost basis from OUT moves", async () => {
    const { spies } = wireTx([
      { itemId: 7, qty: 3 },
      { itemId: 7, qty: 2 }, // Duplicate row -> 5 total
      { itemId: 8, qty: 4 },
    ], "processed")

    // 1st check: idempotency (null = no existing IN moves)
    // 2nd check: findMany for all OUT moves
    spies.moveFindFirst.mockResolvedValueOnce(null)
    spies.moveFindMany.mockResolvedValueOnce([
      { itemId: 7, cost: 15 },
      { itemId: 8, cost: 20 },
    ])
    // mock creations
    spies.moveCreate
      .mockResolvedValueOnce({ id: 900 })
      .mockResolvedValueOnce({ id: 901 })

    await onTransferReceived(100, 1)

    expect(spies.moveCreate).toHaveBeenCalledTimes(2)
    
    // Check item 7 aggregated OUT move match
    const in7 = spies.moveCreate.mock.calls.find(
      (c) => (c[0] as { data: { itemId: number } }).data.itemId === 7,
    )
    expect((in7![0] as { data: { qty: number; impact: string, cost: number } }).data.qty).toBe(5)
    expect((in7![0] as { data: { impact: string } }).data.impact).toBe("IN")
    expect((in7![0] as { data: { cost: number } }).data.cost).toBe(15) // Preserved cost

    expect(mocks.createInLayer).toHaveBeenCalledTimes(2)
    const layer7 = mocks.createInLayer.mock.calls.find(
      (c) => (c[1] as { itemId: number }).itemId === 7,
    )
    expect((layer7![1] as { unitCost: number }).unitCost).toBe(15)
    expect((layer7![1] as { stockMoveId: number }).stockMoveId).toBe(900)
    expect((layer7![1] as { warehouseId: number }).warehouseId).toBe(2) // destination
  })
  it("restores allocated serials and batches, splitting destination FIFO layers by lot", async () => {
    const { spies } = wireTx([
      {
        id: 51,
        itemId: 7,
        qty: 3,
        serialNumbers: ["SER-1"],
        batchAllocations: [{ batchNumber: "LOT-A", warehouseId: 1, qty: 2 }],
      },
      { id: 52, itemId: 7, qty: 0 },
    ], "processed")
    spies.moveFindMany.mockResolvedValueOnce([{ itemId: 7, cost: 15 }])
    spies.moveCreate.mockResolvedValueOnce({ id: 900 })
    spies.serialUpdateMany.mockResolvedValueOnce({ count: 1 })
    spies.batchFindMany.mockResolvedValueOnce([
      {
        batchNumber: "LOT-A",
        manufacturingDate: new Date("2025-01-01T00:00:00.000Z"),
        expiryDate: new Date("2027-01-01T00:00:00.000Z"),
        notes: "source lot",
      },
    ])

    await onTransferReceived(100, 1)

    expect(spies.serialUpdateMany).toHaveBeenCalledWith({
      where: { itemId: 7, serialNumber: { in: ["SER-1"] }, status: "used" },
      data: { status: "available", warehouseId: 2 },
    })
    expect(spies.batchCreate).toHaveBeenCalledWith({
      data: {
        itemId: 7,
        warehouseId: 2,
        batchNumber: "LOT-A",
        qty: 2,
        manufacturingDate: new Date("2025-01-01T00:00:00.000Z"),
        expiryDate: new Date("2027-01-01T00:00:00.000Z"),
        notes: "source lot",
      },
    })
    expect(mocks.createInLayer).toHaveBeenCalledTimes(2)
    expect(mocks.createInLayer).toHaveBeenCalledWith(expect.anything(), {
      itemId: 7,
      warehouseId: 2,
      batchNumber: "LOT-A",
      stockMoveId: 900,
      qty: 2,
      unitCost: 15,
    })
    expect(mocks.createInLayer).toHaveBeenCalledWith(expect.anything(), {
      itemId: 7,
      warehouseId: 2,
      stockMoveId: 900,
      qty: 1,
      unitCost: 15,
    })
  })
})
