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
  // COA lama tanpa reportGroup = jalur cadangan rentang kode.
  return { id, code, name: `Acc ${code}`, type, reportGroup: null, debit, credit }
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

/**
 * COA standar (ekspor Accurate) memakai penomoran yang tidak bisa ditebak dari
 * kode: HPP ada di 5101, beban operasional di 6xxx, non-operasional di 71xx/72xx.
 * Karena itu pengelompokan HARUS ikut `reportGroup` (tipe akun), bukan rentang kode.
 */
describe("computeIncomeStatement - COA Accurate (reportGroup)", () => {
  const accounts: IncomeStatementAccountInput[] = [
    { id: 1, code: "400001", name: "Penjualan", type: "REVENUE", reportGroup: "REVE", debit: 0, credit: 100_000_000 },
    { id: 2, code: "5101", name: "Beban Pokok Penjualan", type: "EXPENSE", reportGroup: "COGS", debit: 60_000_000, credit: 0 },
    { id: 3, code: "600004", name: "Beban Gaji, Upah & Honorer", type: "EXPENSE", reportGroup: "EXPS", debit: 6_000_000, credit: 0 },
    { id: 4, code: "710001", name: "Pendapatan Jasa Giro", type: "REVENUE", reportGroup: "OINC", debit: 0, credit: 2_000_000 },
    { id: 5, code: "720002", name: "Beban Adm. Bank", type: "EXPENSE", reportGroup: "OEXP", debit: 500_000, credit: 0 },
  ]

  it("menempatkan 5101 sebagai HPP walaupun kodenya di luar rentang 5000-5099", () => {
    const r = computeIncomeStatement(accounts)
    expect(r.cogsData.map((a) => a.code)).toEqual(["5101"])
    expect(r.expenseData.map((a) => a.code)).toEqual(["600004"])
    expect(r.grossProfit).toBeCloseTo(40_000_000, 2)
    expect(r.operatingProfit).toBeCloseTo(34_000_000, 2)
  })

  it("mengelompokkan 71xx/72xx sebagai non-operasional", () => {
    const r = computeIncomeStatement(accounts)
    expect(r.otherIncomeData.map((a) => a.code)).toEqual(["710001"])
    expect(r.otherExpenseData.map((a) => a.code)).toEqual(["720002"])
    expect(r.netProfit).toBeCloseTo(35_500_000, 2) // 34M + 1.5M
  })

  it("tetap memakai rentang kode saat reportGroup tidak ada (COA kustom)", () => {
    const r = computeIncomeStatement([
      { id: 1, code: "4-1000", name: "Pendapatan", type: "REVENUE", reportGroup: null, debit: 0, credit: 1_000 },
      { id: 2, code: "5-1500", name: "HPP", type: "EXPENSE", reportGroup: null, debit: 400, credit: 0 },
    ])
    expect(r.totalCogs).toBeCloseTo(400, 2)
  })
})

/**
 * The seeded chart of accounts uses 4-digit codes. Before this was handled,
 * `code.startsWith("5-1")` matched nothing, so HPP was never deducted and
 * "LABA KOTOR" silently equalled total revenue.
 */
describe("computeIncomeStatement - 4-digit seeded COA", () => {
  const seedAccounts: IncomeStatementAccountInput[] = [
    { id: 1, code: "4000", name: "Pendapatan Penjualan", type: "REVENUE", reportGroup: null, debit: 0, credit: 100_000_000 },
    { id: 2, code: "5000", name: "Harga Pokok Penjualan", type: "EXPENSE", reportGroup: null, debit: 60_000_000, credit: 0 },
    { id: 3, code: "5100", name: "Beban Operasional", type: "EXPENSE", reportGroup: null, debit: 9_000_000, credit: 0 },
    { id: 4, code: "5200", name: "Beban Gaji", type: "EXPENSE", reportGroup: null, debit: 6_000_000, credit: 0 },
    { id: 5, code: "1600", name: "Penyesuaian Persediaan", type: "EXPENSE", reportGroup: null, debit: 1_000_000, credit: 0 },
  ]

  it("treats 5000-5099 as HPP and the rest of 5xxx as operating expense", () => {
    const r = computeIncomeStatement(seedAccounts)
    expect(r.cogsData.map((a) => a.code)).toEqual(["5000"])
    expect(r.expenseData.map((a) => a.code).sort()).toEqual(["1600", "5100", "5200"])
    expect(r.totalCogs).toBeCloseTo(60_000_000, 2)
    expect(r.grossProfit).toBeCloseTo(40_000_000, 2)
    expect(r.totalExpense).toBeCloseTo(16_000_000, 2)
    expect(r.operatingProfit).toBeCloseTo(24_000_000, 2)
  })

  it("keeps 5100 out of HPP (a 51xx operational account must not be deducted as HPP)", () => {
    const r = computeIncomeStatement(seedAccounts)
    expect(r.cogsData.some((a) => a.code === "5100")).toBe(false)
  })

  it("classifies 8xxx / 9xxx as non-operating", () => {
    const r = computeIncomeStatement([
      ...seedAccounts,
      { id: 6, code: "8000", name: "Pendapatan Bunga", type: "REVENUE", reportGroup: null, debit: 0, credit: 2_000_000 },
      { id: 7, code: "9000", name: "Beban Bunga", type: "EXPENSE", reportGroup: null, debit: 500_000, credit: 0 },
    ])
    expect(r.totalOtherIncome).toBeCloseTo(2_000_000, 2)
    expect(r.totalOtherExpense).toBeCloseTo(500_000, 2)
    // 8xxx is carved out of operating revenue, 9xxx out of operating expense.
    expect(r.totalRevenue).toBeCloseTo(100_000_000, 2)
    expect(r.totalExpense).toBeCloseTo(16_000_000, 2)
    expect(r.netProfit).toBeCloseTo(25_500_000, 2) // 24M + 1.5M
  })
})
