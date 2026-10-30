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
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadStockCount } from "../stock-count-data"
import { loadSerialBatchStock } from "../serial-batch-stock-data"
import { loadStockAging } from "../stock-simple-data"

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.stockAdjustment.findMany.mockResolvedValue([])
  mocks.prismaMock.itemSerial.findMany.mockResolvedValue([])
  mocks.prismaMock.itemBatch.findMany.mockResolvedValue([])
  mocks.prismaMock.item.count.mockResolvedValue(0)
  mocks.prismaMock.item.findMany.mockResolvedValue([])
  mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
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
    ]) {
      expect(pdf, key).toContain(`"${key}"`)
    }
  })

  it("registry meneruskan warehouseScope ke 5 loader stok tambahan", () => {
    const registry = src("src/lib/reports/report-registry.ts")
    expect(registry).toContain("loadStockCount(period, warehouseScope)")
    expect(registry).toContain("loadTransferInTransit(period, warehouseScope)")
    expect(registry).toContain("loadMinStock(new Date(), warehouseScope)")
    expect(registry).toContain("loadStockAging(warehouseScope)")
  })

  it("5 halaman laporan membaca getWarehouseScope", () => {
    for (const file of [
      "src/app/(dashboard)/laporan/penghitungan-stok/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/transfer-terkirim/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/stok-minimum/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/nomor-seri-batch/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/umur-stok/page.tsx",
    ]) {
      expect(src(file), file).toContain("getWarehouseScope")
    }
  })
})
