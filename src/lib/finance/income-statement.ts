/**
 * Pure multi-step income-statement math, extracted from the Laba Rugi report
 * page (`src/app/(dashboard)/laporan/laba-rugi/page.tsx`) so the P&L
 * computation can be unit-tested without Prisma.
 *
 * Account categorization (matches the report page):
 *   - REVENUE type            -> operating revenue (credit-normal)
 *   - code starts with "5-1"  -> COGS / HPP (debit-normal)
 *   - EXPENSE type, not 5-1   -> operating expense (debit-normal)
 *   - code starts with "8-"   -> other income (credit-normal)
 *   - code starts with "9-"   -> other expense (debit-normal)
 *
 * Multi-step waterfall:
 *   gross   = revenue - cogs
 *   operating = gross - operatingExpense
 *   net     = operating + (otherIncome - otherExpense)
 *   margin  = revenue > 0 ? net / revenue * 100 : 0
 */

export interface IncomeStatementAccountInput {
  id: number
  code: string
  name: string
  type: string
  debit: number
  credit: number
}

export interface IncomeStatementLine {
  id: number
  code: string
  name: string
  balance: number
}

export interface IncomeStatementResult {
  revenueData: IncomeStatementLine[]
  cogsData: IncomeStatementLine[]
  expenseData: IncomeStatementLine[]
  otherIncomeData: IncomeStatementLine[]
  otherExpenseData: IncomeStatementLine[]
  totalRevenue: number
  totalCogs: number
  grossProfit: number
  totalExpense: number
  operatingProfit: number
  totalOtherIncome: number
  totalOtherExpense: number
  totalOther: number
  netProfit: number
  margin: number
}

export function computeIncomeStatement(
  accounts: IncomeStatementAccountInput[]
): IncomeStatementResult {
  const isCogs = (a: IncomeStatementAccountInput) => a.code.startsWith("5-1")
  const isOtherIncome = (a: IncomeStatementAccountInput) => a.code.startsWith("8-")
  const isOtherExpense = (a: IncomeStatementAccountInput) => a.code.startsWith("9-")

  // Categories are mutually exclusive so no account is counted twice. Other
  // income (8-) / other expense (9-) are carved OUT of the main revenue/expense
  // buckets even when they carry REVENUE/EXPENSE types, otherwise an 8-xxxx
  // REVENUE account would be summed into both totalRevenue and totalOther.
  const revenueAccounts = accounts.filter(
    (a) => a.type === "REVENUE" && !isOtherIncome(a)
  )
  const cogsAccounts = accounts.filter(isCogs)
  const expenseAccounts = accounts.filter(
    (a) => a.type === "EXPENSE" && !isCogs(a) && !isOtherExpense(a)
  )
  const otherIncomeAccounts = accounts.filter(isOtherIncome)
  const otherExpenseAccounts = accounts.filter(isOtherExpense)

  // isRevenue=true -> credit-normal (credit - debit); else debit-normal.
  const calcBalance = (
    accs: IncomeStatementAccountInput[],
    isRevenue: boolean
  ): IncomeStatementLine[] =>
    accs
      .map((acc) => {
        const balance = isRevenue
          ? acc.credit - acc.debit
          : acc.debit - acc.credit
        return { id: acc.id, code: acc.code, name: acc.name, balance }
      })
      .filter((a) => a.balance !== 0)

  const revenueData = calcBalance(revenueAccounts, true)
  const cogsData = calcBalance(cogsAccounts, false)
  const expenseData = calcBalance(expenseAccounts, false)
  const otherIncomeData = calcBalance(otherIncomeAccounts, true)
  const otherExpenseData = calcBalance(otherExpenseAccounts, false)

  const totalRevenue = revenueData.reduce((s, a) => s + a.balance, 0)
  const totalCogs = cogsData.reduce((s, a) => s + a.balance, 0)
  const grossProfit = totalRevenue - totalCogs
  const totalExpense = expenseData.reduce((s, a) => s + a.balance, 0)
  const operatingProfit = grossProfit - totalExpense
  const totalOtherIncome = otherIncomeData.reduce((s, a) => s + a.balance, 0)
  const totalOtherExpense = otherExpenseData.reduce((s, a) => s + a.balance, 0)
  const totalOther = totalOtherIncome - totalOtherExpense
  const netProfit = operatingProfit + totalOther
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  return {
    revenueData,
    cogsData,
    expenseData,
    otherIncomeData,
    otherExpenseData,
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpense,
    operatingProfit,
    totalOtherIncome,
    totalOtherExpense,
    totalOther,
    netProfit,
    margin,
  }
}
