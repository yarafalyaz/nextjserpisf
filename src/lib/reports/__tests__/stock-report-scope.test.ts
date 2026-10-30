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

  it("loadSerialBatchStock: tanpa pilihan gudang, scope [2] menapis serial+batch", async () => {
    await loadSerialBatchStock({ warehouseId: null, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [2] },
    })
    expect(mocks.prismaMock.itemBatch.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [2] },
    })
  })

  it("loadSerialBatchStock: gudang terpilih 9 di luar scope [2] -> kosong paksa", async () => {
    await loadSerialBatchStock({ warehouseId: 9, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({
      warehouseId: { in: [] },
    })
  })

  it("loadSerialBatchStock: gudang terpilih 2 di dalam scope [2] -> tapis tunggal", async () => {
    await loadSerialBatchStock({ warehouseId: 2, asOf: new Date(), scopeWarehouseIds: [2] })
    expect(mocks.prismaMock.itemSerial.findMany.mock.calls[0][0].where).toEqual({ warehouseId: 2 })
  })

  it("loadStockAging: scope [2] menapis lapisan; tanpa scope tak berubah", async () => {
    await loadStockAging([2])
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0].where).toEqual({
      remaining: { gt: 0 },
      warehouseId: { in: [2] },
    })
    await loadStockAging()
    expect(mocks.prismaMock.inventoryLayer.findMany.mock.calls[1][0].where).toEqual({
      remaining: { gt: 0 },
    })
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
})
