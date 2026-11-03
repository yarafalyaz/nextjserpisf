import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * ROUND5-SCOPE: loader laporan stok yang dulu tak menerima scope kini
 * menapis gudang — penghitungan-stok, nomor-seri-batch, umur-stok.
 * (transfer-terkirim + stok-minimum diuji di file loader masing-masing.)
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    stockAdjustment: { findMany: vi.fn() },
    itemSerial: { findMany: vi.fn() },
    itemBatch: { findMany: vi.fn() },
    item: { findMany: vi.fn(), count: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
    stockMove: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadStockCount } from "../stock-count-data"
import { loadSerialBatchStock } from "../serial-batch-stock-data"
import { loadStockAging, loadStockReconciliation, loadStockSummary } from "../stock-simple-data"
import { loadSlowMovingStock } from "../slow-moving-stock-data"

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.stockAdjustment.findMany.mockResolvedValue([])
  mocks.prismaMock.itemSerial.findMany.mockResolvedValue([])
  mocks.prismaMock.itemBatch.findMany.mockResolvedValue([])
  mocks.prismaMock.item.count.mockResolvedValue(0)
  mocks.prismaMock.item.findMany.mockResolvedValue([])
  mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
  mocks.prismaMock.warehouse.findMany.mockResolvedValue([])
  mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
})

