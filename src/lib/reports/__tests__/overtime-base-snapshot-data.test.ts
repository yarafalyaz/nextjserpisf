import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader rincian dasar lembur (F-2026-10-25-024-S, BR-OT-09/11/12).
 * Dijaga: gerbang `view_payroll` di server (tanpa izin snapshot tidak
 * dibaca dari DB sama sekali), snapshot dikembalikan verbatim tanpa
 * hitung ulang, snapshot null/rusak → null (tanpa karangan).
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  hasPermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { overtimeRequest: { findUnique: mocks.findUnique } },
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: mocks.hasPermission,
}))

import { loadOvertimeBaseSnapshot } from "../overtime-base-snapshot-data"

const SNAPSHOT = {
  baseSalary: 3_460_000,
  components: [
    { name: "Tunjangan Tetap A", amount: 540_000 },
    { name: "Tunjangan Tetap B", amount: 1 },
  ],
  baseTotal: 4_000_001,
  overtimeDate: "2026-06-12T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasPermission.mockResolvedValue(true)
  mocks.findUnique.mockResolvedValue({ overtimeBaseSnapshot: SNAPSHOT })
})

describe("loadOvertimeBaseSnapshot — gerbang view_payroll + verbatim", () => {
  it("pemegang view_payroll: snapshot verbatim (tanpa overtimeDate, tanpa hitung ulang)", async () => {
    const res = await loadOvertimeBaseSnapshot(7)
    expect(mocks.hasPermission).toHaveBeenCalledWith("view_payroll")
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { overtimeBaseSnapshot: true },
    })
    expect(res).toEqual({
      baseSalary: 3_460_000,
      components: [
        { name: "Tunjangan Tetap A", amount: 540_000 },
        { name: "Tunjangan Tetap B", amount: 1 },
      ],
      baseTotal: 4_000_001,
    })
  })

  it("tanpa view_payroll: null dan snapshot TIDAK dibaca dari DB sama sekali", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await loadOvertimeBaseSnapshot(7)
    expect(res).toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it("snapshot null (baris lama tanpa backfill) → null", async () => {
    mocks.findUnique.mockResolvedValue({ overtimeBaseSnapshot: null })
    expect(await loadOvertimeBaseSnapshot(7)).toBeNull()
  })

  it("baris tidak ditemukan → null", async () => {
    mocks.findUnique.mockResolvedValue(null)
    expect(await loadOvertimeBaseSnapshot(7)).toBeNull()
  })

  it("isi snapshot rusak (amount bukan angka) → null, bukan karangan", async () => {
    mocks.findUnique.mockResolvedValue({
      overtimeBaseSnapshot: {
        baseSalary: 100,
        components: [{ name: "X", amount: "540000" }],
        baseTotal: 100,
      },
    })
    expect(await loadOvertimeBaseSnapshot(7)).toBeNull()
  })
})
