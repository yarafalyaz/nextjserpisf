import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumberBatch: mocks.generateDocumentNumberBatch }))
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: mocks.createInLayer }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onSalesReturnCompleted } from "@/lib/hooks/sales-return.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.toBaseFactor.mockResolvedValue(12)
})

/** Build a fully-stubbed tx and wire it into the prisma.$transaction mock. */
function wireTx(overrides: {
  items: { itemId: number; qty: number; cost: number; serialNumbers?: string[]; batchNumbers?: string[] }[]
  itemRows: Array<{ id: number; defaultWarehouseId: number | null; trackSerial?: boolean; trackBatch?: boolean; isProduct?: boolean }>
  invoiceItemRows: Array<{ itemId: number; uom: string | null }>
  serialFindMany: ReturnType<typeof vi.fn>
  serialUpdateMany?: ReturnType<typeof vi.fn>
  batchFindFirst?: ReturnType<typeof vi.fn>
  batchCreate?: ReturnType<typeof vi.fn>
  batchUpdate?: ReturnType<typeof vi.fn>
}) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    returnFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 7,
      salesInvoiceId: 4,
      date: new Date("2026-10-01"),
      status: "draft",
      items: overrides.items,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
    warehouseFindFirst: vi.fn().mockResolvedValue({ id: 5 }),
    itemFindMany: vi.fn().mockResolvedValue(overrides.itemRows),
    invoiceItemFindMany: vi.fn().mockResolvedValue(overrides.invoiceItemRows),
    serialFindMany: overrides.serialFindMany,
    serialUpdateMany: overrides.serialUpdateMany ?? vi.fn().mockResolvedValue({ count: 0 }),
    batchFindFirst: overrides.batchFindFirst ?? vi.fn().mockResolvedValue(null),
    batchCreate: overrides.batchCreate ?? vi.fn().mockResolvedValue({}),
    batchUpdate: overrides.batchUpdate ?? vi.fn().mockResolvedValue({}),
    systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    returnUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    salesReturn: { findUniqueOrThrow: spies.returnFindUniqueOrThrow, update: spies.returnUpdate },
    salesInvoice: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 4, items: overrides.items }) },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    warehouse: { findFirst: spies.warehouseFindFirst },
    item: { findMany: spies.itemFindMany },
    itemSerial: { findMany: spies.serialFindMany, updateMany: spies.serialUpdateMany },
    itemBatch: { findFirst: spies.batchFindFirst, create: spies.batchCreate, update: spies.batchUpdate },
    salesInvoiceItem: { findMany: spies.invoiceItemFindMany },
    systemSetting: { findFirst: spies.systemSettingFindFirst },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

describe("sales return UoM", () => {
  it("returns 2 BOX as 24 base units and values the inventory layer per base unit", async () => {
    const { spies, tx } = wireTx({
      items: [{ itemId: 3, qty: 2, cost: 120 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5 }],
      invoiceItemRows: [{ itemId: 3, uom: "BOX" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 3, qty: 24, cost: 10 }),
    }))
    expect(mocks.createInLayer).toHaveBeenCalledWith(tx, expect.objectContaining({ qty: 24, unitCost: 10 }))
    expect(spies.returnUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: { status: "completed" } }))
  })

  // P1-1: hanya serial yang disebut eksplisit yang direvive (identitas fisik
  // yang benar-benar kembali). Merevive "used terbaru" salah: bisa menghidupkan
  // serial yang masih di tangan pelanggan lain.
  it("revives ONLY the named serials for a serial-tracked item", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    const { spies } = wireTx({
      items: [{ itemId: 3, qty: 2, cost: 100, serialNumbers: ["SN-A", "SN-B"] }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([
        { id: 91, serialNumber: "SN-A", status: "used" },
        { id: 92, serialNumber: "SN-B", status: "used" },
      ]),
      serialUpdateMany: vi.fn().mockResolvedValue({ count: 2 }),
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.serialFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemId: 3, serialNumber: { in: ["SN-A", "SN-B"] } } })
    )
    expect(spies.serialUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [91, 92] } },
        data: { status: "available", warehouseId: 5 },
      })
    )
  })

  it("rejects an unknown serial instead of reviving a stranger", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    wireTx({
      items: [{ itemId: 3, qty: 1, cost: 100, serialNumbers: ["SN-X"] }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await expect(onSalesReturnCompleted(7, 9)).rejects.toThrow(/tak dikenal/)
  })

  it("rejects a serial that is not used (cannot be returned)", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    wireTx({
      items: [{ itemId: 3, qty: 1, cost: 100, serialNumbers: ["SN-A"] }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([
        { id: 91, serialNumber: "SN-A", status: "available" },
      ]),
    })

    await expect(onSalesReturnCompleted(7, 9)).rejects.toThrow(/terpakai/)
  })

  it("rejects a tracked item with no identity at all", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    wireTx({
      items: [{ itemId: 3, qty: 1, cost: 100 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await expect(onSalesReturnCompleted(7, 9)).rejects.toThrow(/nomor seri/)
  })

  it("records the named batch on the layer and rebuilds the lot (P1-1)", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    const { spies, tx } = wireTx({
      items: [{ itemId: 3, qty: 4, cost: 100, batchNumbers: ["LOT-9"] }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackBatch: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    expect(mocks.createInLayer).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ batchNumber: "LOT-9", qty: 4 })
    )
    expect(spies.batchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemId: 3, warehouseId: 5, batchNumber: "LOT-9" } })
    )
    expect(spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "LOT-9", qty: 4 }) })
    )
  })

  it("creates ONE layer per lot for a multi-batch return (bukan layer gabungan)", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    const { spies, tx } = wireTx({
      items: [{ itemId: 3, qty: 10, cost: 100, batchNumbers: ["LOT-A", "LOT-B"] }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackBatch: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    // Layer gabungan "LOT-A, LOT-B" tak pernah ditemukan konsumsi FIFO.
    expect(mocks.createInLayer).toHaveBeenCalledTimes(2)
    expect(mocks.createInLayer).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ batchNumber: "LOT-A", qty: 5 })
    )
    expect(mocks.createInLayer).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ batchNumber: "LOT-B", qty: 5 })
    )
    expect(mocks.createInLayer).not.toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ batchNumber: "LOT-A, LOT-B" })
    )
    expect(spies.batchCreate).toHaveBeenCalledTimes(2)
    expect(spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "LOT-A", qty: 5 }) })
    )
    expect(spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "LOT-B", qty: 5 }) })
    )
  })

  it("rejects a batch-tracked item with no batch identity", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    wireTx({
      items: [{ itemId: 3, qty: 1, cost: 100 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackBatch: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await expect(onSalesReturnCompleted(7, 9)).rejects.toThrow(/batch/)
  })
})

/** Rakit tx stok generik: retur + klasifikasi item + StockMove/warehouse. */
function wireStockTx(opts: {
  items: { itemId: number; qty: number; cost: number }[]
  itemRows: Array<Record<string, unknown>>
}) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    salesReturn: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 7,
        salesInvoiceId: 4,
        date: new Date("2026-10-01"),
        status: "draft",
        items: opts.items,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    salesInvoice: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 4, items: opts.items }),
    },
    item: { findMany: vi.fn().mockResolvedValue(opts.itemRows) },
    stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
    salesInvoiceItem: { findMany: vi.fn().mockResolvedValue([]) },
    systemSetting: { findFirst: vi.fn().mockResolvedValue({ periodLockDate: null }) },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

