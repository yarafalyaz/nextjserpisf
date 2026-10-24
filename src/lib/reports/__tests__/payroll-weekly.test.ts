import { describe, it, expect } from "vitest"
import { computeBpjsEmployee, type StatutoryParams } from "@/lib/services/payroll-statutory.service"
import {
  allocateBpjsForPeriod,
  buildBpjsAggregateSnapshot,
  capLoanDeductionForFrequency,
  evaluateBpjsPeriodRecon,
  evaluateDeductionCeiling,
  hasActiveLoanWithoutWeeklyInstallment,
  loanDeductionForLoan,
  loanInstallmentForFrequency,
  readBpjsAggregateSnapshot,
  sumLoanDeductionForFrequency,
  type BpjsPeriodSlip,
  type PayrollLoanAmounts,
} from "../payroll-weekly"

const ruleset: StatutoryParams = {
  bpjsHealthEmployeeRate: 0.01,
  bpjsHealthCeiling: 12_000_000,
  bpjsJhtEmployeeRate: 0.02,
  bpjsJpEmployeeRate: 0.01,
  bpjsJpCeiling: 10_042_300,
  ptkpSingle: 54_000_000,
  ptkpMarriedExtra: 4_500_000,
  ptkpDependentExtra: 4_500_000,
  occupationalCostRate: 0.05,
  occupationalCostCeilingYear: 6_000_000,
  fromFallback: false,
  asOf: "2026-10-01",
}

const aggSnap = buildBpjsAggregateSnapshot({ basis: 0, targetHealth: 0, targetEmployment: 0, withheldHealth: 0, withheldEmployment: 0 })

function slip(base: number, health: number, employment: number, snapshot: unknown = aggSnap, status = "draft"): BpjsPeriodSlip {
  return { baseSalary: base, bpjsHealthEmployee: health, bpjsEmploymentEmployee: employment, status, statutorySnapshot: snapshot }
}

