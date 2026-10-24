import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader registri part terpasang (F-2026-10-22-072-S). Yang dijaga:
 * sumber tunggal tabel InstalledPart kendaraan ini, angka Decimal
 * diteruskan ke builder sebagai number, status dokumen sumber ikut
 * untuk penanda batal Q-IP-5. Kendaraan tanpa part = daftar kosong.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    installedPart: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getInstalledParts } from "../installed-parts-data"

const D = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.installedPart.findMany.mockResolvedValue([])
})

describe("getInstalledParts", () => {
  it("kendaraan tanpa part: daftar kosong, bukan error", async () => {
    const r = await getInstalledParts(42)
    expect(r).toMatchObject({ customerVehicleId: 42, rows: [], total: 0, activeCount: 0 })
    expect(mocks.prismaMock.installedPart.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerVehicleId: 42 } }),
    )
  })

  it("baris registri diteruskan ke builder: status turunan + taut sumber", async () => {
    mocks.prismaMock.installedPart.findMany.mockResolvedValue([{
      id: 5, itemId: 100, serialNumber: "SN-1",
      qty: { toString: () => "4" }, qtyRemoved: { toString: () => "1" },
      installedAt: D("2026-01-10"), removedAt: null, removalReason: null,
      replacedByInstalledPartId: null,
      item: { name: "Aki 12V", sku: "AKI-12" },
      warrantyCoverage: { expiresAt: D("2027-01-10") },
      materialIssueItem: {
        materialIssue: { status: "completed", workOrderId: 10, projectId: null },
      },
    }])

    const r = await getInstalledParts(42)
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({
      id: 5, itemName: "Aki 12V", status: "SEBAGIAN_DILEPAS",
      qty: 4, qtyRemoved: 1, qtyRemaining: 3,
      sourceWorkOrderId: 10, sourceCancelled: false,
    })
    expect(r.rows[0].warrantyExpiresAt?.toISOString().slice(0, 10)).toBe("2027-01-10")
    // Number(Decimal-like) — loader memakai Number(p.qty) atas nilai Prisma.
    expect(typeof r.rows[0].qty).toBe("number")
  })
})