// E136-3 (stock hook, F-137-V tahap 2): retur besi tua murni completed
// dengan NOL StockMove IN, nol lapisan FIFO, nol qtyOnHand — hanya status.
// Cost master Rp750.000 sengaja: satu pun gerakan stok lahir = MERAH.
describe("sales return scrap E136 tahap 2", () => {
  it("E136-3 stok: retur scrap completed nol StockMove/FIFO/qtyOnHand", async () => {
    const { spies, tx } = wireStockTx({
      items: [{ itemId: 60, qty: 2, cost: 750000 }],
      itemRows: [{ id: 60, isScrapSaleItem: true }],
    })

    await onSalesReturnCompleted(7, 9)
    expect(tx.stockMove.create).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
    expect(tx.salesReturn.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { status: "completed" } })
    )
  })

  it("E136-campuran stok: retur campuran scrap+dagang ditolak nol StockMove", async () => {
    const { spies, tx } = wireStockTx({
      items: [
        { itemId: 60, qty: 1, cost: 10 },
        { itemId: 50, qty: 1, cost: 10 },
      ],
      itemRows: [
        { id: 60, isScrapSaleItem: true },
        { id: 50, isScrapSaleItem: false },
      ],
    })

    await expect(onSalesReturnCompleted(7, 9)).rejects.toThrow(/campuran besi tua/)
    expect(tx.stockMove.create).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
    expect(tx.salesReturn.update).not.toHaveBeenCalled()
  })
})

// F-2026-10-28-137-V SAL-BR-013 G2 (opsi a, E141-4): retur baris jasa
// (isProduct=false) = koreksi nilai tanpa stok — nol StockMove IN, nol
// lapisan FIFO, nol qtyOnHand; status tetap completed.
describe("sales return jasa non-stok G2", () => {
  it("E141-4 stok: retur baris jasa completed nol StockMove/FIFO/qtyOnHand", async () => {
    const { spies, tx } = wireTx({
      items: [{ itemId: 61, qty: 2, cost: 100 }],
      itemRows: [{ id: 61, defaultWarehouseId: 5, isProduct: false }],
      invoiceItemRows: [{ itemId: 61, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
    expect(spies.returnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { status: "completed" } })
    )
    expect(tx).toBeDefined()
  })

  it("E141-4 campuran: baris stok tetap masuk, baris jasa dilewati", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
    const { spies } = wireTx({
      items: [
        { itemId: 50, qty: 1, cost: 100 },
        { itemId: 61, qty: 1, cost: 200 },
      ],
      itemRows: [
        { id: 50, defaultWarehouseId: 5, isProduct: true },
        { id: 61, defaultWarehouseId: 5, isProduct: false },
      ],
      invoiceItemRows: [
        { itemId: 50, uom: "PCS" },
        { itemId: 61, uom: "PCS" },
      ],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect(spies.moveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemId: 50 }) })
    )
    expect(spies.moveCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemId: 61 }) })
    )
    expect(mocks.createInLayer).toHaveBeenCalledTimes(1)
  })
})