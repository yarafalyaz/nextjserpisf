import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  toBaseFactor: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumberBatch: mocks.generateDocumentNumberBatch }))
vi.mock("@/lib/services/inventory-fifo", () => ({ consumeFifoLayers: mocks.consumeFifoLayers }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

import { onPurchaseReturnProcessed, resolvePurchaseReturnWarehouse } from "@/lib/hooks/purchase-return.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 240 })
  mocks.toBaseFactor.mockResolvedValue(12)
})

describe("resolvePurchaseReturnWarehouse fallback chain", () => {
  it("prefers receipt warehouse, then default, active, any", () => {
    const receipt = new Map([[1, { warehouseId: null, goodsReceipt: { warehouseId: 2 } }], [3, { warehouseId: 7, goodsReceipt: { warehouseId: 2 } }]])
    const defaults = new Map([[1, 6], [2, 6], [4, null]])
    expect(resolvePurchaseReturnWarehouse(3, receipt, defaults, 5, 8)).toBe(7)
    expect(resolvePurchaseReturnWarehouse(1, receipt, defaults, 5, 8)).toBe(2)
    expect(resolvePurchaseReturnWarehouse(2, receipt, defaults, 5, 8)).toBe(6)
    expect(resolvePurchaseReturnWarehouse(4, receipt, defaults, 5, 8)).toBe(5)
    expect(resolvePurchaseReturnWarehouse(9, new Map(), new Map(), null, 8)).toBe(8)
    expect(resolvePurchaseReturnWarehouse(9, new Map(), new Map(), null, null)).toBeNull()
  })
})

