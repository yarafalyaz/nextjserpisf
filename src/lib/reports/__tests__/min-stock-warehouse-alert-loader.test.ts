import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    item: { findMany: vi.fn() },
    itemWarehouseSetting: { findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadWarehouseLowStock } from "../min-stock-warehouse-alert"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 1, name: "Busi", minStock: 5 }])
  mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([])
  mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
    { itemId: 1, warehouseId: 1, remaining: 1 },
    { itemId: 1, warehouseId: 2, remaining: 1 },
  ])
  mocks.prismaMock.warehouse.findMany.mockImplementation(async ({ where }: any) => {
    const rows = [
      { id: 1, name: "Gudang Aktif" },
      { id: 2, name: "Gudang Mati" },
    ]
    return rows.filter((row) =>
      where.id.in.includes(row.id) &&
      (where.isActive !== true || row.id === 1) &&
      (where.deletedAt !== null || row.id === 1),
    )
  })
})

describe("loadWarehouseLowStock (putaran 99)", () => {
  it("hanya menilai gudang aktif dan belum terhapus", async () => {
    const rows = await loadWarehouseLowStock()

    expect(mocks.prismaMock.warehouse.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })
    expect(rows.map((row) => row.warehouseName)).toEqual(["Gudang Aktif"])
  })
})
