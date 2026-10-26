import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  WARRANTY_INTAKE_COLUMN_LABELS,
  WARRANTY_INTAKE_EMPTY_TEXT,
  WARRANTY_INTAKE_LEVEL_LABELS,
  WARRANTY_INTAKE_NOTICE_TEXT,
  WARRANTY_INTAKE_STALE_DAYS,
  buildWarrantyIntakeQueue,
  type WarrantyIntakeClaimInput,
} from "../warranty-claim-intake-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findClaims: vi.fn(),
  findUsers: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    warrantyClaim: { findMany: (...a: unknown[]) => mocks.findClaims(...a) },
    user: { findMany: (...a: unknown[]) => mocks.findUsers(...a) },
  },
}))

import { getWarrantyIntakeQueue } from "../warranty-claim-intake-queue-data"

// Hari kalender WIB tetap: NOW = 2026-10-27 WIB.
const NOW = new Date("2026-10-26T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function claim(
  overrides: Partial<WarrantyIntakeClaimInput> = {},
): WarrantyIntakeClaimInput {
  return {
    claimId: 1,
    status: "intake",
    reportedAt: day(-1),
    odometerKm: 12000,
    complaint: "Part berbunyi",
    createdByName: "Admin Uji",
    coverageId: 10,
    coverageStatus: "active",
    coverageExpiresAt: day(90),
    serialNumber: "SN-001",
    itemId: 5,
    itemName: "Shockbreaker",
    itemSku: "SHK-001",
    customerVehicleId: 7,
    plateNumber: "B 1234 CD",
    vehicleName: "Avanza",
    customerId: 21,
    customerName: "Pelanggan Uji",
    ...overrides,
  }
}

