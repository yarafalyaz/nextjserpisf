import { describe, it, expect } from "vitest"
import { computeBpjsEmployee, computePph21Monthly } from "../payroll-statutory.service"

/**
 * Characterization tests for Indonesian statutory payroll math. Expected values
 * are hand-computed against 2024 regulations (BPJS rates + ceilings, UU HPP 2022
 * progressive brackets, PTKP, biaya jabatan). These lock the formula so a future
 * edit that breaks withholding fails loudly — every payslip depends on this.
 */
describe("computeBpjsEmployee", () => {
  it("computes employee BPJS below all ceilings (base 10jt)", () => {
    // health 1% = 100k, JHT 2% = 200k, JP 1% = 100k → employment 300k, total 400k
    const r = computeBpjsEmployee(10_000_000)
    expect(r.health).toBe(100_000)
    expect(r.employment).toBe(300_000)
    expect(r.total).toBe(400_000)
  })

  it("applies the Kesehatan (12jt) and JP (10,042,300) ceilings (base 15jt)", () => {
    // health capped at 12jt*1% = 120k; JHT 15jt*2% = 300k; JP capped 10,042,300*1% = 100,423
    const r = computeBpjsEmployee(15_000_000)
    expect(r.health).toBe(120_000)
    expect(r.employment).toBe(300_000 + 100_423)
    expect(r.total).toBe(120_000 + 400_423)
  })

  it("clamps a negative/zero salary to zero", () => {
    expect(computeBpjsEmployee(-5_000_000).total).toBe(0)
    expect(computeBpjsEmployee(0).total).toBe(0)
  })
})

describe("computePph21Monthly", () => {
  it("is zero when annual net income is below PTKP (base 4jt, single)", () => {
    // grossYear 48jt − biaya jabatan 2.4jt − bpjs 1.92jt = 43.68jt < PTKP 54jt → 0
    expect(computePph21Monthly(4_000_000, "TK/0", 160_000)).toBe(0)
  })

  it("withholds the first 5% bracket correctly (base 10jt, single)", () => {
    // grossYear 120jt − biaya jabatan 6jt (capped) − bpjs 4.8jt = 109.2jt
    // taxable = 109.2jt − 54jt PTKP = 55.2jt (all in 5% bracket)
    // taxYear = 2.76jt → monthly = 230,000 (clean integer; no rounding effect)
    expect(computePph21Monthly(10_000_000, "TK/0", 400_000)).toBe(230_000)
  })

  it("gives a married employee lower tax than a single one (higher PTKP)", () => {
    const single = computePph21Monthly(10_000_000, "TK/0", 400_000)
    const married = computePph21Monthly(10_000_000, "K/0", 400_000)
    expect(married).toBeLessThan(single)
  })

  it("crosses multiple progressive brackets (base 30jt, married)", () => {
    // Hand-computed: taxable PKP 285,654,000 → 5%/15%/25% slices →
    // taxYear 40,413,500 → monthly 3,367,791.666...
    // PER-16/PJ/2016 Art. 17: round DOWN to nearest IDR → 3,367,791
    // (The previous test expected 3,367,792 from Math.round — see service
    // comment for the regulatory reason this is now 3,367,791.)
    expect(computePph21Monthly(30_000_000, "K/0", 820_423)).toBe(3_367_791)
  })

  it("rounds the monthly withholding DOWN to the nearest IDR (PER-16/PJ/2016)", () => {
    // Construct a case where taxYear/12 lands on a .50 boundary: a single
    // employee whose net-of-PTKP taxable maps to exactly Rp150 of annual tax
    // (first 5% bracket), giving 150/12 = 12.5 IDR/month. The regulation
    // mandates rounding DOWN → 12, not 13 (which Math.round would produce).
    //   grossYear = 56,845,264 → biaya jabatan 5% (2,842,263.2),
    //   bpjs 0, net 54,003,000.8, PTKP(TK/0) 54,000,000,
    //   taxable 3,000.8 → PKP floor-to-1000 = 3,000 → taxYear 150 → 12.5/mo.
    expect(computePph21Monthly(56_845_264 / 12, "TK/0", 0)).toBe(12)
  })

  it("is monotonically non-decreasing as gross salary rises", () => {
    let prev = -1
    for (const g of [3_000_000, 6_000_000, 10_000_000, 20_000_000, 50_000_000]) {
      const tax = computePph21Monthly(g, "TK/0", computeBpjsEmployee(g).total)
      expect(tax).toBeGreaterThanOrEqual(prev)
      prev = tax
    }
  })
})
