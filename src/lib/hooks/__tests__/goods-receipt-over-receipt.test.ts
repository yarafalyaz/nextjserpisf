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

interface GrItem { itemId: number; qty: number; unitCost?: number; uom?: string | null; batchNumber?: string | null; expiryDate?: Date | null; serialNumbers?: unknown }

function wireTx(opts: {
  poId: number | null
  grItems: GrItem[]
  poItems: Array<{ itemId: number; qty: number }>
  priorGrItems: Array<{ itemId: number; qty: number }>
}) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    grFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100, documentNo: "GR-001", status: "draft",
      purchaseOrderId: opts.poId, warehouseId: 1,
      items: opts.grItems,
      purchaseOrder: opts.poId ? { id: opts.poId } : null,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null), // not yet processed
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    grUpdate: vi.fn().mockResolvedValue({}),
    poItemFindMany: vi.fn().mockResolvedValue(opts.poItems),
    grItemFindMany: vi.fn().mockResolvedValue(opts.priorGrItems),
    poUpdate: vi.fn().mockResolvedValue({}),
    itemFindUnique: vi.fn().mockResolvedValue({ unitOfMeasure: "pcs", trackBatch: false, trackSerial: false }),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    goodsReceipt: { findUniqueOrThrow: spies.grFindUniqueOrThrow, update: spies.grUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
    goodsReceiptItem: { findMany: spies.grItemFindMany },
    purchaseOrder: { update: spies.poUpdate },
    item: { findUnique: spies.itemFindUnique },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return spies
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
    const spies = wireTx({
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
    const spies = wireTx({
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
    const spies = wireTx({
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
})
