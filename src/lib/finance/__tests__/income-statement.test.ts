import { describe, it, expect } from "vitest"
import {
  computeIncomeStatement,
  type IncomeStatementAccountInput,
} from "../income-statement"

/**
 * Characterization tests for the multi-step income statement (Laba Rugi).
 * Expected values hand-computed to lock the waterfall:
 *   gross = revenue - cogs
 *   operating = gross - opex
 *   net = operating + (otherIncome - otherExpense)
 */

function acc(
  id: number,
  code: string,
  type: string,
  debit: number,
  credit: number
): IncomeStatementAccountInput {
  return { id, code, name: `Acc ${code}`, type, debit, credit }
}

describe("computeIncomeStatement", () => {
  it("computes the full multi-step waterfall", () => {
    const accounts: IncomeStatementAccountInput[] = [
      // Revenue (credit-normal): net 100,000,000
      acc(1, "4-1000", "REVENUE", 0, 100_000_000),
      // COGS 5-1 (debit-normal): 60,000,000
      acc(2, "5-1000", "EXPENSE", 60_000_000, 0),
      // Operating expense (EXPENSE not 5-1): 15,000,000
      acc(3, "6-1000", "EXPENSE", 15_000_000, 0),
      // Other income 8- (credit-normal): 5,000,000
      acc(4, "8-1000", "REVENUE", 0, 5_000_000),
      // Other expense 9- (debit-normal): 2,000,000
      acc(5, "9-1000", "EXPENSE", 2_000_000, 0),
    ]
    const r = computeIncomeStatement(accounts)

    expect(r.totalRevenue).toBeCloseTo(100_000_000, 2)
    expect(r.totalCogs).toBeCloseTo(60_000_000, 2)
    expect(r.grossProfit).toBeCloseTo(40_000_000, 2) // 100M - 60M
    expect(r.totalExpense).toBeCloseTo(15_000_000, 2)
    expect(r.operatingProfit).toBeCloseTo(25_000_000, 2) // 40M - 15M
    expect(r.totalOther).toBeCloseTo(3_000_000, 2) // 5M - 2M
    expect(r.netProfit).toBeCloseTo(28_000_000, 2) // 25M + 3M
    expect(r.margin).toBeCloseTo(28, 2) // 28M / 100M * 100
  })

  it("classifies 5-1 codes as COGS even though they are EXPENSE type", () => {
    const accounts: IncomeStatementAccountInput[] = [
      acc(1, "4-1000", "REVENUE", 0, 10_000),
      acc(2, "5-1100", "EXPENSE", 4_000, 0), // COGS
      acc(3, "5-2000", "EXPENSE", 1_000, 0), // operating expense (not 5-1)
    ]
    const r = computeIncomeStatement(accounts)
    expect(r.cogsData).toHaveLength(1)
    expect(r.cogsData[0].code).toBe("5-1100")
    expect(r.totalCogs).toBeCloseTo(4_000, 2)
    expect(r.expenseData).toHaveLength(1)
    expect(r.expenseData[0].code).toBe("5-2000")
    expect(r.totalExpense).toBeCloseTo(1_000, 2)
    expect(r.grossProfit).toBeCloseTo(6_000, 2) // 10,000 - 4,000
    expect(r.operatingProfit).toBeCloseTo(5_000, 2) // 6,000 - 1,000
  })

  it("reports a net loss when expenses exceed revenue", () => {
    const accounts: IncomeStatementAccountInput[] = [
      acc(1, "4-1000", "REVENUE", 0, 1_000),
      acc(2, "5-1000", "EXPENSE", 800, 0),
      acc(3, "6-1000", "EXPENSE", 500, 0),
    ]
    const r = computeIncomeStatement(accounts)
    expect(r.grossProfit).toBeCloseTo(200, 2) // 1000 - 800
    expect(r.operatingProfit).toBeCloseTo(-300, 2) // 200 - 500
    expect(r.netProfit).toBeCloseTo(-300, 2)
  })

  it("returns margin 0 when there is no revenue (no divide-by-zero)", () => {
    const accounts: IncomeStatementAccountInput[] = [
      acc(1, "6-1000", "EXPENSE", 500, 0),
    ]
    const r = computeIncomeStatement(accounts)
    expect(r.totalRevenue).toBe(0)
    expect(r.netProfit).toBeCloseTo(-500, 2)
    expect(r.margin).toBe(0)
  })

  it("omits zero-balance accounts from each section", () => {
    const accounts: IncomeStatementAccountInput[] = [
      acc(1, "4-1000", "REVENUE", 0, 1_000),
      acc(2, "4-2000", "REVENUE", 500, 500), // nets to zero -> omitted
      acc(3, "5-1000", "EXPENSE", 0, 0), // zero -> omitted
    ]
    const r = computeIncomeStatement(accounts)
    expect(r.revenueData).toHaveLength(1)
    expect(r.cogsData).toHaveLength(0)
    expect(r.totalRevenue).toBeCloseTo(1_000, 2)
  })

  it("handles contra-revenue (net debit on a revenue account reduces revenue)", () => {
    // Sales returns posted against a revenue account: debit 200 > credit 0
    const accounts: IncomeStatementAccountInput[] = [
      acc(1, "4-1000", "REVENUE", 0, 1_000),
      acc(2, "4-1900", "REVENUE", 200, 0), // contra-revenue -> balance -200
    ]
    const r = computeIncomeStatement(accounts)
    expect(r.totalRevenue).toBeCloseTo(800, 2) // 1000 + (-200)
  })
})
