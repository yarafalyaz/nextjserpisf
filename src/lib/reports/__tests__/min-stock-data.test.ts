import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader stok-minimum F-2026-10-22-070-S (AC-MS-1..3 di tingkat loader):
 * override ItemWarehouseSetting dibaca massal, minimum efektif per
 * pasangan, pasangan tanpa lapisan tidak dinilai.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    item: { findMany: vi.fn() },
    itemWarehouseSetting: { findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadMinStock, MIN_STOCK_WAREHOUSE_NOTE } from "../min-stock-data"

const asOf = new Date("2026-10-15T00:00:00+07:00")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.item.findMany.mockResolvedValue([
    {
      id: 1, sku: "BRG-1", name: "Busi", unitOfMeasure: "PCS", qtyOnHand: 103,
      minStock: 5, cost: 1000, category: null, warehouse: null, vendor: null,
    },
  ])
  mocks.prismaMock.warehouse.findMany.mockResolvedValue([
    { id: 1, name: "Gudang Pusat" },
    { id: 2, name: "Gudang Bengkel" },
  ])
  mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
    { itemId: 1, warehouseId: 1, remaining: 100 },
    { itemId: 1, warehouseId: 2, remaining: 3 },
  ])
})

describe("loadMinStock override per gudang", () => {
  it("AC-MS-1: override bengkel 2, stok 3 -> tidak menipis; tanpa override -> menipis vs global 5", async () => {
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 2, minStock: 2 },
    ])
    const withOverride = await loadMinStock(asOf)
    expect(withOverride.warehouseShortages).toEqual([])

    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([])
    const without = await loadMinStock(asOf)
    expect(without.warehouseShortages).toMatchObject([
      { warehouseId: 2, minStock: 5, minStockSource: "global", shortage: 2 },
    ])
    expect(without.warehouseNote).toBe(MIN_STOCK_WAREHOUSE_NOTE)
  })

  it("baris menipis ber-override membawa sumber + nilai override", async () => {
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 2, minStock: 10 },
    ])
    const res = await loadMinStock(asOf)
    expect(res.warehouseShortages).toMatchObject([
      { warehouseId: 2, minStock: 10, minStockSource: "override", shortage: 7 },
    ])
  })

  it("AC-MS-3: override di gudang tanpa lapisan tidak melahirkan baris", async () => {
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 99, minStock: 50 },
    ])
    const res = await loadMinStock(asOf)
    expect(res.warehouseShortages.map((r) => r.warehouseId)).not.toContain(99)
  })

  it("caption posisi tunggal (bukan rentang): periode tidak pernah mengklaim menyaring angka", async () => {
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([])
    const res = await loadMinStock(asOf)
    expect(res.periodCaption).toBe("Periode 15 Okt 2026 – 15 Okt 2026")
    expect(res.periodCaption).not.toContain("2025")
  })
})