describe("F-103-V agregator BPJS final masa (builder murni)", () => {
  it("E103-1: satu slip bulanan base 8.000.000 byte-sama computeBpjsEmployee existing", () => {
    const r = allocateBpjsForPeriod({ currentBase: 8_000_000, otherActiveSlips: [], ruleset })
    const direct = computeBpjsEmployee(8_000_000, ruleset)
    expect(r.bpjs).toEqual(direct)
    expect(r.aggregate.basis).toBe(8_000_000)
    expect(r.aggregate.targetHealth).toBe(direct.health)
  })

  it("E103-2: 4 slip mingguan base 2jt — Σ = target basis 8jt SEKALI, bukan 4x per-slip", () => {
    const perSlip = computeBpjsEmployee(2_000_000, ruleset)
    let others: BpjsPeriodSlip[] = []
    let sumHealth = 0
    let sumEmployment = 0
    for (let i = 0; i < 4; i++) {
      const r = allocateBpjsForPeriod({ currentBase: 2_000_000, otherActiveSlips: others, ruleset })
      sumHealth += r.bpjs.health
      sumEmployment += r.bpjs.employment
      others = [...others, slip(2_000_000, r.bpjs.health, r.bpjs.employment)]
    }
    const target = computeBpjsEmployee(8_000_000, ruleset)
    expect({ health: sumHealth, employment: sumEmployment }).toEqual({ health: target.health, employment: target.employment })
    // Bila per-slip penuh dipaksakan, pembulatan gabungan JHT+JP menyimpang.
    if (target.employment !== perSlip.employment * 4 || target.health !== perSlip.health * 4) {
      expect(sumEmployment === perSlip.employment * 4 && sumHealth === perSlip.health * 4).toBe(false)
    }
  })

  it("E103-3: basis masa 20jt — ceiling Kesehatan 12jt + JP SEKALI per masa", () => {
    let others: BpjsPeriodSlip[] = []
    let sumHealth = 0
    let sumEmployment = 0
    for (let i = 0; i < 4; i++) {
      const r = allocateBpjsForPeriod({ currentBase: 5_000_000, otherActiveSlips: others, ruleset })
      sumHealth += r.bpjs.health
      sumEmployment += r.bpjs.employment
      others = [...others, slip(5_000_000, r.bpjs.health, r.bpjs.employment)]
    }
    const target = computeBpjsEmployee(20_000_000, ruleset)
    expect(sumHealth).toBe(target.health)
    expect(sumEmployment).toBe(target.employment)
    expect(target.health).toBe(120_000)
    const perSlipCeiling = computeBpjsEmployee(5_000_000, ruleset).health * 4
    expect(sumHealth).not.toBe(perSlipCeiling)
  })

  it("E103-4: slip penanggung draft dihapus/diabaikan batal — slip berikut menanggung selisih penuh", () => {
    const direct = computeBpjsEmployee(8_000_000, ruleset)
    // Slip batal dikeluarkan loader (status filter) — simulasi dua bentuk:
    const withCancelled = allocateBpjsForPeriod({
      currentBase: 2_000_000,
      otherActiveSlips: [slip(6_000_000, direct.health, direct.employment, aggSnap, "cancelled")],
      ruleset,
    })
    expect(withCancelled.aggregate.basis).toBe(2_000_000)
    const first = allocateBpjsForPeriod({ currentBase: 2_000_000, otherActiveSlips: [], ruleset })
    expect(first.bpjs.health + first.bpjs.employment).toBeLessThan(computeBpjsEmployee(8_000_000, ruleset).total)
    const next = allocateBpjsForPeriod({
      currentBase: 6_000_000,
      otherActiveSlips: [],
      ruleset,
    })
    expect(next.aggregate.basis).toBe(6_000_000)
  })

  it("E103-5: basis turun sesudah potong — alokasi lantai nol, tidak negatif; recon tampilkan kelebihan", () => {
    const target8 = computeBpjsEmployee(8_000_000, ruleset)
    // Slip lain sudah terpotong seolah basis 8jt, basis masa kini turun.
    const r = allocateBpjsForPeriod({
      currentBase: 1_000_000,
      otherActiveSlips: [slip(1_000_000, target8.health, target8.employment)],
      ruleset,
    })
    expect(r.bpjs.health).toBe(0)
    expect(r.bpjs.employment).toBe(0)
    const recon = evaluateBpjsPeriodRecon({
      activeSlips: [
        slip(1_000_000, target8.health, target8.employment),
        slip(1_000_000, r.bpjs.health, r.bpjs.employment),
      ],
      ruleset,
    })
    expect(recon.hasExcess).toBe(true)
    expect(recon.excessHealth).toBe(target8.health - computeBpjsEmployee(2_000_000, ruleset).health)
  })

  it("E103-6: alokasi per komponen — kurang health tidak tertutup lebih employment", () => {
    const r = allocateBpjsForPeriod({
      currentBase: 8_000_000,
      otherActiveSlips: [slip(0, 0, 999_999)],
      ruleset,
    })
    const target = computeBpjsEmployee(8_000_000, ruleset)
    expect(r.bpjs.employment).toBe(0)
    expect(r.bpjs.health).toBe(target.health)
  })

  it("E103-8/B6: penanda snapshot round-trip; slip tanpa penanda = legacy terdeteksi", () => {
    const snap = buildBpjsAggregateSnapshot({ basis: 8_000_000, targetHealth: 80_000, targetEmployment: 240_000, withheldHealth: 20_000, withheldEmployment: 60_000 })
    expect(readBpjsAggregateSnapshot(snap)?.basis).toBe(8_000_000)
    expect(readBpjsAggregateSnapshot({ params: {} })).toBeNull()
    expect(readBpjsAggregateSnapshot(null)).toBeNull()
    const recon = evaluateBpjsPeriodRecon({ activeSlips: [slip(8_000_000, 80_000, 240_000, { params: {} })], ruleset })
    expect(recon.hasLegacySlip).toBe(true)
    const reconAgg = evaluateBpjsPeriodRecon({ activeSlips: [slip(8_000_000, 80_000, 240_000)], ruleset })
    expect(reconAgg.hasLegacySlip).toBe(false)
  })
})

