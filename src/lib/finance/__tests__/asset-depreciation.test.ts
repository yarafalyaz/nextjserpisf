import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import {
  computeMonthlyDepreciation,
  isRegisteredDepreciationMethod,
  isGlDepreciationMethod,
  isAnalyticalDepreciationMethod,
  DEPRECIATION_METHODS,
} from "../asset-depreciation"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-22-062-V (F62-3, F62-8) untuk mesin
 * penyusutan Decimal. Hasil sekarang berbentuk diskriminan
 * computed/skip/reject — bukan lagi float polos. Cabut gerbang metode atau
 * clamp residu dan tes ini MERAH.
 */
function base(overrides: Parameters<typeof computeMonthlyDepreciation>[0]) {
  return overrides
}

describe("computeMonthlyDepreciation — gerbang metode (F62-3)", () => {
  it("daftar terdaftar persis empat metode", () => {
    expect([...DEPRECIATION_METHODS]).toEqual([
      "straight_line",
      "declining_balance",
      "units_of_production",
      "sum_of_years_digits",
    ])
  })

  it("metode analitis NON-GL ditolak berisik (reject), bukan jatuh ke garis lurus", () => {
    for (const method of ["units_of_production", "sum_of_years_digits"]) {
      const r = computeMonthlyDepreciation(
        base({
          purchaseCost: 12_000_000,
          bookValue: 12_000_000,
          residualValue: 0,
          depreciationMethod: method,
          categoryDepreciationRate: null,
          categoryUsefulLife: 5,
        }),
      )
      expect(r.status).toBe("reject")
      if (r.status === "reject") expect(r.reason).toBe("analytical-method")
      expect(isRegisteredDepreciationMethod(method)).toBe(true)
      expect(isAnalyticalDepreciationMethod(method)).toBe(true)
      expect(isGlDepreciationMethod(method)).toBe(false)
    }
  })

  it("string metode ngawur ditolak (reject unknown-method), bukan garis lurus diam-diam", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 12_000_000,
        bookValue: 12_000_000,
        residualValue: 0,
        depreciationMethod: "metode_ngawur",
        categoryDepreciationRate: null,
        categoryUsefulLife: 5,
      }),
    )
    expect(r.status).toBe("reject")
    if (r.status === "reject") expect(r.reason).toBe("unknown-method")
    expect(isRegisteredDepreciationMethod("metode_ngawur")).toBe(false)
  })

  it("metode kosong (null) = default garis lurus existing", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 6_000_000,
        bookValue: 6_000_000,
        residualValue: 0,
        depreciationMethod: null,
        categoryDepreciationRate: null,
        categoryUsefulLife: 2,
      }),
    )
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toNumber()).toBe(250_000)
  })
})

describe("computeMonthlyDepreciation — hitung Decimal", () => {
  it("garis lurus: (perolehan − residu) / bulan umur, bulat sen", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 12_000_000,
        bookValue: 12_000_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 5,
      }),
    )
    expect(r.status).toBe("computed")
    if (r.status === "computed") {
      expect(r.amount).toBeInstanceOf(Prisma.Decimal)
      expect(r.amount.toFixed(2)).toBe("166666.67")
    }
  })

  it("saldo menurun dihitung dari nilai buku jurnal (bukan perolehan)", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 10_000_000,
        bookValue: 8_000_000,
        residualValue: 0,
        depreciationMethod: "declining_balance",
        categoryDepreciationRate: 30,
        categoryUsefulLife: 5,
      }),
    )
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toNumber()).toBe(200_000)
  })

  it("memakai Decimal dari Prisma tanpa float (0.1 + 0.2 presisi sen)", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: "100.10",
        bookValue: "100.10",
        residualValue: "0",
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 1,
      }),
    )
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toFixed(2)).toBe("8.34")
  })
})

describe("computeMonthlyDepreciation — clamp residu (F62-8)", () => {
  it("skip bila nilai buku sudah di/bawah residu", () => {
    for (const bookValue of [2_000_000, 1_500_000]) {
      const r = computeMonthlyDepreciation(
        base({
          purchaseCost: 10_000_000,
          bookValue,
          residualValue: 2_000_000,
          depreciationMethod: "straight_line",
          categoryDepreciationRate: null,
          categoryUsefulLife: 5,
        }),
      )
      expect(r.status).toBe("skip")
    }
  })

  it("F62-8: simulasi 36 bulan berhenti PERSIS di residu (cost 1.000.000, residu 100.000, 3 tahun)", () => {
    let book = new Prisma.Decimal(1_000_000)
    const floor = new Prisma.Decimal(100_000)
    for (let month = 0; month < 60; month++) {
      const r = computeMonthlyDepreciation(
        base({
          purchaseCost: 1_000_000,
          bookValue: book,
          residualValue: 100_000,
          depreciationMethod: "straight_line",
          categoryDepreciationRate: null,
          categoryUsefulLife: 3,
        }),
      )
      if (r.status === "skip") break
      expect(r.status).toBe("computed")
      if (r.status !== "computed") break
      book = book.sub(r.amount)
      expect(book.gte(floor)).toBe(true)
    }
    expect(book.toFixed(2)).toBe(floor.toFixed(2))
  })

  it("bulan terakhir di-clamp, tidak melewati residu walau bulanan normal lebih besar", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 6_000_000,
        bookValue: 2_100_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 2,
      }),
    )
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toNumber()).toBe(100_000)
  })

  it("skip no-basis bila tanpa tarif dan tanpa umur", () => {
    const r = computeMonthlyDepreciation(
      base({
        purchaseCost: 10_000_000,
        bookValue: 10_000_000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: null,
      }),
    )
    expect(r.status).toBe("skip")
    if (r.status === "skip") expect(r.reason).toBe("no-basis")
  })
})
