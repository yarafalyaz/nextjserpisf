import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Aksi stok minimum per gudang F-2026-10-22-070-S. Mock Prisma mandiri.
 * Yang dijaga: izin Q-MS-1 (edit_items tulis, view_items baca), item jasa /
 * nonaktif + gudang nonaktif ditolak, hapus = kembali warisi global,
 * dan nol StockMove/jurnal/reservasi dari aksi pengaturan (AC-MS-6).
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    item: { findUnique: vi.fn() },
    warehouse: { findUnique: vi.fn(), findMany: vi.fn() },
    itemWarehouseSetting: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    activityLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    // Sengaja TANPA stockMove/journalEntry/stockReservation:
    // aksi pengaturan menyentuh stok/jurnal = tes meledak (BR-MS-09).
  }
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  return { prismaMock, requirePermissionMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  listItemWarehouseSettings,
  removeItemWarehouseLeadTime,
  removeItemWarehouseMinStock,
  setItemWarehouseLeadTime,
  setItemWarehouseMinStock,
} from "../item-warehouse-setting.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.prismaMock.activityLog.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.item.findUnique.mockResolvedValue({
    id: 1, sku: "BRG-1", name: "Busi", isActive: true, isService: false, deletedAt: null, minStock: 5,
  })
  mocks.prismaMock.warehouse.findUnique.mockResolvedValue({
    id: 2, name: "Gudang Bengkel", isActive: true, deletedAt: null,
  })
  mocks.prismaMock.itemWarehouseSetting.findUnique.mockResolvedValue(null)
  mocks.prismaMock.itemWarehouseSetting.upsert.mockImplementation(
    async (args: { create: Record<string, unknown> }) => ({ id: 9, ...args.create }),
  )
})

describe("setItemWarehouseMinStock", () => {
  it("simpan override berizin edit_items + jejak ActivityLog", async () => {
    const res = await setItemWarehouseMinStock(1, 2, 2)
    expect(res).toMatchObject({ success: true, settingId: 9 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_items")
    expect(mocks.prismaMock.itemWarehouseSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId_warehouseId: { itemId: 1, warehouseId: 2 } },
        create: expect.objectContaining({ minStock: 2 }),
      }),
    )
    expect(mocks.prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "item_warehouse_min_stock_set", modelType: "ItemWarehouseSetting" }),
      }),
    )
  })

  it("tolak minStock negatif dan item jasa", async () => {
    expect(await setItemWarehouseMinStock(1, 2, -1)).toMatchObject({ success: false })
    mocks.prismaMock.item.findUnique.mockResolvedValue({
      id: 1, sku: "JSA-1", name: "Jasa", isActive: true, isService: true, deletedAt: null, minStock: 0,
    })
    const res = await setItemWarehouseMinStock(1, 2, 2)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("jasa")
    expect(mocks.prismaMock.itemWarehouseSetting.upsert).not.toHaveBeenCalled()
  })

  it("tolak gudang nonaktif", async () => {
    mocks.prismaMock.warehouse.findUnique.mockResolvedValue({ id: 2, name: "X", isActive: false, deletedAt: null })
    expect((await setItemWarehouseMinStock(1, 2, 2)).success).toBe(false)
  })
})

describe("removeItemWarehouseMinStock", () => {
  it("hapus override -> kembali warisi global + jejak", async () => {
    mocks.prismaMock.itemWarehouseSetting.findUnique.mockResolvedValue({ id: 9, minStock: 2 })
    mocks.prismaMock.itemWarehouseSetting.delete.mockResolvedValue({ id: 9 })
    const res = await removeItemWarehouseMinStock(1, 2)
    expect(res).toMatchObject({ success: true, removed: true })
    expect(mocks.prismaMock.itemWarehouseSetting.delete).toHaveBeenCalledWith({ where: { id: 9 } })
  })

  it("tanpa override = sukses removed:false, tanpa delete", async () => {
    const res = await removeItemWarehouseMinStock(1, 2)
    expect(res).toMatchObject({ success: true, removed: false })
    expect(mocks.prismaMock.itemWarehouseSetting.delete).not.toHaveBeenCalled()
  })
})

