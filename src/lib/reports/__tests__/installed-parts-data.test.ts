import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader riwayat part terpasang (F-2026-10-21-024). Yang dijaga: tiga sumber
 * dimuat (coverage, WO kendaraan -> issue completed, klaim), kendaraan tanpa
 * WO tidak memanggil query issue (`in: []` dilarang), hasil akhir = builder.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    warrantyCoverage: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    warrantyClaim: { findMany: vi.fn().mockResolvedValue([]) },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([{ id: 100, name: "Aki 12V", sku: "AKI-12" }]) },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getInstalledParts } from "../installed-parts-data"

const NOW = new Date("2026-10-21T00:00:00Z")
const D = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of Object.values(mocks.prismaMock)) m.findMany.mockResolvedValue([])
})

describe("getInstalledParts", () => {
  it("kendaraan tanpa part: daftar kosong, query issue dilewati", async () => {
    const r = await getInstalledParts(42, NOW)
    expect(r).toMatchObject({ customerVehicleId: 42, rows: [], total: 0, activeCount: 0 })
    expect(mocks.prismaMock.materialIssue.findMany).not.toHaveBeenCalled()
  })

  it("coverage + issue kendaraan digabung builder jadi satu baris", async () => {
    mocks.prismaMock.warrantyCoverage.findMany.mockResolvedValue([{
      id: 1, workOrderId: 10, itemId: 100, serialNumber: "SN-1",
      installedAt: D("2026-01-10"), expiresAt: D("2027-01-10"), status: "active",
      item: { name: "Aki 12V", sku: "AKI-12" },
    }])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([{ id: 10 }])
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([{
      workOrderId: 10, date: D("2026-01-10"), status: "completed",
      items: [{ itemId: 100, serialNumbers: ["SN-1"] }],
    }])

    const r = await getInstalledParts(42, NOW)
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ source: "coverage+material_issue", status: "active" })
    expect(mocks.prismaMock.materialIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: { in: [10] }, status: "completed" } }),
    )
  })
})