describe("warranty-claim-intake-queue (F-2026-10-27-076-S, PUTUSAN Q-WIQ-1..6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.findClaims.mockResolvedValue([])
    mocks.findUsers.mockResolvedValue([])
  })

  it("kata tampil + notice verbatim spec §1 (Q-WIQ-2)", () => {
    expect(WARRANTY_INTAKE_COLUMN_LABELS).toEqual({
      umur: "Menunggu Penilaian",
      pelanggan: "Pelanggan",
      kendaraan: "Kendaraan",
      part: "Part Tercakup",
      dilaporkan: "Dilaporkan",
      dibuatOleh: "Dibuat Oleh",
    })
    expect(WARRANTY_INTAKE_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Penilaian",
    })
    expect(WARRANTY_INTAKE_NOTICE_TEXT).toBe(
      "Daftar ini hanya klaim garansi yang masih intake dan belum masuk penilaian eligibility. Klaim tetap wajib dinilai dan diputus manual oleh pejabat; majukan lewat detail klaim.",
    )
    expect(WARRANTY_INTAKE_EMPTY_TEXT).toBe("Tidak ada klaim garansi intake.")
    expect(WARRANTY_INTAKE_STALE_DAYS).toBe(3)
  })

  it("AC-WIQ-B1: populasi hanya intake; status lain keluar baris dan rekap", () => {
    const queue = buildWarrantyIntakeQueue(
      [
        claim({ claimId: 1, status: "intake" }),
        claim({ claimId: 2, status: "eligibility" }),
        claim({ claimId: 3, status: "approved" }),
        claim({ claimId: 4, status: "rejected" }),
        claim({ claimId: 5, status: "in_repair" }),
        claim({ claimId: 6, status: "closed" }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.claimId)).toEqual([1])
    expect(queue.summary).toEqual({ mengendap: 0, menunggu: 1, totalIntake: 1 })
  })

  it("AC-WIQ-B2: umur WIB dari reportedAt; ambang persis 3; masa depan 0", () => {
    const queue = buildWarrantyIntakeQueue(
      [
        claim({ claimId: 1, reportedAt: day(0) }),
        claim({ claimId: 2, reportedAt: day(-2) }),
        claim({ claimId: 3, reportedAt: day(-3) }),
        claim({ claimId: 4, reportedAt: day(2) }),
      ],
      { now: NOW },
    )
    const byId = new Map(queue.rows.map((r) => [r.claimId, r]))
    expect(byId.get(1)?.umurIntakeHari).toBe(0)
    expect(byId.get(1)?.level).toBe("menunggu")
    expect(byId.get(2)?.umurIntakeHari).toBe(2)
    expect(byId.get(2)?.level).toBe("menunggu")
    expect(byId.get(3)?.umurIntakeHari).toBe(3)
    expect(byId.get(3)?.level).toBe("mengendap")
    expect(byId.get(3)?.levelLabel).toBe("Mengendap")
    expect(byId.get(4)?.umurIntakeHari).toBe(0)
    expect(queue.summary).toEqual({ mengendap: 1, menunggu: 3, totalIntake: 4 })
    expect(queue.staleDays).toBe(3)
  })

  it("BR-WIQ-06/EC-WIQ-2: cakupan expired/revoked tetap populasi tertanda; lapor di luar masa tertanda", () => {
    const queue = buildWarrantyIntakeQueue(
      [
        claim({
          claimId: 1,
          coverageStatus: "expired",
          coverageExpiresAt: day(-10),
          reportedAt: day(-1),
        }),
        claim({
          claimId: 2,
          coverageStatus: "revoked",
          coverageExpiresAt: day(30),
          reportedAt: day(-1),
        }),
        claim({
          claimId: 3,
          coverageStatus: "active",
          coverageExpiresAt: day(30),
          reportedAt: day(-1),
        }),
      ],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(3)
    const byId = new Map(queue.rows.map((r) => [r.claimId, r]))
    expect(byId.get(1)?.statusCakupan).toBe("expired")
    expect(byId.get(1)?.laporDiLuarMasa).toBe(true)
    expect(byId.get(2)?.statusCakupan).toBe("revoked")
    expect(byId.get(2)?.laporDiLuarMasa).toBe(false)
    expect(byId.get(3)?.laporDiLuarMasa).toBe(false)
  })

  it("Q-WIQ-3: urutan mengendap dulu, umur tertua, seri reportedAt sama id naik", () => {
    const sameTime = day(-5)
    const queue = buildWarrantyIntakeQueue(
      [
        claim({ claimId: 9, reportedAt: day(-1) }),
        claim({ claimId: 7, reportedAt: sameTime }),
        claim({ claimId: 3, reportedAt: sameTime }),
        claim({ claimId: 5, reportedAt: day(-10) }),
        claim({ claimId: 8, reportedAt: day(-4) }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.claimId)).toEqual([5, 3, 7, 8, 9])
    expect(queue.rows.map((r) => r.level)).toEqual([
      "mengendap",
      "mengendap",
      "mengendap",
      "mengendap",
      "menunggu",
    ])
  })

  it("AC-WIQ-B5/Q-WIQ-6: payload tanpa telepon, tanpa nominal, tanpa penanggung jawab", () => {
    const queue = buildWarrantyIntakeQueue([claim()], { now: NOW })
    const row = queue.rows[0]
    expect(row).toBeDefined()
    const keys = Object.keys(row ?? {})
    expect(keys).not.toContain("customerPhone")
    expect(keys).not.toContain("phone")
    expect(keys.some((k) => /cost|price|amount|nominal|biaya|harga/i.test(k))).toBe(false)
    expect(keys.some((k) => /assignee|penanggung|petugas|penilai/i.test(k))).toBe(false)
    expect(row?.createdByName).toBe("Admin Uji")
  })

  it("BR-WIQ-10: pembuat null dan odometer null apa adanya", () => {
    const queue = buildWarrantyIntakeQueue(
      [claim({ createdByName: null, odometerKm: null, serialNumber: "" })],
      { now: NOW },
    )
    expect(queue.rows[0]?.createdByName).toBeNull()
    expect(queue.rows[0]?.odometerKm).toBeNull()
    expect(queue.rows[0]?.serialNumber).toBeNull()
  })

  it("AC-WIQ-B4: loader fail-closed sebelum query; query massal tanpa telepon", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("ditolak"))
    await expect(getWarrantyIntakeQueue({ now: NOW })).rejects.toThrow("ditolak")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_warranty_claims")
    expect(mocks.findClaims).not.toHaveBeenCalled()
    expect(mocks.findUsers).not.toHaveBeenCalled()
  })

  it("AC-WIQ-B4/B5: loader satu query klaim + satu query user; rekap = baris tampil", async () => {
    mocks.findClaims.mockResolvedValue([
      {
        id: 2,
        status: "intake",
        reportedAt: day(-4),
        odometerKm: null,
        complaint: "Rem bunyi",
        createdBy: 9,
        coverageId: 11,
        customerVehicleId: 8,
        coverage: {
          status: "active",
          expiresAt: day(60),
          serialNumber: null,
          itemId: 6,
          item: { name: "Kampas Rem", sku: "BRK-002" },
        },
        customerVehicle: {
          plateNumber: "D 9 XY",
          customer: { id: 22, name: "Pelanggan Dua" },
          vehicle: { name: "Brio" },
        },
      },
      {
        id: 1,
        status: "intake",
        reportedAt: day(0),
        odometerKm: 5000,
        complaint: "AC mati",
        createdBy: null,
        coverageId: 10,
        customerVehicleId: 7,
        coverage: {
          status: "expired",
          expiresAt: day(-1),
          serialNumber: "SN-9",
          itemId: 5,
          item: { name: "Kompresor AC", sku: "AC-001" },
        },
        customerVehicle: {
          plateNumber: null,
          customer: { id: 21, name: "Pelanggan Uji" },
          vehicle: { name: "Avanza" },
        },
      },
    ])
    mocks.findUsers.mockResolvedValue([{ id: 9, name: "Petugas Sembilan" }])

    const queue = await getWarrantyIntakeQueue({ now: NOW })

    expect(mocks.findClaims).toHaveBeenCalledTimes(1)
    expect(mocks.findClaims.mock.calls[0]?.[0]?.where).toEqual({ status: "intake" })
    expect(JSON.stringify(mocks.findClaims.mock.calls[0]?.[0])).not.toContain("phone")
    expect(mocks.findUsers).toHaveBeenCalledTimes(1)
    expect(mocks.findUsers.mock.calls[0]?.[0]?.where).toEqual({ id: { in: [9] } })
    expect(queue.rows.map((r) => r.claimId)).toEqual([2, 1])
    expect(queue.rows[0]?.createdByName).toBe("Petugas Sembilan")
    expect(queue.rows[1]?.createdByName).toBeNull()
    expect(queue.summary.totalIntake).toBe(queue.rows.length)
    expect(queue.summary.mengendap + queue.summary.menunggu).toBe(queue.rows.length)
  })
})
