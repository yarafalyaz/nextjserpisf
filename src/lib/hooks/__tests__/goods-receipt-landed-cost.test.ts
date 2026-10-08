import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the HPP / landed-cost PRD (docs/prd-hpp-landed-cost.md).
//
// The old hook computed `landedCostPerUnit = itemShare / poItem.qty` and added
// it to EVERY received unit. This suite pins the corrected behaviour end-to-end:
// the allocated per-unit freight must reach BOTH the FIFO layer (createInLayer)
// and the GL journal (stockJournalService.onGoodsReceipt) at the same value, and
// the PO discount must reduce the layer's unit cost.

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  generateDocumentNumberBatch: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  onGoodsReceipt: vi.fn(),
  onServiceGoodsReceipt: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: mocks.createInLayer }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onGoodsReceipt: mocks.onGoodsReceipt, onServiceGoodsReceipt: mocks.onServiceGoodsReceipt },
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook"

interface GrItem {
  itemId: number
  qty: number
  unitCost?: number
  uom?: string | null
  batchNumber?: string | null
  expiryDate?: Date | null
  serialNumbers?: unknown
}

function wireTx(opts: {
  grItems: GrItem[]
  poItems: Array<{ itemId: number; qty: number; total: number }>
  poHeader?: { shippingCost?: number; serviceFee?: number; discount?: number }
  grCosts?: { shippingCost?: number; otherCost?: number }
  conversions?: Array<{ itemId: number; code: string; factorToBase: number }>
  itemMeta?: { unitOfMeasure?: string; trackBatch?: boolean; trackSerial?: boolean }
  serviceItemIds?: number[]
}) {
  const meta = opts.itemMeta ?? { unitOfMeasure: "PCS", trackBatch: false, trackSerial: false }
  const serviceIds = new Set(opts.serviceItemIds ?? [])
  const poHeader = opts.poHeader ?? {}
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    grFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "GR-001",
      status: "draft",
      purchaseOrderId: 50,
      warehouseId: 1,
      date: new Date("2024-06-15"),
      shippingCost: opts.grCosts?.shippingCost ?? 0,
      otherCost: opts.grCosts?.otherCost ?? 0,
      items: opts.grItems,
      purchaseOrder: {
        id: 50,
        shippingCost: poHeader.shippingCost ?? 0,
        serviceFee: poHeader.serviceFee ?? 0,
        discount: poHeader.discount ?? 0,
        items: opts.poItems,
      },
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    grUpdate: vi.fn().mockResolvedValue({}),
    poItemFindMany: vi.fn().mockResolvedValue(opts.poItems),
    grItemFindMany: vi.fn().mockResolvedValue([]),
    poUpdate: vi.fn().mockResolvedValue({}),
    itemFindMany: vi.fn().mockResolvedValue(
      [...new Set(opts.grItems.map((g) => g.itemId))].map((id) => ({
        id,
        ...meta,
        isService: serviceIds.has(id),
      }))
    ),
    uomConversionFindMany: vi.fn().mockResolvedValue(opts.conversions ?? []),
    itemBatchFindFirst: vi.fn().mockResolvedValue(null),
    itemBatchCreate: vi.fn().mockResolvedValue({}),
    itemBatchUpdate: vi.fn().mockResolvedValue({}),
    itemSerialCreate: vi.fn().mockResolvedValue({}),
    itemSerialCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
    systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    itemUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    goodsReceipt: { findUniqueOrThrow: spies.grFindUniqueOrThrow, update: spies.grUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
    goodsReceiptItem: { findMany: spies.grItemFindMany },
    purchaseOrder: { update: spies.poUpdate },
    item: { findUnique: vi.fn(), findMany: spies.itemFindMany, update: spies.itemUpdate },
    uomConversion: { findMany: spies.uomConversionFindMany },
    itemBatch: {
      findFirst: spies.itemBatchFindFirst,
      create: spies.itemBatchCreate,
      update: spies.itemBatchUpdate,
    },
    itemSerial: { create: spies.itemSerialCreate, createMany: spies.itemSerialCreateMany },
    systemSetting: { findFirst: spies.systemSettingFindFirst },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`)
  mocks.generateDocumentNumberBatch.mockImplementation(async (_k: string, count: number) =>
    Array.from({ length: count }, () => `SM-${++n}`)
  )
  mocks.toBaseFactor.mockResolvedValue(1)
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.onGoodsReceipt.mockResolvedValue(undefined)
  mocks.onServiceGoodsReceipt.mockResolvedValue(undefined)
})

function lastLayerArg() {
  const call = mocks.createInLayer.mock.calls[0] as unknown[]
  return call[1] as { unitCost: number; qty: number }
}
function lastJournalLines() {
  const args = mocks.onGoodsReceipt.mock.calls[0] as unknown[]
  return args[1] as Array<{ qty: number; cost: number }>
}

describe("onGoodsReceiptVerified landed cost → FIFO layer + journal", () => {
  it("capitalises the receipt's proportional freight share into the layer and journal", async () => {
    // PO 10 pcs, net value 10000, freight 100000 (10000/unit). This GR receives
    // only 4 → absorbs 4/10 of the pool = 40000 → +10000/unit on top of the
    // entered 1000. The old code produced the same per-unit here, but this pins
    // that the layer and the journal agree exactly.
    const { spies } = wireTx({
      grItems: [{ itemId: 7, qty: 4, unitCost: 1000 }],
      poItems: [{ itemId: 7, qty: 10, total: 10000 }],
      poHeader: { shippingCost: 100000 },
    })

    await onGoodsReceiptVerified(100, 1)

    const layer = lastLayerArg()
    expect(layer.qty).toBe(4)
    expect(layer.unitCost).toBe(11000)
    // Journal must carry the SAME unit cost as the layer.
    expect(lastJournalLines()).toEqual([{ qty: 4, cost: 11000 }])
    const moveCall = spies.moveCreate.mock.calls[0][0] as { data: { cost: number } }
    expect(moveCall.data.cost).toBe(11000)
  })

  it("uses the receipt's ACTUAL freight when entered, not the PO estimate", async () => {
    const { spies } = wireTx({
      grItems: [{ itemId: 7, qty: 4, unitCost: 1000 }],
      poItems: [{ itemId: 7, qty: 10, total: 10000 }],
      poHeader: { shippingCost: 100000 },
      grCosts: { shippingCost: 25000 }, // real freight for this shipment
    })

    await onGoodsReceiptVerified(100, 1)

    // 25000 / 4 = 6250/unit + 1000 = 7250
    expect(lastLayerArg().unitCost).toBe(7250)
    expect(lastJournalLines()).toEqual([{ qty: 4, cost: 7250 }])
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
  })

  it("reduces the layer's unit cost by the PO discount (HPP = gross − discount)", async () => {
    // PO: 10 pcs @ 1000 gross with a 1000 line discount → net total 9000.
    // The GR unit cost is entered GROSS (1000); the discount must be applied
    // once by the allocator so HPP lands at the net 900/unit.
    wireTx({
      grItems: [{ itemId: 7, qty: 10, unitCost: 1000 }],
      poItems: [{ itemId: 7, qty: 10, total: 9000 }],
      poHeader: { discount: 1000 },
    })

    await onGoodsReceiptVerified(100, 1)

    expect(lastLayerArg().unitCost).toBe(900)
    expect(lastJournalLines()).toEqual([{ qty: 10, cost: 900 }])
  })

  it("absorbs no freight when the PO carries none", async () => {
    wireTx({
      grItems: [{ itemId: 7, qty: 5, unitCost: 2000 }],
      poItems: [{ itemId: 7, qty: 5, total: 10000 }],
    })

    await onGoodsReceiptVerified(100, 1)

    expect(lastLayerArg().unitCost).toBe(2000)
    expect(lastJournalLines()).toEqual([{ qty: 5, cost: 2000 }])
  })

  it("keeps the layer and journal consistent under multi-UoM with freight", async () => {
    // Entered 1 BOX @ 12000 (= 12 PCS @ 1000 base). PO 12 PCS, freight 12000
    // (= 1000/PCS). Layer must be 12 PCS @ 2000, not the old double-counted
    // value the per-ordered-qty division produced when the entered UoM scaled.
    wireTx({
      grItems: [{ itemId: 7, qty: 1, unitCost: 12000, uom: "BOX" }],
      poItems: [{ itemId: 7, qty: 12, total: 12000 }],
      poHeader: { shippingCost: 12000 },
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    })

    await onGoodsReceiptVerified(100, 1)

    const layer = lastLayerArg()
    expect(layer.qty).toBe(12)
    expect(layer.unitCost).toBe(2000) // 1000 base cost + 1000 freight
    expect(lastJournalLines()).toEqual([{ qty: 12, cost: 2000 }])
  })

  it("splits freight between two items by value and books the pool exactly", async () => {
    // Item A: 10 × 1000 = 10000 (10%). Item B: 10 × 9000 = 90000 (90%).
    // Freight 10000 → A +1000, B +9000.
    wireTx({
      grItems: [
        { itemId: 7, qty: 10, unitCost: 1000 },
        { itemId: 8, qty: 10, unitCost: 9000 },
      ],
      poItems: [
        { itemId: 7, qty: 10, total: 10000 },
        { itemId: 8, qty: 10, total: 90000 },
      ],
      poHeader: { shippingCost: 10000 },
    })

    await onGoodsReceiptVerified(100, 1)

    const layerA = mocks.createInLayer.mock.calls[0][1] as { unitCost: number }
    const layerB = mocks.createInLayer.mock.calls[1][1] as { unitCost: number }
    expect(layerA.unitCost).toBe(1100) // 1000 + 100
    expect(layerB.unitCost).toBe(9900) // 9000 + 900

    const lines = lastJournalLines()
    expect(lines).toEqual([
      { qty: 10, cost: 1100 },
      { qty: 10, cost: 9900 },
    ])
  })

  it("does NOT move stock for a service line and expenses its cost instead (PRD FAB-08)", async () => {
    // Item 7 is a service (vendor labour). It must not create a stock move /
    // FIFO layer / qtyOnHand change; its cost is expensed via onServiceGoodsReceipt.
    const { spies } = wireTx({
      grItems: [{ itemId: 7, qty: 1, unitCost: 500000 }],
      poItems: [{ itemId: 7, qty: 1, total: 500000 }],
      serviceItemIds: [7],
    })

    await onGoodsReceiptVerified(100, 1)

    // No stock movement, no FIFO layer, no inventory journal.
    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(mocks.onGoodsReceipt).not.toHaveBeenCalled()
    // Cost expensed instead.
    expect(mocks.onServiceGoodsReceipt).toHaveBeenCalledTimes(1)
    const svcLines = mocks.onServiceGoodsReceipt.mock.calls[0][1] as Array<{ qty: number; cost: number }>
    expect(svcLines).toEqual([{ qty: 1, cost: 500000 }])
  })

  it("splits a mixed GR: stock lines move inventory, service lines are expensed", async () => {
    const { spies } = wireTx({
      grItems: [
        { itemId: 7, qty: 2, unitCost: 1000 }, // stock
        { itemId: 8, qty: 1, unitCost: 250000 }, // service
      ],
      poItems: [
        { itemId: 7, qty: 2, total: 2000 },
        { itemId: 8, qty: 1, total: 250000 },
      ],
      serviceItemIds: [8],
    })

    await onGoodsReceiptVerified(100, 1)

    // Only the stock line moved; the service line did not.
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    const moveCall = spies.moveCreate.mock.calls[0][0] as { data: { itemId: number } }
    expect(moveCall.data.itemId).toBe(7)
    expect(mocks.createInLayer).toHaveBeenCalledTimes(1)
    // Inventory journal carries only the stock line; service journal only the service line.
    expect((lastJournalLines())).toEqual([{ qty: 2, cost: 1000 }])
    const svcLines = mocks.onServiceGoodsReceipt.mock.calls[0][1] as Array<{ qty: number; cost: number }>
    expect(svcLines).toEqual([{ qty: 1, cost: 250000 }])
  })

  it("does not touch qtyOnHand for a service line", async () => {
    const { spies } = wireTx({
      grItems: [{ itemId: 7, qty: 3, unitCost: 100000 }],
      poItems: [{ itemId: 7, qty: 3, total: 300000 }],
      serviceItemIds: [7],
    })

    await onGoodsReceiptVerified(100, 1)

    // qty_on_hand is only bumped via $executeRaw UPDATE items ...; a service GR
    // must issue no such stock update.
    const stockUpdates = spies.executeRaw.mock.calls.filter(
      (c) => typeof c[0] === "string" && String(c[0]).includes("qty_on_hand"),
    )
    expect(stockUpdates).toHaveLength(0)
  })
})
