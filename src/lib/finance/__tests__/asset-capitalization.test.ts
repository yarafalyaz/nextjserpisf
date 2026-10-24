import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"

import {
  classifyCapitalization,
  computeFiscalBasisAfterCapitalization,
} from "../asset-capitalization"
import { fiscalGroupRule } from "../asset-fiscal-groups"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-23-108-V (lapis aman builder):
 * gerbang Putusan 1 + basis fiskal Putusan 2. Cabut syarat gerbang,
 * plafon kelompok, atau gerbang penilai dan tes ini MERAH.
 * Contoh angka E108-2 = contoh resmi DJP di vonis.
 */

const GROUP_2 = fiscalGroupRule("GROUP_2")! // 8 tahun
const BUILDING = fiscalGroupRule("BUILDING_PERMANENT")! // 20 tahun, garis lurus saja

function gate(overrides: Parameters<typeof classifyCapitalization>[0]) {
  return classifyCapitalization(overrides)
}

const ELIGIBLE = {
  assetStatus: "active",
  expenditureUsefulLifeMonths: 36,
  hasMeasurableFutureBenefit: true,
  hasReliableSourceAmount: true,
} as const

describe("classifyCapitalization — gerbang Putusan 1 (E108-1, E108-8)", () => {
  it("empat syarat terpenuhi = capitalize", () => {
    expect(gate({ ...ELIGIBLE })).toEqual({ decision: "capitalize" })
  })

  it("E108-1: servis rutin tahunan (manfaat <= 1 tahun) = expense walau syarat lain lolos", () => {
    for (const months of [12, 6, 1, 0, null, undefined]) {
      const r = gate({ ...ELIGIBLE, expenditureUsefulLifeMonths: months })
      expect(r.decision).toBe("expense")
      if (r.decision === "expense") expect(r.failedConditions).toContain("b")
    }
  })

  it("E108-8: aset sudah disposed = expense syarat (a)", () => {
    const r = gate({ ...ELIGIBLE, assetStatus: "disposed" })
    expect(r.decision).toBe("expense")
    if (r.decision === "expense") expect(r.failedConditions).toEqual(["a"])
  })

  it("manfaat tak terukur / dokumen tak andal = expense (c)/(d), daftar gugur lengkap urut", () => {
    const r = gate({
      assetStatus: "inactive",
      expenditureUsefulLifeMonths: null,
      hasMeasurableFutureBenefit: false,
      hasReliableSourceAmount: null,
    })
    expect(r).toEqual({
      decision: "expense",
      failedConditions: ["a", "b", "c", "d"],
    })
  })

  it("nominal tidak menentukan: nominal besar bukan jalan pintas manfaat", () => {
    // Input tanpa field nominal sama sekali — gerbang struktural murni.
    const r = gate({ ...ELIGIBLE, hasMeasurableFutureBenefit: false })
    expect(r.decision).toBe("expense")
  })
})

