import { describe, it, expect } from "vitest"
import { computeBalanceSheet, type BalanceSheetEntryInput } from "../balance-sheet"

/**
 * Characterization + regression tests for the Neraca (balance sheet)
 * aggregation. The key invariant: Assets = Liabilities + Equity, where Equity
 * includes current-period net income (Revenue - Expense).
 *
 * Regression target: expense accounts must be treated as debit-normal so net
 * income is Revenue - Expense, not Revenue + Expense (which previously broke the
 * balancing identity whenever any expense existed).
 */

function entry(
  accountId: number,
  type: string,
  debit: number,
  credit: number
): BalanceSheetEntryInput {
  return {
    accountId,
    accountName: `Acc ${accountId}`,
    accountCode: `${accountId}`.padStart(4, "0"),
    accountType: type,
    debit,
    credit,
  }
}

describe("computeBalanceSheet", () => {
  it("balances a simple set of journals with revenue AND expense", () => {
    // Dr Cash 1000 / Cr Capital 1000   (owner investment)
    // Dr Cash 500  / Cr Revenue 500    (sale)
    // Dr Expense 200 / Cr Cash 200     (cost)
    // => Cash 1300, Capital 1000, Revenue 500, Expense 200
    // True net income = 500 - 200 = 300 -> Equity = 1000 + 300 = 1300 = Assets.
    const entries: BalanceSheetEntryInput[] = [
      entry(1, "ASSET", 1000, 0), // Cash
      entry(2, "EQUITY", 0, 1000), // Capital
      entry(1, "ASSET", 500, 0), // Cash
      entry(3, "REVENUE", 0, 500), // Revenue
      entry(4, "EXPENSE", 200, 0), // Expense
      entry(1, "ASSET", 0, 200), // Cash
    ]

    const result = computeBalanceSheet(entries)

    expect(result.totalAssets).toBeCloseTo(1300, 2) // Cash 1000+500-200
    expect(result.netIncome).toBeCloseTo(300, 2) // 500 - 200, NOT 700
    expect(result.totalEquity).toBeCloseTo(1300, 2) // Capital 1000 + NI 300
    expect(result.totalLiabilities).toBeCloseTo(0, 2)
    expect(result.isBalanced).toBe(true)
  })

  it("regression: net income subtracts expenses (does not add them)", () => {
    // Pure P&L: Revenue 1000 (Cr), Expense 400 (Dr). Net income must be 600.
    // The old bug negated the expense balance, yielding 1000 - (-400) = 1400.
    const entries: BalanceSheetEntryInput[] = [
      entry(10, "REVENUE", 0, 1000),
      entry(11, "EXPENSE", 400, 0),
    ]
    const result = computeBalanceSheet(entries)
    expect(result.netIncome).toBeCloseTo(600, 2)
  })

  it("reports a loss as negative net income reducing equity", () => {
    // Dr Cash 1000 / Cr Capital 1000; Dr Expense 300 / Cr Cash 300; Revenue 100.
    // Net income = 100 - 300 = -200. Equity = 1000 - 200 = 800. Cash = 700.
    const entries: BalanceSheetEntryInput[] = [
      entry(1, "ASSET", 1000, 0),
      entry(2, "EQUITY", 0, 1000),
      entry(3, "EXPENSE", 300, 0),
      entry(1, "ASSET", 0, 300),
      entry(1, "ASSET", 100, 0),
      entry(4, "REVENUE", 0, 100),
    ]
    const result = computeBalanceSheet(entries)
    expect(result.totalAssets).toBeCloseTo(800, 2) // 1000 - 300 + 100
    expect(result.netIncome).toBeCloseTo(-200, 2)
    expect(result.totalEquity).toBeCloseTo(800, 2)
    expect(result.isBalanced).toBe(true)
  })

  it("handles liabilities in the identity", () => {
    // Dr Cash 5000 / Cr Loan (liability) 5000. No P&L activity.
    const entries: BalanceSheetEntryInput[] = [
      entry(1, "ASSET", 5000, 0),
      entry(5, "LIABILITY", 0, 5000),
    ]
    const result = computeBalanceSheet(entries)
    expect(result.totalAssets).toBeCloseTo(5000, 2)
    expect(result.totalLiabilities).toBeCloseTo(5000, 2)
    expect(result.totalEquity).toBeCloseTo(0, 2)
    expect(result.netIncome).toBeCloseTo(0, 2)
    expect(result.isBalanced).toBe(true)
  })

  it("omits zero-balance accounts and the NI line when net income is ~0", () => {
    const entries: BalanceSheetEntryInput[] = [
      entry(1, "ASSET", 1000, 0),
      entry(2, "EQUITY", 0, 1000),
      // Revenue and expense net to zero exactly.
      entry(3, "REVENUE", 0, 250),
      entry(4, "EXPENSE", 250, 0),
      entry(1, "ASSET", 250, 0),
      entry(1, "ASSET", 0, 250),
    ]
    const result = computeBalanceSheet(entries)
    expect(result.netIncome).toBeCloseTo(0, 2)
    expect(result.equity.some((e) => e.code === "NI")).toBe(false)
    expect(result.isBalanced).toBe(true)
  })

  it("aggregates multiple entries for the same account", () => {
    const entries: BalanceSheetEntryInput[] = [
      entry(1, "ASSET", 300, 0),
      entry(1, "ASSET", 700, 0),
      entry(2, "EQUITY", 0, 1000),
    ]
    const result = computeBalanceSheet(entries)
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0].balance).toBeCloseTo(1000, 2)
    expect(result.isBalanced).toBe(true)
  })
})