describe("lead time titik pesan-ulang F-2026-10-25-048-S", () => {
  it("setItemWarehouseLeadTime: edit_items + upsert leadTimeDays + jejak", async () => {
    mocks.prismaMock.itemWarehouseSetting.findUnique.mockResolvedValue(null)
    const res = await setItemWarehouseLeadTime(1, 2, 7)
    expect(res).toMatchObject({ success: true, settingId: 9 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_items")
    expect(mocks.prismaMock.itemWarehouseSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ leadTimeDays: 7, minStock: null }),
        update: expect.objectContaining({ leadTimeDays: 7 }),
      }),
    )
    expect(mocks.prismaMock.itemWarehouseSetting.upsert.mock.calls[0]?.[0]?.create?.minStock).toBeNull()
    expect(mocks.prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "item_warehouse_lead_time_set" }),
      }),
    )
  })

  it("BR-ROP-03: negatif dan pecahan ditolak tanpa upsert", async () => {
    expect((await setItemWarehouseLeadTime(1, 2, -1)).success).toBe(false)
    expect((await setItemWarehouseLeadTime(1, 2, 1.5)).success).toBe(false)
    expect(mocks.prismaMock.itemWarehouseSetting.upsert).not.toHaveBeenCalled()
  })

  it("hapus minimum tak menghancurkan lead time: null-kan bila lead time tinggal", async () => {
    mocks.prismaMock.itemWarehouseSetting.findUnique.mockResolvedValue({ id: 9, minStock: 2, leadTimeDays: 7 })
    mocks.prismaMock.itemWarehouseSetting.update.mockResolvedValue({ id: 9 })
    const res = await removeItemWarehouseMinStock(1, 2)
    expect(res).toMatchObject({ success: true, removed: true })
    expect(mocks.prismaMock.itemWarehouseSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minStock: null }) }),
    )
    expect(mocks.prismaMock.itemWarehouseSetting.delete).not.toHaveBeenCalled()
  })

  it("panel: baris minStock null warisi global (bukan override)", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([
      { id: 2, name: "Gudang Bengkel", code: "BKL" },
    ])
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
      { id: 9, warehouseId: 2, minStock: null, leadTimeDays: 7 },
    ])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([{ warehouseId: 2, remaining: 3 }])
    const res = await listItemWarehouseSettings(1)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.rows[0]).toMatchObject({
        warehouseId: 2, effectiveMinStock: 5, minStockSource: "global", overrideMinStock: null, leadTimeDays: 7,
      })
    }
  })

  it("removeItemWarehouseLeadTime: null-kan kolom (baris minimum tidak dihapus)", async () => {
    mocks.prismaMock.itemWarehouseSetting.findUnique.mockResolvedValue({ id: 9, leadTimeDays: 7 })
    mocks.prismaMock.itemWarehouseSetting.update.mockResolvedValue({ id: 9 })
    const res = await removeItemWarehouseLeadTime(1, 2)
    expect(res).toMatchObject({ success: true, removed: true })
    expect(mocks.prismaMock.itemWarehouseSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadTimeDays: null }) }),
    )
    expect(mocks.prismaMock.itemWarehouseSetting.delete).not.toHaveBeenCalled()
  })

  it("panel baca menampilkan leadTimeDays per gudang", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([
      { id: 2, name: "Gudang Bengkel", code: "BKL" },
    ])
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
      { id: 9, warehouseId: 2, minStock: 2, leadTimeDays: 7 },
    ])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
    const res = await listItemWarehouseSettings(1)
    expect(res.success).toBe(true)
    if (res.success) expect(res.rows[0]).toMatchObject({ leadTimeDays: 7 })
  })
})

describe("listItemWarehouseSettings", () => {
  it("baca berizin view_items: baris override vs warisi + stok lapisan", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([
      { id: 1, name: "Gudang Pusat", code: "PST" },
      { id: 2, name: "Gudang Bengkel", code: "BKL" },
    ])
    mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([{ id: 9, warehouseId: 2, minStock: 2 }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      { warehouseId: 1, remaining: 100 },
      { warehouseId: 2, remaining: 3 },
    ])
    const res = await listItemWarehouseSettings(1)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("view_items")
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.globalMinStock).toBe(5)
      expect(res.rows).toMatchObject([
        { warehouseId: 1, effectiveMinStock: 5, minStockSource: "global", qtyAtWarehouse: 100 },
        { warehouseId: 2, effectiveMinStock: 2, minStockSource: "override", qtyAtWarehouse: 3 },
      ])
    }
  })
})
