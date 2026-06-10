import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the inventory-transfer FIFO cost-basis drift fix (1a845e2):
// the transfer form allows duplicate item rows and InventoryTransferItem has no
// unique (transferId, itemId) constraint. Before the fix, duplicate rows created
// one OUT move per row (splitting the FIFO consume) and the IN side reused the
// first OUT move's cost for every duplicate, drifting the destination cost basis.
// The hook now aggregates by itemId: exactly one consume + one OUT move per item.

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  consumeFifoLayers: vi.fn(),
  createInLayer: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
  createInLayer: mocks.createInLayer,
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onTransferProcessed } from "@/lib/hooks/inventory-transfer.hook"

function wireTx(transferItems: Array<{ itemId: number; qty: number }>) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    transferFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "TRF-001",
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      status: "draft",
      items: transferItems,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null), // no existing OUT moves (not yet processed)
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    executeRaw: vi.fn().mockResolvedValue(1),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    inventoryTransfer: { findUniqueOrThrow: spies.transferFindUniqueOrThrow },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`)
  // Cost differs per FIFO consume call to make drift detectable if dedup regressed.
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 500, shortfall: 0 })
})

describe("onTransferProcessed item aggregation", () => {
  it("creates exactly one OUT move per item when an item is listed on duplicate rows", async () => {
    // Item 7 appears twice (qty 3 + qty 2 = 5); item 8 once (qty 4).
    const spies = wireTx([
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

  it("returns silently (idempotent) when OUT moves already exist", async () => {
    const spies = wireTx([{ itemId: 7, qty: 3 }])
    spies.moveFindFirst.mockResolvedValue({ id: 1 }) // existing OUT move
    await onTransferProcessed(100, 1)
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })
})
