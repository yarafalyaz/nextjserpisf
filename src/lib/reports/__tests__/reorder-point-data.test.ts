import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader titik pesan-ulang F-2026-10-25-048-S. Yang dijaga:
 * - laju (Q-ROP-1): hanya MaterialIssue `completed`, jendela 90 hari
 *   kalender WIB; laju harian = total qty per (barang, gudang) / 90.
 * - PO masuk per BARANG (PO tanpa warehouseId): sisa qty − receivedQty
 *   clamp >= 0, status ordered/partial_received saja.
 * - pasangan setting tanpa lapisan masuk tidak_dinilai (BR-ROP-05).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    item: { findMany: vi.fn() },
    itemWarehouseSetting: { findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadReorderPoints, REORDER_POINT_USAGE_WINDOW_DAYS } from "../reorder-point-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.item.findMany.mockResolvedValue([
    { id: 1, sku: "BRG-1", name: "Busi", unitOfMeasure: "PCS", minStock: 5 },
  ])
  mocks.prismaMock.itemWarehouseSetting.findMany.mockResolvedValue([
    { itemId: 1, warehouseId: 2, minStock: 5, leadTimeDays: 7 },
    { itemId: 1, warehouseId: 3, minStock: 5, leadTimeDays: 7 },
  ])
  mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
    { itemId: 1, warehouseId: 2, remaining: 3 },
  ])
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
    { warehouseId: 2, items: [{ itemId: 1, qty: 90 }] },
  ])
  mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
    { items: [{ itemId: 1, qty: 10, receivedQty: 4 }] },
  ])
  mocks.prismaMock.warehouse.findMany.mockResolvedValue([
    { id: 2, name: "Gudang Bengkel" },
    { id: 3, name: "Gudang Pusat" },
  ])
})

describe("loadReorderPoints", () => {
  it("query laju: completed saja + jendela 90 hari; PO: status terbuka saja", async () => {
    const now = new Date(2026, 9, 26, 10, 0, 0)
    await loadReorderPoints(now)
    expect(mocks.prismaMock.materialIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed", date: { gte: expect.any(Date) } }),
      }),
    )
    const where = mocks.prismaMock.materialIssue.findMany.mock.calls[0][0].where
    const start: Date = where.date.gte
    // 90 hari kalender inklusif hari ini -> mulai 89 hari sebelum hari ini.
    expect(start.getFullYear()).toBe(2026)
    expect((new Date(2026, 9, 26).getTime() - start.getTime()) / 86400000).toBe(89)
    expect(mocks.prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["ordered", "partial_received"] } }),
      }),
    )
  })

  it("laju 90 qty/90 hari = 1/hari; titik = 5 + ceil(1x7) = 12; PO masuk 6 per barang", async () => {
    const res = await loadReorderPoints(new Date(2026, 9, 26))
    const line = res.result.lines.find((l) => l.warehouseId === 2)!
    expect(res.usageWindowDays).toBe(REORDER_POINT_USAGE_WINDOW_DAYS)
    expect(line).toMatchObject({
      dailyUsage: 1,
      reorderPoint: 12,
      incomingQty: 6,
      // tersedia 3 + PO 6 = 9 <= 12 -> pesan sekarang, saran 3.
      status: "pesan_sekarang",
      suggestedQty: 3,
      isCritical: true,
    })
  })

  it("pasangan setting tanpa lapisan -> tidak_dinilai tanpa_lapisan, terhitung", async () => {
    const res = await loadReorderPoints(new Date(2026, 9, 26))
    const line = res.result.lines.find((l) => l.warehouseId === 3)!
    expect(line).toMatchObject({ status: "tidak_dinilai", notAssessedReason: "tanpa_lapisan" })
    expect(res.result.counts.notAssessed).toBe(1)
  })
})