describe("cakupan gudang loader laporan stok (ROUND5-SCOPE)", () => {
  it("loadStockCount: scope [2] masuk where warehouseId", async () => {
    await loadStockCount(PERIOD, [2])
    const arg = mocks.prismaMock.stockAdjustment.findMany.mock.calls[0][0]
    expect(arg.where.warehouseId).toEqual({ in: [2] })
    expect(arg.where.deletedAt).toBeNull()
  })

  it("loadStockCount: tanpa scope tidak ada tapis gudang (perilaku lama)", async () => {
    await loadStockCount(PERIOD)
    const arg = mocks.prismaMock.stockAdjustment.findMany.mock.calls[0][0]
    expect(arg.where.warehouseId).toBeUndefined()
  })

  it("putaran 52: loadStockAging dan loadStockSummary menapis item nonaktif/terhapus di where", async () => {
    await loadStockAging([2])
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ item: { isActive: true, deletedAt: null } }),
    )
    await loadStockSummary([2])
    const layerCall = mocks.prismaMock.inventoryLayer.findMany.mock.calls[1][0]
    expect(layerCall.where).toEqual(
      expect.objectContaining({ item: { isActive: true, deletedAt: null } }),
    )
  })

  it("loadSerialBatchStock: tanpa pilihan gudang, scope [2] menapis serial+batch", async () => {
    await loadSerialBatchStock({ warehouseId: null, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [2] },
      status: { in: ["available", "reserved"] },
      item: { isActive: true, deletedAt: null },
    })
    expect(mocks.prismaMock.itemBatch.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [2] },
      qty: { gt: 0 },
      item: { isActive: true, deletedAt: null },
    })
  })

  it("loadSerialBatchStock: gudang terpilih 9 di luar scope [2] -> kosong paksa", async () => {
    await loadSerialBatchStock({ warehouseId: 9, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [] },
      status: { in: ["available", "reserved"] },
      item: { isActive: true, deletedAt: null },
    })
  })

  it("loadSerialBatchStock: gudang terpilih 2 di dalam scope [2] -> tapis tunggal", async () => {
    await loadSerialBatchStock({ warehouseId: 2, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: 2,
      status: { in: ["available", "reserved"] },
      item: { isActive: true, deletedAt: null },
    })
  })

  it("loadSerialBatchStock: seri used/sold dan batch habis bukan posisi stok — saring di where", async () => {
    const serialRows = [
      { serialNumber: "SN-OK", status: "available", item: { sku: "A", name: "Item A", isActive: true, deletedAt: null }, warehouse: { name: "Gudang A" } },
      { serialNumber: "SN-USED", status: "used", item: { sku: "A", name: "Item A", isActive: true, deletedAt: null }, warehouse: { name: "Gudang A" } },
      { serialNumber: "SN-SOLD", status: "sold", item: { sku: "A", name: "Item A", isActive: true, deletedAt: null }, warehouse: { name: "Gudang A" } },
      { serialNumber: "SN-XITEM", status: "available", item: { sku: "B", name: "Item B", isActive: false, deletedAt: new Date() }, warehouse: { name: "Gudang A" } },
    ]
    const batchRows = [
      { batchNumber: "B-OK", qty: 5, manufacturingDate: null, expiryDate: null, item: { sku: "A", name: "Item A", cost: 100, isActive: true, deletedAt: null }, warehouse: { name: "Gudang A" } },
      { batchNumber: "B-ZERO", qty: 0, manufacturingDate: null, expiryDate: null, item: { sku: "A", name: "Item A", cost: 100, isActive: true, deletedAt: null }, warehouse: { name: "Gudang A" } },
      { batchNumber: "B-XITEM", qty: 5, manufacturingDate: null, expiryDate: null, item: { sku: "B", name: "Item B", cost: 100, isActive: false, deletedAt: new Date() }, warehouse: { name: "Gudang A" } },
    ]
    // Mock meniru semantik saringan where Prisma (status/qty/item relasi).
    const applySerial = (rows: typeof serialRows, where: any) =>
      rows.filter(
        (r) =>
          (where?.status?.in ? where.status.in.includes(r.status) : true) &&
          (where?.item?.isActive !== undefined ? r.item.isActive === where.item.isActive : true) &&
          (where?.item?.deletedAt === null ? r.item.deletedAt === null : true),
      )
    const applyBatch = (rows: typeof batchRows, where: any) =>
      rows.filter(
        (r) =>
          (where?.qty?.gt !== undefined ? Number(r.qty) > Number(where.qty.gt) : true) &&
          (where?.item?.isActive !== undefined ? r.item.isActive === where.item.isActive : true) &&
          (where?.item?.deletedAt === null ? r.item.deletedAt === null : true),
      )
    mocks.prismaMock.itemSerial.findMany.mockImplementation(async (args: any) => applySerial(serialRows, args?.where))
    mocks.prismaMock.itemBatch.findMany.mockImplementation(async (args: any) => applyBatch(batchRows, args?.where))

    const { report } = await loadSerialBatchStock({ warehouseId: null, asOf: new Date() })

    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      status: { in: ["available", "reserved"] },
      item: { isActive: true, deletedAt: null },
    })
    expect(mocks.prismaMock.itemBatch.findMany.mock.calls[0][0].where).toEqual({
      qty: { gt: 0 },
      item: { isActive: true, deletedAt: null },
    })
    const joined = JSON.stringify(report.table.rows)
    expect(joined).toContain("SN-OK")
    expect(joined).toContain("B-OK")
    expect(joined).not.toContain("SN-USED")
    expect(joined).not.toContain("SN-SOLD")
    expect(joined).not.toContain("B-ZERO")
    expect(joined).not.toContain("Item B")
    expect(report.totals.serials).toBe(1)
    expect(report.totals.batches).toBe(1)
  })

  it("loadStockAging: scope [2] menapis lapisan; tanpa scope tak berubah", async () => {
    await loadStockAging([2])
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0].where).toEqual({
      remaining: { gt: 0 },
      item: { isActive: true, deletedAt: null },
      warehouseId: { in: [2] },
    })
    await loadStockAging()
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[1][0].where).toEqual({
      remaining: { gt: 0 },
      item: { isActive: true, deletedAt: null },
    })
  })

  it("loadStockAging: umur dari sourceCreatedAt bila ada (STOK-08/09), bukan createdAt layer tujuan", async () => {
    const day = 86_400_000
    // Bekukan jam: loader menghitung umur ceil((now - age)/hari), jadi fixture
    // dan loader yang membaca Date.now terpisah beberapa ms menghasilkan 41
    // (flake CI tengah malam). Waktu tetap membuat selisih persis 40 hari.
    const now = new Date("2026-10-15T00:00:00Z").getTime()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    // Layer lahir di gudang tujuan 5 hari lalu, tetapi stok asalnya
    // berumur 40 hari (pindahan antar gudang) — kelompok wajib 31–60.
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      {
        itemId: 1,
        warehouseId: 2,
        remaining: 3,
        unitCost: 100,
        createdAt: new Date(now - 5 * day),
        sourceCreatedAt: new Date(now - 40 * day),
        item: { sku: "A", name: "Item A", unitOfMeasure: "pcs", category: null },
      },
    ])
    try {
      const report = await loadStockAging([2])
      const row = report.table.rows.find((r) => r.kind === "data" && r.cells[1] === "Item A")
      expect(row?.kind === "data" ? row.cells[5] : null).toBe("40")
      expect(row?.kind === "data" ? row.cells[6] : null).toBe("31–60 Hari")
    } finally {
      vi.useRealTimers()
    }
  })

  it("R6PA-04: loadStockSummary menapis gudang+layer dan scoped tak menampilkan yatim", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 2, code: "B", name: "Gudang B" }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 2, remaining: 3, unitCost: 100 },
    ])

    const report = await loadStockSummary([2])
    expect(mocks.prismaMock.warehouse.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      deletedAt: null,
      id: { in: [2] },
    })
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0].where).toEqual({
      remaining: { gt: 0 },
      item: { isActive: true, deletedAt: null },
      warehouseId: { in: [2] },
    })
    expect(JSON.stringify(report.table.rows)).not.toContain("Tanpa Gudang / Lainnya")
  })

  it("R6IE-08: loadStockSummary global memasukkan layer yatim ke baris dan total", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 1, code: "A", name: "Gudang A" }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 1, remaining: 2, unitCost: 100 },
      { itemId: 2, warehouseId: null, remaining: 3, unitCost: 100 },
    ])

    const report = await loadStockSummary()
    const text = JSON.stringify(report.table.rows)
    expect(text).toContain("Tanpa Gudang / Lainnya")
    const total = report.table.rows.find((row) => row.kind === "total")
    expect(total?.kind === "total" ? total.cells : []).toEqual(["5", "500"])
  })

  it("R6PA-04: loadSlowMovingStock menapis layer dan move keluar per scope", async () => {
    await loadSlowMovingStock({ scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ warehouseId: { in: [2] } }),
    )
  })

  it("R6PA-04: rekonsiliasi scoped membatasi visibilitas tetapi selisih tetap global", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 1, sku: "A", name: "Item A", qtyOnHand: 10 },
      { id: 2, sku: "B", name: "Item B", qtyOnHand: 4 },
    ])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 1, remaining: 4, unitCost: 100 },
      { itemId: 1, warehouseId: 2, remaining: 6, unitCost: 100 },
      { itemId: 2, warehouseId: 1, remaining: 3, unitCost: 100 },
    ])

    const report = await loadStockReconciliation([2])
    expect(report.summary.totalItems).toBe(1)
    expect(report.summary.mismatches).toEqual([])
    expect(report.table.rows[0]).toEqual(
      expect.objectContaining({
        kind: "notice",
        text: expect.stringContaining("total global semua gudang"),
      }),
    )
  })
})

