import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import {
  computeUnitsOfProductionDepreciation,
  computeSumOfYearsDigitsDepreciation,
} from "../asset-depreciation-analytical"
import { computeMonthlyDepreciation } from "../asset-depreciation"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-23-118-V Putusan 2-3 (E118-1..5 subset
 * lapis aman). Contoh angka wajib Putusan 3. Cabut clamp/gerbang parameter
 * dan tes MERAH. Mesin ini NON-GL: jalur GL existing tetap reject.
 */
describe("UOP — Putusan 3 contoh wajib", () => {
  it("cost 120jt, total 10.000 unit: 1.000 unit -> 12jt; 500 unit -> 6jt", () => {
    const m1 = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 120_000_000, residualValue: 0,
      actualUnits: 1_000, totalEstimatedUnits: 10_000,
    })
    expect(m1.status).toBe("computed")
    if (m1.status === "computed") expect(m1.amount.toFixed(2)).toBe("12000000.00")

    const m2 = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 108_000_000, residualValue: 0,
      actualUnits: 500, totalEstimatedUnits: 10_000,
    })
    expect(m2.status).toBe("computed")
    if (m2.status === "computed") expect(m2.amount.toFixed(2)).toBe("6000000.00")
  })

  it("E118-3: unit aktual 0 = skip unit-nol, bukan computed garis lurus", () => {
    const r = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 120_000_000, residualValue: 0,
      actualUnits: 0, totalEstimatedUnits: 10_000,
    })
    expect(r).toEqual({ status: "skip", reason: "unit-nol" })
  })

  it("E118-1: parameter kosong/nol = reject missing-parameter, nol tebak fiskal", () => {
    for (const bad of [null, undefined, 0, -5]) {
      const r = computeUnitsOfProductionDepreciation({
        purchaseCost: 120_000_000, bookValue: 120_000_000, residualValue: 0,
        actualUnits: 100, totalEstimatedUnits: bad as never,
      })
      expect(r.status).toBe("reject")
      if (r.status === "reject") expect(r.parameter).toBe("totalEstimatedUnits")
    }
    const noActual = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 120_000_000, residualValue: 0,
      actualUnits: null, totalEstimatedUnits: 10_000,
    })
    expect(noActual.status).toBe("reject")
  })

  it("E118-4: unit kumulatif lewat total -> nilai buku berhenti persis di residu, tidak negatif", () => {
    const r = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 5_000_000, residualValue: 2_000_000,
      actualUnits: 99_999, totalEstimatedUnits: 10_000,
    })
    expect(r.status).toBe("computed")
    if (r.status === "computed") {
      expect(r.amount.toFixed(2)).toBe("3000000.00")
      expect(new Prisma.Decimal(5_000_000).sub(r.amount).toFixed(2)).toBe("2000000.00")
    }
  })

  it("di/bawah residu = skip at-residual", () => {
    const r = computeUnitsOfProductionDepreciation({
      purchaseCost: 120_000_000, bookValue: 2_000_000, residualValue: 2_000_000,
      actualUnits: 100, totalEstimatedUnits: 10_000,
    })
    expect(r).toEqual({ status: "skip", reason: "at-residual" })
  })
})

describe("SYD — Putusan 3 contoh wajib", () => {
  it("E118-5: cost 90jt N=3 -> 45/30/15jt, total persis 90jt", () => {
    let book = new Prisma.Decimal(90_000_000)
    const got: string[] = []
    for (let k = 1; k <= 3; k++) {
      const r = computeSumOfYearsDigitsDepreciation({
        purchaseCost: 90_000_000, bookValue: book, residualValue: 0,
        usefulLifeMonths: 3, monthIndex: k,
      })
      expect(r.status).toBe("computed")
      if (r.status !== "computed") break
      got.push(r.amount.toFixed(2))
      book = book.sub(r.amount)
    }
    expect(got).toEqual(["45000000.00", "30000000.00", "15000000.00"])
    expect(book.toFixed(2)).toBe("0.00")
  })

  it("simulasi N=12 berhenti persis di residu (selisih sen masuk bulan terakhir)", () => {
    let book = new Prisma.Decimal("100000000.00")
    const floor = new Prisma.Decimal("1000000.00")
    for (let k = 1; k <= 12; k++) {
      const r = computeSumOfYearsDigitsDepreciation({
        purchaseCost: "100000000", bookValue: book, residualValue: "1000000",
        usefulLifeMonths: 12, monthIndex: k,
      })
      expect(r.status).toBe("computed")
      if (r.status !== "computed") break
      book = book.sub(r.amount)
      expect(book.gte(floor)).toBe(true)
    }
    expect(book.toFixed(2)).toBe("1000000.00")
  })

  it("parameter kosong = reject; bulan lewat N = skip at-residual", () => {
    expect(computeSumOfYearsDigitsDepreciation({
      purchaseCost: 1, bookValue: 1, residualValue: 0,
      usefulLifeMonths: null, monthIndex: 1,
    }).status).toBe("reject")
    expect(computeSumOfYearsDigitsDepreciation({
      purchaseCost: 90_000_000, bookValue: 90_000_000, residualValue: 0,
      usefulLifeMonths: 3, monthIndex: 4,
    })).toEqual({ status: "skip", reason: "at-residual" })
  })
})

describe("NON-GL tetap tertutup (Putusan 1)", () => {
  it("jalur GL existing tetap reject analitis — mesin baru tidak membuka posting", () => {
    for (const method of ["units_of_production", "sum_of_years_digits"]) {
      const r = computeMonthlyDepreciation({
        purchaseCost: 12_000_000, bookValue: 12_000_000, residualValue: 0,
        depreciationMethod: method, categoryDepreciationRate: null, categoryUsefulLife: 5,
      })
      expect(r.status).toBe("reject")
      if (r.status === "reject") expect(r.reason).toBe("analytical-method")
    }
  })

  it("Decimal presisi sen tanpa float", () => {
    const r = computeUnitsOfProductionDepreciation({
      purchaseCost: "100.10", bookValue: "100.10", residualValue: "0",
      actualUnits: 1, totalEstimatedUnits: 3,
    })
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toFixed(2)).toBe("33.37")
  })
})