describe("computeFiscalBasisAfterCapitalization — Putusan 2 (E108-2/3/6/9)", () => {
  const DJP = {
    // Contoh DJP vonis: perolehan 300jt kelompok 2; awal tahun ke-6 nilai
    // sisa buku fiskal 112,5jt; kapitalisasi 100jt tambah manfaat 2 tahun.
    fiscalBookValueBefore: new Prisma.Decimal("112500000.00"),
    capitalizationAmount: new Prisma.Decimal("100000000.00"),
    remainingFiscalLifeMonths: 36, // sisa 3 tahun
    claimedLifeExtensionMonths: 24,
    lifeExtensionAssessor: "Penilai internal: Kepala Bengkel (uji kapasitas mesin)",
    fiscalGroup: GROUP_2,
    fiscalMethod: "straight_line",
    expenditureDate: new Date(Date.UTC(2026, 0, 15)),
    completionDate: null,
  } as const

  it("E108-2: basis 212.500.000, sisa 5 tahun, beban 42.500.000/tahun sen persis", () => {
    const r = computeFiscalBasisAfterCapitalization({ ...DJP })
    expect(r.fiscalBookValueAfter.toFixed(2)).toBe("212500000.00")
    expect(r.appliedLifeExtensionMonths).toBe(24)
    expect(r.remainingFiscalLifeMonthsAfter).toBe(60)
    expect(r.cappedByGroupLife).toBe(false)
    expect(r.monthlyFiscalDepreciation).not.toBeNull()
    // 212.500.000 / 60 = 3.541.666,67 per bulan; x12 dibulatkan per bulan.
    expect(r.monthlyFiscalDepreciation!.toFixed(2)).toBe("3541666.67")
    expect(r.monthlyFiscalDepreciation!.mul(12).toFixed(2)).toBe("42500000.04")
    expect(r.depreciationStartMonth).toBe("2026-01")
  })

  it("E108-3: klaim tambah 6 tahun (sisa terhitung 9th) diplafon kelompok 8 tahun", () => {
    const r = computeFiscalBasisAfterCapitalization({
      ...DJP,
      claimedLifeExtensionMonths: 72, // 36 + 72 = 108 bulan = 9 tahun
    })
    expect(r.remainingFiscalLifeMonthsAfter).toBe(96)
    expect(r.cappedByGroupLife).toBe(true)
    expect(r.monthlyFiscalDepreciation!.toFixed(2)).toBe("2213541.67")
  })

  it("E108-9: tambahan manfaat tanpa penilai/dasar diperlakukan tidak menambah", () => {
    for (const assessor of [null, undefined, "", "   "]) {
      const r = computeFiscalBasisAfterCapitalization({
        ...DJP,
        lifeExtensionAssessor: assessor,
      })
      expect(r.appliedLifeExtensionMonths).toBe(0)
      expect(r.remainingFiscalLifeMonthsAfter).toBe(36)
    }
    const noClaim = computeFiscalBasisAfterCapitalization({
      ...DJP,
      claimedLifeExtensionMonths: null,
    })
    expect(noClaim.appliedLifeExtensionMonths).toBe(0)
  })

  it("perbaikan tidak menambah manfaat: sisa berjalan dipakai apa adanya", () => {
    const r = computeFiscalBasisAfterCapitalization({
      ...DJP,
      claimedLifeExtensionMonths: 0,
    })
    expect(r.remainingFiscalLifeMonthsAfter).toBe(36)
    expect(r.monthlyFiscalDepreciation!.toFixed(2)).toBe("5902777.78")
  })

  it("E108-6: dalam pengerjaan — bulan mulai = bulan selesai pengerjaan", () => {
    const r = computeFiscalBasisAfterCapitalization({
      ...DJP,
      completionDate: new Date(Date.UTC(2026, 4, 2)), // Mei 2026
    })
    expect(r.depreciationStartMonth).toBe("2026-05")
  })

  it("saldo menurun tetap tarif kelompok atas basis BARU (metode tak berubah)", () => {
    const r = computeFiscalBasisAfterCapitalization({
      ...DJP,
      fiscalMethod: "declining_balance",
    })
    // Kelompok 2 saldo menurun 25%: 212.500.000 x 25% / 12.
    expect(r.monthlyFiscalDepreciation!.toFixed(2)).toBe("4427083.33")
  })

  it("bangunan saldo menurun ditolak tabel statutoris (monthly null), garis lurus sah", () => {
    const base = {
      ...DJP,
      fiscalGroup: BUILDING,
      remainingFiscalLifeMonths: 120,
      claimedLifeExtensionMonths: 0,
    }
    expect(
      computeFiscalBasisAfterCapitalization({
        ...base,
        fiscalMethod: "declining_balance",
      }).monthlyFiscalDepreciation,
    ).toBeNull()
    const sl = computeFiscalBasisAfterCapitalization({
      ...base,
      fiscalMethod: "straight_line",
    })
    expect(sl.monthlyFiscalDepreciation!.toFixed(2)).toBe("1770833.33")
  })

  it("basis Decimal sen persis tanpa float (0.10 + 0.20)", () => {
    const r = computeFiscalBasisAfterCapitalization({
      ...DJP,
      fiscalBookValueBefore: "100.10",
      capitalizationAmount: "0.20",
    })
    expect(r.fiscalBookValueAfter).toBeInstanceOf(Prisma.Decimal)
    expect(r.fiscalBookValueAfter.toFixed(2)).toBe("100.30")
  })
})