function makeTx(overrides: {
  receiptItemFindMany?: ReturnType<typeof vi.fn>
  warehouseFindFirst?: ReturnType<typeof vi.fn>
  warehouseFindMany?: ReturnType<typeof vi.fn>
  itemFindMany?: ReturnType<typeof vi.fn>
  status?: string
} = {}) {
  const spies = {
    executeRaw: vi.fn().mockResolvedValue(1),
    queryRaw: vi.fn().mockResolvedValue([]),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
    returnFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 7,
      documentNo: "PR-7",
      purchaseOrderId: 4,
      date: new Date("2026-10-01"),
      status: overrides.status ?? "processing",
      items: [{ itemId: 3, qty: 2, cost: 120 }],
    }),
    receiptItemFindMany: overrides.receiptItemFindMany ?? vi.fn().mockResolvedValue([{
      itemId: 3,
      uom: "BOX",
      warehouseId: 2,
      goodsReceipt: { warehouseId: 1 },
    }]),
    warehouseFindFirst: overrides.warehouseFindFirst ?? vi.fn().mockResolvedValue({ id: 5 }),
    itemFindMany: overrides.itemFindMany ?? vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 6 }]),
    returnUpdate: vi.fn().mockResolvedValue({}),
    returnItemUpdate: vi.fn().mockResolvedValue({}),
    settingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
  }
  const tx = {
    $executeRaw: spies.executeRaw,
    $queryRaw: spies.queryRaw,
    purchaseReturn: { findUniqueOrThrow: spies.returnFindUniqueOrThrow, update: spies.returnUpdate },
    purchaseReturnItem: { update: spies.returnItemUpdate, findMany: vi.fn().mockResolvedValue([]) },
    vendorBill: { findFirst: vi.fn().mockResolvedValue(null) },
    taxInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    goodsReceiptItem: { findMany: spies.receiptItemFindMany },
    warehouse: {
      findFirst: spies.warehouseFindFirst,
      // Putaran 51: gudang sumber gerak keluar dinilai ulang hidup; default hidup.
      findMany: overrides.warehouseFindMany ?? vi.fn().mockResolvedValue([{ id: 2, name: "Gudang B", isActive: true }]),
    },
    item: { findMany: spies.itemFindMany },
    systemSetting: { findFirst: spies.settingFindFirst },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

describe("purchase return PO row lock (race cap kumulatif)", () => {
  it("kunci baris purchase_orders FOR UPDATE sesudah lock retur, sebelum cap/findUnique selesai", async () => {
    const { spies } = makeTx()
    await onPurchaseReturnProcessed(7, 9)
    // executeRaw pertama = lock purchase_returns; queryRaw wajib memuat lock PO.
    const sqls = spies.queryRaw.mock.calls.map((c) => Array.from(c[0] as TemplateStringsArray).join("?"))
    expect(sqls.some((s) => s.includes("purchase_orders") && s.includes("FOR UPDATE"))).toBe(true)
    expect(spies.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(spies.queryRaw.mock.invocationCallOrder[0])
    // findUniqueOrThrow return dipanggil sebelum lock PO (return memuat PO id) — kunci:
    // lock PO sesudah baca return dan sebelum update status/cap selesai.
    expect(spies.returnFindUniqueOrThrow.mock.invocationCallOrder[0]).toBeLessThan(spies.queryRaw.mock.invocationCallOrder[0])
  })

  it("tx stub tanpa $queryRaw tidak pecah (guard typeof, tanpa item aktif)", async () => {
    const { spies, tx } = makeTx()
    // Tanpa item aktif, jalur lama (lock items) pun tak menyentuh $queryRaw,
    // jadi satu-satunya pemakai $queryRaw adalah lock PO baru.
    spies.returnFindUniqueOrThrow.mockResolvedValue({
      id: 7,
      documentNo: "PR-7",
      purchaseOrderId: 4,
      date: new Date("2026-10-01"),
      status: "processing",
      items: [],
    })
    delete (tx as Record<string, unknown>).$queryRaw
    await expect(onPurchaseReturnProcessed(7, 9, tx as never)).resolves.toBeUndefined()
  })
})

describe("purchase return — gudang sumber mati (putaran 51)", () => {
  it("gudang asal penerimaan nonaktif → retur ditolak, FIFO tidak dikonsumsi", async () => {
    const { spies } = makeTx({
      warehouseFindMany: vi.fn().mockResolvedValue([{ id: 2, name: "Gudang B", isActive: false }]),
    })

    await expect(onPurchaseReturnProcessed(7, 9)).rejects.toThrow(/tidak aktif/)
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })

  it("gudang asal penerimaan terhapus (deletedAt) → retur ditolak, FIFO tidak dikonsumsi", async () => {
    const { spies } = makeTx({
      warehouseFindMany: vi.fn().mockResolvedValue([]),
    })

    await expect(onPurchaseReturnProcessed(7, 9)).rejects.toThrow(/tidak ditemukan/)
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
  })
})

describe("purchase return item lock order (putaran 76)", () => {
  it("mengunci item unik dalam urutan ID naik", async () => {
    const { spies } = makeTx()
    spies.returnFindUniqueOrThrow.mockResolvedValue({
      id: 7,
      documentNo: "PR-7",
      purchaseOrderId: 4,
      date: new Date("2026-10-01"),
      status: "processing",
      items: [
        { itemId: 9, qty: 1, cost: 100 },
        { itemId: 3, qty: 1, cost: 100 },
        { itemId: 9, qty: 1, cost: 100 },
      ],
    })
    spies.receiptItemFindMany.mockResolvedValue([
      { itemId: 3, uom: "PCS", warehouseId: 2, goodsReceipt: { warehouseId: 1 } },
      { itemId: 9, uom: "PCS", warehouseId: 2, goodsReceipt: { warehouseId: 1 } },
    ])
    spies.itemFindMany.mockResolvedValue([
      { id: 3, defaultWarehouseId: 2 },
      { id: 9, defaultWarehouseId: 2 },
    ])

    await onPurchaseReturnProcessed(7, 9)

    const itemLock = spies.queryRaw.mock.calls.find((call) => {
      const sql = Array.from(call[0] as TemplateStringsArray).join("?")
      return sql.includes("FROM items") && sql.includes("FOR UPDATE")
    })
    expect(itemLock).toBeDefined()
    expect((itemLock![1] as { values: unknown }).values).toEqual([3, 9])
  })
})

describe("purchase return UoM and receipt warehouse", () => {
  it("returns 2 BOX as 24 base units to the item's receipt warehouse", async () => {
    const { spies, tx } = makeTx()

    await onPurchaseReturnProcessed(7, 9)

    expect(mocks.toBaseFactor).toHaveBeenCalledWith(tx, 3, "BOX")
    expect(mocks.consumeFifoLayers).toHaveBeenCalledWith(tx, expect.objectContaining({
      itemId: 3,
      warehouseId: 2,
      qty: 24,
    }))
    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 3, warehouseId: 2, qty: 24 }),
    }))
    expect(spies.returnUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: { status: "returned" } }))
  })

  it("STOK-16: baris tertaut memakai UOM/gudang baris GR-nya sendiri, bukan receipt terbaru", async () => {
    const { spies, tx } = makeTx({
      // Urutan desc createdAt: baris terbaru PCS di gudang 8 dulu, lalu baris
      // tertaut BOX di gudang 2. Tanpa tautan hook akan memakai PCS/gudang 8.
      receiptItemFindMany: vi.fn().mockResolvedValue([
        { id: 21, itemId: 3, uom: "PCS", warehouseId: 8, goodsReceipt: { warehouseId: 9 } },
        { id: 20, itemId: 3, uom: "BOX", warehouseId: 2, goodsReceipt: { warehouseId: 1 } },
      ]),
    })
    spies.returnFindUniqueOrThrow.mockResolvedValue({
      id: 7,
      documentNo: "PR-7",
      purchaseOrderId: 4,
      date: new Date("2026-10-01"),
      status: "processing",
      items: [{ itemId: 3, qty: 2, cost: 120, goodsReceiptItemId: 20 }],
    })

    await onPurchaseReturnProcessed(7, 9)

    expect(mocks.toBaseFactor).toHaveBeenCalledWith(tx, 3, "BOX")
    expect(mocks.consumeFifoLayers).toHaveBeenCalledWith(tx, expect.objectContaining({
      itemId: 3,
      warehouseId: 2,
      qty: 24,
    }))
    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 3, warehouseId: 2, qty: 24 }),
    }))
  })

  // Regression: the purchase-return hook must record the serial units that left
  // stock (consumeFifoLayers marks them "used" for trackSerial items) on the
  // return line, so the document keeps the attribution.
  it("persists the consumed serials on the return line", async () => {
    const { spies } = makeTx({
      receiptItemFindMany: vi.fn().mockResolvedValue([{
        itemId: 3, uom: "PCS", warehouseId: 2, goodsReceipt: { warehouseId: 1 },
      }]),
    })
    // Serial test's return line carries its own id (42) for the update assertion.
    spies.returnFindUniqueOrThrow.mockResolvedValue({
      id: 7,
      documentNo: "PR-7",
      purchaseOrderId: 4,
      date: new Date("2026-10-01"),
      status: "processing",
      items: [{ id: 42, itemId: 3, qty: 2, cost: 120 }],
    })
    mocks.toBaseFactor.mockResolvedValue(1)
    mocks.consumeFifoLayers.mockResolvedValue({
      consumedCost: 240,
      consumedSerials: ["SN-9", "SN-10"],
      shortfall: 0,
    })

    await onPurchaseReturnProcessed(7, 9)

    expect(spies.returnItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: { serialNumbers: ["SN-9", "SN-10"] } }),
    )
  })
})