describe("wiring scope halaman + registry + PDF (ROUND5-SCOPE)", () => {
  const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8")

  it("route PDF menghitung scope untuk semua key laporan stok", () => {
    const pdf = src("src/app/api/pdf/route.ts")
    for (const key of [
      "mutasi-stok",
      "valuasi-stok",
      "kartu-stok",
      "penghitungan-stok",
      "transfer-terkirim",
      "stok-minimum",
      "umur-stok",
      "stok-tidak-bergerak",
      "ringkasan-stok",
      "rekonsiliasi-stok",
    ]) {
      expect(pdf, key).toContain(`"${key}"`)
    }
  })

  it("registry meneruskan warehouseScope ke loader stok", () => {
    const registry = src("src/lib/reports/report-registry.ts")
    expect(registry).toContain("loadStockCount(period, warehouseScope)")
    expect(registry).toContain("loadTransferInTransit(period, warehouseScope)")
    expect(registry).toContain("loadMinStock(new Date(), warehouseScope)")
    expect(registry).toContain("loadStockAging(warehouseScope)")
    expect(registry).toContain("scopeWarehouseIds: warehouseScope")
    expect(registry).toContain("loadStockSummary(warehouseScope)")
    expect(registry).toContain("loadStockReconciliation(warehouseScope)")
  })

  it("halaman laporan stok membaca getWarehouseScope", () => {
    for (const file of [
      "src/app/(dashboard)/laporan/penghitungan-stok/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/transfer-terkirim/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/stok-minimum/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/nomor-seri-batch/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/umur-stok/page.tsx",
      "src/app/(dashboard)/laporan/stok-tidak-bergerak/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/ringkasan-stok/page.tsx",
      "src/app/(dashboard)/laporan/rekonsiliasi-stok/page.tsx",
    ]) {
      expect(src(file), file).toContain("getWarehouseScope")
    }
  })

  it("putaran 90: layar umur-stok dan ringkasan-stok menyaring item hidup seperti loader PDF", () => {
    expect(src("src/app/(dashboard)/laporan/umur-stok/page.tsx")).toContain(
      "item: { isActive: true, deletedAt: null }",
    )
    expect(src("src/app/(dashboard)/laporan/ringkasan-stok/page.tsx")).toContain(
      "item: { isActive: true, deletedAt: null }",
    )
  })

  it("putaran 90: saldo awal kartu-stok tidak bocor untuk gudang di luar scope", () => {
    expect(src("src/app/(dashboard)/laporan/kartu-stok/[[...segments]]/page.tsx")).toContain(
      "scopeIds.includes(warehouseId)",
    )
  })

  it("halaman umur-stok (layar) memakai rumus umur asal STOK-08/09 yang sama dengan loadStockAging", () => {
    // Layar mengquery layer sendiri (bukan loader), jadi tanpa tes sumber ini
    // layar bisa diam-diam kembali memakai createdAt layer tujuan — stok
    // pindahan tampak lebih muda di layar daripada di PDF.
    const page = src("src/app/(dashboard)/laporan/umur-stok/page.tsx")
    expect(page).toContain("layer.sourceCreatedAt ?? layer.createdAt")
  })
})
