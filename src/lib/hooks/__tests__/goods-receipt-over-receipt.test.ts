import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the over-receipt guard (58462fc): onGoodsReceiptVerified
// must reject when cumulative received qty (prior verified GR items + this GR)
// exceeds the PO ordered qty. Hard cap, no tolerance. Also verifies the within-
// limit path passes the guard (reaches stock-move creation).

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  onGoodsReceipt: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: mocks.createInLayer }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onGoodsReceipt: mocks.onGoodsReceipt },
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
  poId: number | null
  grItems: GrItem[]
  poItems: Array<{ itemId: number; qty: number }>
  priorGrItems: Array<{ itemId: number; qty: number }>
  itemMeta?: { unitOfMeasure?: string; trackBatch?: boolean; trackSerial?: boolean }
}) {
  const meta = opts.itemMeta ?? { unitOfMeasure: "pcs", trackBatch: false, trackSerial: false }
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    grFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "GR-001",
      status: "draft",
      purchaseOrderId: opts.poId,
      warehouseId: 1,
      items: opts.grItems,
      purchaseOrder: opts.poId ? { id: opts.poId } : null,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null), // not yet processed
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    grUpdate: vi.fn().mockResolvedValue({}),
    poItemFindMany: vi.fn().mockResolvedValue(opts.poItems),
    grItemFindMany: vi.fn().mockResolvedValue(opts.priorGrItems),
    poUpdate: vi.fn().mockResolvedValue({}),
    itemFindUnique: vi.fn().mockResolvedValue(meta),
    // New: bulk pre-fetch hoisted out of the per-item loop.
    itemFindMany: vi.fn().mockResolvedValue(
      // Match the per-itemId dedup the hook builds. Return one entry per unique
      // grItems itemId, each with the shared `meta` from opts.
      [...new Set(opts.grItems.map((g) => g.itemId))].map((id) => ({ id, ...meta }))
    ),
    uomConversionFindMany: vi.fn().mockResolvedValue([]),
    itemBatchFindFirst: vi.fn().mockResolvedValue(null),
    itemBatchCreate: vi.fn().mockResolvedValue({}),
    itemBatchUpdate: vi.fn().mockResolvedValue({}),
    itemSerialCreate: vi.fn().mockResolvedValue({}),
    itemSerialCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    goodsReceipt: { findUniqueOrThrow: spies.grFindUniqueOrThrow, update: spies.grUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
    goodsReceiptItem: { findMany: spies.grItemFindMany },
    purchaseOrder: { update: spies.poUpdate },
    item: { findUnique: spies.itemFindUnique, findMany: spies.itemFindMany },
    uomConversion: { findMany: spies.uomConversionFindMany },
    itemBatch: { findFirst: spies.itemBatchFindFirst, create: spies.itemBatchCreate, update: spies.itemBatchUpdate },
    itemSerial: { create: spies.itemSerialCreate, createMany: spies.itemSerialCreateMany },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`)
  mocks.toBaseFactor.mockResolvedValue(1)
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.onGoodsReceipt.mockResolvedValue(undefined)
})

describe("onGoodsReceiptVerified over-receipt guard", () => {
  it("throws when cumulative received exceeds ordered qty", async () => {
    // PO ordered 10 of item 7; a prior verified GR received 8; this GR adds 5
    // -> cumulative 13 > 10 -> reject.
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ itemId: 7, qty: 10 }],
      priorGrItems: [{ itemId: 7, qty: 8 }],
      grItems: [{ itemId: 7, qty: 5 }],
    })

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/melebihi pesanan/)
    // Locked the PO row, but never created stock moves (threw before step 3).
    expect(spies.queryRaw).toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })

  it("passes the guard and posts stock when within ordered qty", async () => {
    // PO ordered 10; prior 4; this GR adds 6 -> cumulative 10 == 10 -> allowed.
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ itemId: 7, qty: 10 }],
      priorGrItems: [{ itemId: 7, qty: 4 }],
      grItems: [{ itemId: 7, qty: 6 }],
    })

    await onGoodsReceiptVerified(100, 1)
    expect(spies.moveCreate).toHaveBeenCalledTimes(1) // reached stock-in
    expect(spies.grUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "verified" }) }),
    )
  })

  it("is idempotent: silent no-op when stock moves already exist", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ itemId: 7, qty: 10 }],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 5 }],
    })
    spies.moveFindFirst.mockResolvedValue({ id: 1 }) // already processed
    await onGoodsReceiptVerified(100, 1)
    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(spies.poItemFindMany).not.toHaveBeenCalled()
  })

  it("returns silently when goods receipt is already verified (idempotency)", async () => {
    const { spies } = wireTx({
      poId: 50, poItems: [{ itemId: 7, qty: 10 }], priorGrItems: [],
      grItems: [{ itemId: 7, qty: 5 }],
    })
    spies.grFindUniqueOrThrow.mockResolvedValueOnce({
      id: 100, documentNo: "GR-001", status: "verified",
      purchaseOrderId: 50, warehouseId: 1,
      items: [{ itemId: 7, qty: 5 }],
      purchaseOrder: { id: 50 },
    })
    await onGoodsReceiptVerified(100, 1)
    // No new stock moves; no PO update
    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(spies.poUpdate).not.toHaveBeenCalled()
  })
})

describe("onGoodsReceiptVerified PO status updates", () => {
  it("updates PO to RECEIVED when all items are fully received", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ itemId: 7, qty: 10 }, { itemId: 8, qty: 5 }],
      priorGrItems: [{ itemId: 7, qty: 10 }], // item 7 was fully received before
      grItems: [{ itemId: 8, qty: 5 }], // this GR receives all of item 8
    })
    await onGoodsReceiptVerified(100, 1)
    expect(spies.poUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received" } })
    )
  })

  it("updates PO to partial_received when some items fall short", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ itemId: 7, qty: 10 }],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 5 }], // only half
    })
    await onGoodsReceiptVerified(100, 1)
    expect(spies.poUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "partial_received" } })
    )
  })
})

describe("onGoodsReceiptVerified stock tracking modules", () => {
  it("registers new batch when item has trackBatch=true and batch doesn't exist", async () => {
    const { spies } = wireTx({
      poId: 50, poItems: [{ itemId: 7, qty: 10 }], priorGrItems: [],
      grItems: [{ itemId: 7, qty: 10, batchNumber: "B001", expiryDate: new Date("2026-12-31") }],
      itemMeta: { trackBatch: true },
    })
    spies.itemBatchFindFirst.mockResolvedValue(null) // batch doesn't exist
    await onGoodsReceiptVerified(100, 1)
    expect(spies.itemBatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "B001", qty: 10 }) })
    )
  })

  it("increments existing batch when trackBatch=true and batch exists", async () => {
    const { spies } = wireTx({
      poId: 50, poItems: [{ itemId: 7, qty: 10 }], priorGrItems: [],
      grItems: [{ itemId: 7, qty: 10, batchNumber: "B001" }],
      itemMeta: { trackBatch: true },
    })
    spies.itemBatchFindFirst.mockResolvedValue({ id: 99 }) // existing batch
    await onGoodsReceiptVerified(100, 1)
    expect(spies.itemBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({ qty: { increment: 10 } }),
      })
    )
  })

  it("creates serial records when item has trackSerial=true", async () => {
    const { spies } = wireTx({
      poId: 50, poItems: [{ itemId: 7, qty: 2 }], priorGrItems: [],
      grItems: [{ itemId: 7, qty: 2, serialNumbers: ["S1", "S2"] }],
      itemMeta: { trackSerial: true },
    })
    await onGoodsReceiptVerified(100, 1)
    expect(spies.itemSerialCreateMany).toHaveBeenCalledTimes(1)
    expect(spies.itemSerialCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ serialNumber: "S1" }),
          expect.objectContaining({ serialNumber: "S2" }),
        ]),
      })
    )
  })

  it("throws when serial numbers array length doesn't match received qty", async () => {
    wireTx({
      poId: 50, poItems: [{ itemId: 7, qty: 2 }], priorGrItems: [],
      grItems: [{ itemId: 7, qty: 2, serialNumbers: ["S1"] }], // 1 serial for 2 qty
      itemMeta: { trackSerial: true },
    })
    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/tidak sama dengan qty diterima/)
  })
})
