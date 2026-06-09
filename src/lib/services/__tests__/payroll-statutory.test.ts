import { describe, it, expect } from "vitest"
import { computeBpjsEmployee, computePph21Monthly } from "../payroll-statutory.service"

describe("computeBpjsEmployee", () => {
  it("computes BPJS for salary below all ceilings", () => {
    const result = computeBpjsEmployee(5_000_000)
    // health: 5M * 1% = 50,000
    expect(result.health).toBe(50_000)
    // employment: JHT 5M * 2% = 100,000; JP 5M * 1% = 50,000 → 150,000
    expect(result.employment).toBe(150_000)
    expect(result.total).toBe(200_000)
  })

  it("caps health contribution at ceiling", () => {
    const result = computeBpjsEmployee(15_000_000)
    // health: min(15M, 12M) * 1% = 120,000
    expect(result.health).toBe(120_000)
    // employment: JHT 15M * 2% = 300,000; JP min(15M, 10,042,300) * 1% = 100,423
    expect(result.employment).toBe(300_000 + 100_423)
    expect(result.total).toBe(120_000 + 300_000 + 100_423)
  })

  it("caps JP at JP ceiling", () => {
    const result = computeBpjsEmployee(20_000_000)
    // JP: min(20M, 10,042,300) * 1% = 100,423
    const expectedJp = Math.round(10_042_300 * 0.01)
    const expectedJht = Math.round(20_000_000 * 0.02)
    expect(result.employment).toBe(expectedJht + expectedJp)
  })

  it("returns zero for zero salary", () => {
    const result = computeBpjsEmployee(0)
    expect(result.total).toBe(0)
  })

  it("returns zero for negative salary", () => {
    const result = computeBpjsEmployee(-5_000_000)
    expect(result.total).toBe(0)
  })
})

describe("computePph21Monthly", () => {
  it("returns 0 for income below PTKP (single)", () => {
    // 4M/month → 48M/year < PTKP 54M
    expect(computePph21Monthly(4_000_000, "TK/0", 0)).toBe(0)
  })

  it("computes tax for single employee earning above PTKP", () => {
    // 10M/month gross, single, BPJS deducted 200K
    const result = computePph21Monthly(10_000_000, "TK/0", 200_000)
    // grossYear = 120M
    // occupationalCost = min(120M * 5%, 6M) = 6M
    // bpjsYear = 200K * 12 = 2.4M
    // netYear = 120M - 6M - 2.4M = 111.6M
    // ptkp = 54M (TK/0)
    // taxable = 111.6M - 54M = 57.6M
    // pkp = 57,600,000 (rounded to nearest 1000)
    // tax = 57.6M * 5% = 2,880,000/year → 240,000/month
    expect(result).toBe(240_000)
  })

  it("uses married PTKP for married status", () => {
    // Same income but married → PTKP 58.5M
    const single = computePph21Monthly(10_000_000, "TK/0", 200_000)
    const married = computePph21Monthly(10_000_000, "K/0", 200_000)
    expect(married).toBeLessThan(single)
  })

  it("recognizes 'kawin' as married", () => {
    const k = computePph21Monthly(10_000_000, "K/0", 200_000)
    const kawin = computePph21Monthly(10_000_000, "kawin", 200_000)
    expect(kawin).toBe(k)
  })

  it("applies progressive brackets for high income", () => {
    // 50M/month gross, single, BPJS 500K
    const result = computePph21Monthly(50_000_000, "TK/0", 500_000)
    // grossYear = 600M
    // occupationalCost = min(600M * 5%, 6M) = 6M
    // bpjsYear = 500K * 12 = 6M
    // netYear = 600M - 6M - 6M = 588M
    // ptkp = 54M
    // taxable = 534M → pkp = 534,000,000
    // bracket 1: 60M * 5% = 3M
    // bracket 2: 190M * 15% = 28.5M
    // bracket 3: 250M * 25% = 62.5M
    // bracket 4: 34M * 30% = 10.2M
    // total year = 104.2M → month = 8,683,333
    expect(result).toBeGreaterThan(8_000_000)
    expect(result).toBeLessThan(9_000_000)
  })

  it("returns 0 for zero gross", () => {
    expect(computePph21Monthly(0, null, 0)).toBe(0)
  })

  it("handles null marital status as single", () => {
    const nullStatus = computePph21Monthly(10_000_000, null, 200_000)
    const single = computePph21Monthly(10_000_000, "TK/0", 200_000)
    expect(nullStatus).toBe(single)
  })
})
