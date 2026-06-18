import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the over-receipt guard (58462fc): onGoodsReceiptVerified
// must reject when cumulative received qty (prior verified GR items + this GR)
// exceeds the PO ordered qty. Hard cap, no tolerance. Also verifies the within-
// limit path passes the guard (reaches stock-move creation).

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  generateDocumentNumberBatch: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  onGoodsReceipt: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
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
      date: new Date("2024-06-15"),
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
    systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
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
    systemSetting: { findFirst: spies.systemSettingFindFirst },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`)
  mocks.generateDocumentNumberBatch.mockImplementation(async (_key: string, count: number) =>
    Array.from({ length: count }, () => `SM-${++n}`)
  )
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

// Regression test: the goods-receipt GL journal flows through stockJournalService
// (bypassing accounting.hook), so the hook must itself enforce the closed-period
// guard using goodsReceipt.date — otherwise a back-dated GR can post GL into a
// period that the AR/AP/expense paths already block.
describe("onGoodsReceiptVerified period lock", () => {
  it("rejects when goodsReceipt.date is on or before the period lock date", async () => {
    const { spies } = wireTx({
      poId: null,
      poItems: [],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 1 }],
    })
    spies.grFindUniqueOrThrow.mockResolvedValueOnce({
      id: 100, documentNo: "GR-001", status: "draft",
      purchaseOrderId: null, warehouseId: 1,
      date: new Date("2024-01-15"), // back-dated, inside locked period
      items: [{ itemId: 7, qty: 1 }],
      purchaseOrder: null,
    })
    spies.systemSettingFindFirst.mockResolvedValueOnce({
      periodLockDate: new Date("2024-01-31"),
    })

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/Periode akuntansi sudah ditutup/)
    // Must not have created any stock moves or journals for a closed-period GR.
    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.onGoodsReceipt).not.toHaveBeenCalled()
  })

  it("passes when goodsReceipt.date is after the period lock date", async () => {
    const { spies } = wireTx({
      poId: null,
      poItems: [],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 1 }],
    })
    // default grFindUniqueOrThrow return already has date=2024-06-15
    spies.systemSettingFindFirst.mockResolvedValueOnce({
      periodLockDate: new Date("2024-01-31"),
    })

    await expect(onGoodsReceiptVerified(100, 1)).resolves.toBeUndefined()
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
  })
})

// Regression test: GR with a non-base UoM must post the GL journal at the
// BASE-converted qty*cost (matching the stock move + FIFO layer), not the
// raw entered values. Previously the journal was rebuilt from i.qty / i.unitCost
// so e.g. a GR of 1 BOX @ 12000 (= 12 PCS @ 1000) posted a 12000 Dr Inventory
// while the stock subledger recorded 12 PCS @ 1000 (= 12000) — the same total
// here, but mismatched per-line. More importantly, when the UoM scaling is
// asymmetric (e.g. 1 TON @ 8000 = 1000 KG @ 8), the journal was off by the
// factor entirely.
describe("onGoodsReceiptVerified multi-UoM journal consistency", () => {
  function wireTxWithUom(grItems: GrItem[], conversions: Array<{ itemId: number; code: string; factorToBase: number }>) {
    const { spies, tx } = wireTx({
      poId: null,
      poItems: [],
      priorGrItems: [],
      grItems,
      itemMeta: { unitOfMeasure: "PCS", trackBatch: false, trackSerial: false },
    })
    spies.uomConversionFindMany.mockResolvedValue(conversions)
    return { spies, tx }
  }

  it("passes base-converted qty + unitCost to the journal when line uses a non-base UoM", async () => {
    // Entered: 2 BOX @ 6000 each (uom=BOX, factor=12 -> 24 PCS @ 500 each)
    // Stock move must be 24 PCS @ 500 (base), and journal must agree.
    const { spies } = wireTxWithUom(
      [{ itemId: 7, qty: 2, unitCost: 6000, uom: "BOX" }],
      [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    )

    await onGoodsReceiptVerified(100, 1)

    // Stock move: base qty + base unit cost.
    const moveCall = spies.moveCreate.mock.calls[0][0] as { data: { qty: number; cost: number } }
    expect(moveCall.data.qty).toBe(24)
    expect(moveCall.data.cost).toBe(500)

    // Journal: SAME base values, NOT the raw entered (2, 6000).
    expect(mocks.onGoodsReceipt).toHaveBeenCalledTimes(1)
    const journalArgs = mocks.onGoodsReceipt.mock.calls[0] as unknown[]
    const journalLines = journalArgs[1] as Array<{ qty: number; cost: number }>
    expect(journalLines).toEqual([{ qty: 24, cost: 500 }])
    // Guard against regression to the old path that used raw i.qty / i.unitCost.
    expect(journalLines[0].qty).not.toBe(2)
    expect(journalLines[0].cost).not.toBe(6000)
  })

  it("keeps journal == stock move even when the UoM factor is asymmetric (TON -> KG)", async () => {
    // Entered: 1 TON @ 8000 (factor 1000 -> 1000 KG @ 8 each)
    const { spies } = wireTxWithUom(
      [{ itemId: 7, qty: 1, unitCost: 8000, uom: "TON" }],
      [{ itemId: 7, code: "TON", factorToBase: 1000 }],
    )

    await onGoodsReceiptVerified(100, 1)

    const moveCall = spies.moveCreate.mock.calls[0][0] as { data: { qty: number; cost: number } }
    expect(moveCall.data.qty).toBe(1000)
    expect(moveCall.data.cost).toBe(8)

    const journalArgs = mocks.onGoodsReceipt.mock.calls[0] as unknown[]
    const journalLines = journalArgs[1] as Array<{ qty: number; cost: number }>
    expect(journalLines).toEqual([{ qty: 1000, cost: 8 }])
  })
})

// Regression test for the over-receipt guard under multi-UoM. The PO is always
// in the item's BASE unit of measure (PurchaseOrderItem has no UoM field), but
// GR lines may be received in any UoM. The guard must sum in base units, not
// raw entered qty, or it will either (a) flag a 1-BOX GR against a 12-PCS PO
// as a 13× over-receipt (false positive) or (b) let a 13-BOX GR against a
// 12-PCS PO slip through (false negative, 13 < 12 only if compared raw).
describe("onGoodsReceiptVerified over-receipt guard with multi-UoM", () => {
  function wireUomTx(opts: {
    poItems: Array<{ itemId: number; qty: number }>
    priorGrItems: Array<{ itemId: number; qty: number; uom?: string | null }>
    currentGrItems: GrItem[]
    conversions: Array<{ itemId: number; code: string; factorToBase: number }>
    itemMeta?: { unitOfMeasure?: string; trackBatch?: boolean; trackSerial?: boolean }
  }) {
    const meta = opts.itemMeta ?? { unitOfMeasure: "PCS", trackBatch: false, trackSerial: false }
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
        items: opts.currentGrItems,
        purchaseOrder: { id: 50 },
      }),
      moveFindFirst: vi.fn().mockResolvedValue(null),
      moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      grUpdate: vi.fn().mockResolvedValue({}),
      poItemFindMany: vi.fn().mockResolvedValue(opts.poItems),
      grItemFindMany: vi.fn().mockResolvedValue(opts.priorGrItems),
      poUpdate: vi.fn().mockResolvedValue({}),
      itemFindUnique: vi.fn().mockResolvedValue(meta),
      itemFindMany: vi.fn().mockResolvedValue(
        [...new Set([
          ...opts.currentGrItems.map((g) => g.itemId),
          ...opts.priorGrItems.map((g) => g.itemId),
        ])].map((id) => ({ id, ...meta }))
      ),
      uomConversionFindMany: vi.fn().mockResolvedValue(opts.conversions),
      itemBatchFindFirst: vi.fn().mockResolvedValue(null),
      itemBatchCreate: vi.fn().mockResolvedValue({}),
      itemBatchUpdate: vi.fn().mockResolvedValue({}),
      itemSerialCreate: vi.fn().mockResolvedValue({}),
      itemSerialCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
      systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
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
      systemSetting: { findFirst: spies.systemSettingFindFirst },
    }
    mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
    return { spies, tx }
  }

  it("rejects when cumulative received (in base units) exceeds PO qty, even if entered UoM inflates the raw count", async () => {
    // PO: 12 PCS. Prior GR: 5 BOX (= 60 PCS). Current GR: 1 BOX (= 12 PCS).
    // Cumulative: 72 PCS > 12 PCS ordered — must reject. The old raw-qty path
    // would have summed 5 + 1 = 6 and PASSED, missing a 6× over-receipt.
    const { spies } = wireUomTx({
      poItems: [{ itemId: 7, qty: 12 }],
      priorGrItems: [{ itemId: 7, qty: 5, uom: "BOX" }],
      currentGrItems: [{ itemId: 7, qty: 1, uom: "BOX" }],
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    })

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/melebihi pesanan/)
    // Must not have created stock moves for an over-receipt attempt.
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })

  it("accepts when raw-entered UoM qty LOOKS like over-receipt but base-unit total is within PO", async () => {
    // PO: 12 PCS. Prior GR: 0. Current GR: 1 BOX (= 12 PCS). 12 == 12 → allowed.
    // Old raw-qty path would compare 1 vs 12 and PASS for the wrong reason
    // (the over-receipt guard became a no-op for any UoM != base unit).
    // The fix is correctness-neutral here but catches the other direction in
    // the test above; this test pins the within-limit path under UoM.
    const { spies } = wireUomTx({
      poItems: [{ itemId: 7, qty: 12 }],
      priorGrItems: [],
      currentGrItems: [{ itemId: 7, qty: 1, uom: "BOX" }],
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    })

    await onGoodsReceiptVerified(100, 1)
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect(spies.grUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "verified" }) }),
    )
  })

  it("sums prior GR + current GR in base units when only the prior GR uses a non-base UoM", async () => {
    // PO: 100 PCS. Prior GR: 4 BOX (= 48 PCS). Current GR: 50 PCS. Cumulative:
    // 98 PCS <= 100 → allowed. Old raw path: 4 + 50 = 54 vs 100, also passes
    // by coincidence — but the next test shows the cumulative edge.
    // This test pins the base-conversion of the prior GR specifically.
    const { spies } = wireUomTx({
      poItems: [{ itemId: 7, qty: 100 }],
      priorGrItems: [{ itemId: 7, qty: 4, uom: "BOX" }],
      currentGrItems: [{ itemId: 7, qty: 50 }], // no uom → base unit
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    })

    await onGoodsReceiptVerified(100, 1)
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
  })

  it("rejects when prior + current cross the PO limit in base units (4 BOX + 1 BOX > 5 BOX PO would be wrong; here 5 BOX PO = 60 PCS)", async () => {
    // PO: 5 BOX (60 PCS in base). Prior GR: 4 BOX (48 PCS). Current GR: 2 BOX
    // (24 PCS). Cumulative 72 PCS > 60 PCS → reject. Old raw path: 4 + 2 = 6
    // vs 5, would also reject — but for the wrong reason (raw inflation), and
    // would let 4 BOX + 1 BOX (= 60 PCS == 60 PCS PO) through as 5 vs 5.
    const { spies } = wireUomTx({
      poItems: [{ itemId: 7, qty: 5 }], // PO says 5 BOX = 60 PCS
      priorGrItems: [{ itemId: 7, qty: 4, uom: "BOX" }],
      currentGrItems: [{ itemId: 7, qty: 2, uom: "BOX" }],
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    })

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/melebihi pesanan/)
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })
})
