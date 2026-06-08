import { describe, it, expect } from "vitest"
import { computeBpjsEmployee, computePph21Monthly } from "../payroll-statutory.service"

describe("BPJS employee deduction", () => {
  it("computes 1% Kesehatan + 2% JHT + 1% JP for a normal salary", () => {
    const r = computeBpjsEmployee(5_000_000)
    // Kesehatan 1% = 50.000; JHT 2% = 100.000; JP 1% = 50.000
    expect(r.health).toBe(50_000)
    expect(r.employment).toBe(150_000)
    expect(r.total).toBe(200_000)
  })

  it("caps Kesehatan at the 12jt ceiling", () => {
    const r = computeBpjsEmployee(20_000_000)
    // Kesehatan capped at 12jt → 120.000 (not 200.000)
    expect(r.health).toBe(120_000)
  })

  it("caps JP at its wage ceiling (~10.042.300)", () => {
    const r = computeBpjsEmployee(20_000_000)
    // JHT 2% of 20jt = 400.000; JP 1% of 10.042.300 = 100.423
    expect(r.employment).toBe(400_000 + 100_423)
  })

  it("returns zero for zero salary", () => {
    expect(computeBpjsEmployee(0).total).toBe(0)
  })
})

describe("PPh21 monthly (annualized progressive)", () => {
  it("is zero when annual net income is below PTKP (single)", () => {
    // 4jt/month gross → ~48jt/year, below 54jt PTKP after deductions
    expect(computePph21Monthly(4_000_000, "TK", 0)).toBe(0)
  })

  it("applies 5% bracket for income just above PTKP", () => {
    // 6jt/month → 72jt/year. occ cost 5% = 3.6jt (below 6jt cap), bpjs 0.
    // net = 72jt - 3.6jt = 68.4jt; PKP = 68.4jt - 54jt(PTKP single) = 14.4jt
    // tax/year = 14.4jt * 5% = 720.000 → /12 = 60.000
    const monthly = computePph21Monthly(6_000_000, "single", 0)
    expect(monthly).toBe(60_000)
  })

  it("married status raises PTKP (lowers tax)", () => {
    const single = computePph21Monthly(6_000_000, "TK", 0)
    const married = computePph21Monthly(6_000_000, "K", 0)
    expect(married).toBeLessThan(single)
  })

  it("BPJS employee portion reduces taxable income", () => {
    const withoutBpjs = computePph21Monthly(10_000_000, "TK", 0)
    const withBpjs = computePph21Monthly(10_000_000, "TK", 300_000)
    expect(withBpjs).toBeLessThan(withoutBpjs)
  })

  it("never returns a negative tax", () => {
    expect(computePph21Monthly(1_000_000, "TK", 0)).toBeGreaterThanOrEqual(0)
  })
})