describe("F-105-V cicilan mingguan tersimpan (builder murni)", () => {
  const loan = (monthly: number, weekly: number | null, remaining: number): PayrollLoanAmounts => ({
    monthlyInstallment: monthly,
    weeklyInstallment: weekly,
    remainingAmount: remaining,
  })

  it("E105-1: weeklyInstallment NULL -> gerbang pinjaman true, potong null (fail-closed)", () => {
    expect(hasActiveLoanWithoutWeeklyInstallment([{ weeklyInstallment: null, remainingAmount: 600_000 }])).toBe(true)
    expect(loanDeductionForLoan(loan(250_000, null, 600_000), "WEEKLY")).toBeNull()
    expect(sumLoanDeductionForFrequency([loan(250_000, null, 600_000)], "WEEKLY")).toBeNull()
    expect(capLoanDeductionForFrequency([loan(250_000, null, 600_000)], "WEEKLY", 250_000)).toBe(0)
  })

  it("E105-2: 250rb x3 slip mingguan atas remaining 600rb -> 250/250/100 lalu lunas", () => {
    let remaining = 600_000
    const cuts: number[] = []
    for (let i = 0; i < 3; i++) {
      const cut = loanDeductionForLoan(loan(1_000_000, 250_000, remaining), "WEEKLY")
      expect(cut).not.toBeNull()
      cuts.push(cut as number)
      remaining -= cut as number
    }
    expect(cuts).toEqual([250_000, 250_000, 100_000])
    expect(remaining).toBe(0)
    // /4 runtime dari monthlyInstallment TIDAK dipakai (1.000.000/4 = 250.000 kebetulan sama -> pakai monthly beda)
    expect(loanDeductionForLoan(loan(900_000, 250_000, 600_000), "WEEKLY")).toBe(250_000)
    expect(loanDeductionForLoan(loan(900_000, 250_000, 600_000), "WEEKLY")).not.toBe(900_000 / 4)
  })

  it("E105-3: dua pinjaman aktif, satu tanpa nominal mingguan -> nol potong keduanya (Σ null)", () => {
    const loans = [loan(100_000, 50_000, 500_000), loan(100_000, null, 500_000)]
    expect(hasActiveLoanWithoutWeeklyInstallment(loans)).toBe(true)
    expect(sumLoanDeductionForFrequency(loans, "WEEKLY")).toBeNull()
  })

  it("E105-4: slip MONTHLY byte-sama existing — monthlyInstallment penuh tercap remaining", () => {
    expect(loanInstallmentForFrequency(loan(300_000, 50_000, 200_000), "MONTHLY")).toBe(300_000)
    expect(loanDeductionForLoan(loan(300_000, 50_000, 200_000), "MONTHLY")).toBe(200_000)
    expect(loanDeductionForLoan(loan(300_000, null, 900_000), "MONTHLY")).toBe(300_000)
    expect(hasActiveLoanWithoutWeeklyInstallment([loan(300_000, null, 0)])).toBe(false)
  })

  it("E105-5: Σ potongan Pasal 63 > 50% upah slip -> pelanggaran terdeteksi (bukan pangkas)", () => {
    const ok = evaluateDeductionCeiling({ wageBase: 2_000_000, loanDeduction: 600_000, lateDeduction: 100_000, componentDeductions: 0 })
    expect(ok).toBeNull()
    const breach = evaluateDeductionCeiling({ wageBase: 2_000_000, loanDeduction: 900_000, lateDeduction: 200_000, componentDeductions: 0 })
    expect(breach).toEqual({ totalDeductions: 1_100_000, ceiling: 1_000_000 })
  })

  it("E105-7: edit monthlyInstallment tidak mengubah potong slip mingguan", () => {
    const before = loanDeductionForLoan(loan(100_000, 250_000, 600_000), "WEEKLY")
    const after = loanDeductionForLoan(loan(999_999, 250_000, 600_000), "WEEKLY")
    expect(after).toBe(before)
    expect(before).toBe(250_000)
  })
})
