import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader antrean pengingat servis berkala (F-2026-10-25-021-S tahap 1).
 * Dijaga: izin `view_reports` fail-closed SEBELUM query (usulan Q-SV-2),
 * satu query massal anti-N+1 (AC-SV-B6), select tanpa telepon pelanggan
 * (BR-SV-06), dan baca-saja mutlak — loader tidak pernah menulis
 * (AC-SV-B5).
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  prismaMock: {
    customerVehicle: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getServiceReminderQueue } from "../service-reminder-queue-data"

const NOW = new Date("2026-10-26T03:00:00.000Z")

describe("service-reminder-queue-data (F-2026-10-25-021-S)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 9 })
    mocks.prismaMock.customerVehicle.findMany.mockResolvedValue([])
  })

  it("tanpa view_reports -> ditolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))

    await expect(getServiceReminderQueue({ now: NOW })).rejects.toThrow(/izin/)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.prismaMock.customerVehicle.findMany).not.toHaveBeenCalled()
  })

  it("satu query massal; select tanpa phone; baris dibangun dari relasi", async () => {
    mocks.prismaMock.customerVehicle.findMany.mockResolvedValue([
      {
        id: 5,
        nextServiceDate: new Date("2026-10-30T00:00:00.000Z"),
        nextServiceKm: 12_000,
        nextServiceNote: "ganti oli",
        lastOdometerKm: 11_800,
        isActive: true,
        deletedAt: null,
        plateNumber: "B 5 AA",
        customer: { id: 3, name: "Budi" },
        vehicle: { name: "Avanza" },
      },
    ])

    const queue = await getServiceReminderQueue({ now: NOW })

    expect(mocks.prismaMock.customerVehicle.findMany).toHaveBeenCalledTimes(1)
    const args = mocks.prismaMock.customerVehicle.findMany.mock.calls[0]?.[0]
    expect(JSON.stringify(args.select)).not.toContain("phone")
    expect(queue.rows).toEqual([
      expect.objectContaining({
        customerVehicleId: 5,
        status: "mendekati",
        sisaHari: 4,
        sisaKm: 200,
        customerName: "Budi",
        vehicleName: "Avanza",
      }),
    ])
  })
})
