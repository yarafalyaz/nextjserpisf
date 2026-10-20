import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Papan antrian bengkel (F-2026-10-20-28(a)). Yang dijaga: hanya WO aktif
 * (draft/pending/in_progress) yang mengantre, urutan tenggat terawal dulu
 * dengan tanpa-tenggat terakhir, terlambat hanya dari endDate lewat hari
 * kalender, dan loader hanya query status aktif (tanpa N+1).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workOrder: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderQueue } from "../work-order-queue-data"
import { buildWorkOrderQueue, type WorkOrderQueueInput } from "../work-order-queue"

const NOW = new Date(2026, 9, 20, 10, 0) // 20 Okt 2026 lokal

function input(over: Partial<WorkOrderQueueInput>): WorkOrderQueueInput {
  return {
    id: 1,
    slug: null,
    documentNo: "WO-1",
    status: "in_progress",
    date: new Date(2026, 9, 10),
    startDate: new Date(2026, 9, 10),
    endDate: null,
    customerName: "Budi",
    vehicleLabel: "B 1234 AA · Pajero",
    ...over,
  }
}

describe("buildWorkOrderQueue", () => {
  it("hanya WO aktif yang mengantre; status final disaring", () => {
    const r = buildWorkOrderQueue(
      [
        input({ id: 1, status: "completed" }),
        input({ id: 2, status: "cancelled", documentNo: "WO-2" }),
        input({ id: 3, status: "pending", documentNo: "WO-3" }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.id)).toEqual([3])
    expect(r.totalActive).toBe(1)
    expect(r.byStatus).toEqual({ pending: 1 })
  })

  it("urut tenggat terawal dulu, tanpa tenggat terakhir, seri nomor dokumen", () => {
    const r = buildWorkOrderQueue(
      [
        input({ id: 1, documentNo: "WO-9", endDate: null }),
        input({ id: 2, documentNo: "WO-2", endDate: new Date(2026, 9, 25) }),
        input({ id: 3, documentNo: "WO-3", endDate: new Date(2026, 9, 21) }),
        input({ id: 4, documentNo: "WO-1", endDate: new Date(2026, 9, 21) }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.documentNo)).toEqual(["WO-1", "WO-3", "WO-2", "WO-9"])
  })

  it("terlambat hanya endDate lewat hari ini; jatuh tempo hari ini belum terlambat", () => {
    const r = buildWorkOrderQueue(
      [
        input({ id: 1, documentNo: "WO-1", endDate: new Date(2026, 9, 15, 23, 59) }),
        input({ id: 2, documentNo: "WO-2", endDate: new Date(2026, 9, 20, 0, 1) }),
        input({ id: 3, documentNo: "WO-3", endDate: null }),
      ],
      NOW,
    )
    const byId = new Map(r.rows.map((x) => [x.id, x]))
    expect(byId.get(1)).toMatchObject({ isOverdue: true, overdueDays: 5 })
    expect(byId.get(2)).toMatchObject({ isOverdue: false, overdueDays: 0 })
    expect(byId.get(3)).toMatchObject({ isOverdue: false, overdueDays: 0 })
    expect(r.overdueCount).toBe(1)
  })

  it("umur dari startDate, jatuh ke tanggal dokumen, tidak negatif", () => {
    const r = buildWorkOrderQueue(
      [
        input({ id: 1, startDate: new Date(2026, 9, 18), date: new Date(2026, 9, 1) }),
        input({ id: 2, documentNo: "WO-2", startDate: null, date: new Date(2026, 9, 19) }),
        input({ id: 3, documentNo: "WO-3", startDate: new Date(2026, 9, 25) }),
      ],
      NOW,
    )
    const byId = new Map(r.rows.map((x) => [x.id, x]))
    expect(byId.get(1)?.ageDays).toBe(2)
    expect(byId.get(2)?.ageDays).toBe(1)
    expect(byId.get(3)?.ageDays).toBe(0)
  })
})

describe("getWorkOrderQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      {
        id: 7,
        slug: "wo-7",
        documentNo: "WO-7",
        status: "in_progress",
        date: new Date(2026, 9, 12),
        startDate: new Date(2026, 9, 12),
        endDate: new Date(2026, 9, 18),
        customer: { name: "Sari" },
        customerVehicle: { plateNumber: "B 77 XY", vehicle: { name: "Fortuner" } },
      },
      {
        id: 8,
        slug: null,
        documentNo: "WO-8",
        status: "draft",
        date: new Date(2026, 9, 19),
        startDate: null,
        endDate: null,
        customer: { name: "Andi" },
        customerVehicle: null,
      },
    ])
  })

  it("satu query status aktif saja + label kendaraan/pelanggan terpetakan", async () => {
    const r = await getWorkOrderQueue(NOW)
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["draft", "pending", "in_progress"] } },
      }),
    )
    expect(r.rows[0]).toMatchObject({
      documentNo: "WO-7",
      customerName: "Sari",
      vehicleLabel: "B 77 XY · Fortuner",
      isOverdue: true,
      overdueDays: 2,
    })
    expect(r.rows[1]).toMatchObject({ documentNo: "WO-8", vehicleLabel: null })
    expect(r.overdueCount).toBe(1)
  })
})
