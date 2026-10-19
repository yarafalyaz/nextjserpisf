/**
 * Pure multi-step income-statement math, extracted from the Laba Rugi report
 * page (`src/app/(dashboard)/laporan/laba-rugi/page.tsx`) so the P&L
 * computation can be unit-tested without Prisma.
 *
 * Account categorization supports BOTH chart-of-account conventions:
 *   - 4-digit codes (our seeded COA: "5000", "5100", "1600", …)
 *   - hyphenated codes ("5-1000", "8-1000", "9-1000")
 *
 *   - type REVENUE, not 8xxx            -> operating revenue (credit-normal)
 *   - 5-1xxx or 5000–5099               -> COGS / HPP (debit-normal)
 *   - 8-xxxx or 8000–8999               -> other (non-operating) income
 *   - 9-xxxx or 9000–9999               -> other (non-operating) expense
 *   - remaining EXPENSE type            -> operating expense (debit-normal)
 *
 * The 4-digit ranges were added because the seeded COA uses "5000"/"5100"
 * style codes: the old "5-1" only test classified nothing, so HPP was never
 * deducted and "LABA KOTOR" silently equalled total revenue.
 *
 * Multi-step waterfall:
 *   gross   = revenue - cogs
 *   operating = gross - operatingExpense
 *   net     = operating + (otherIncome - otherExpense)
 *   margin  = revenue > 0 ? net / revenue * 100 : 0
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface IncomeStatementAccountInput {
  id: number
  code: string
  name: string
  type: string
  debit: number
  credit: number
  /**
   * Tipe akun gaya Accurate (REVE/OINC/COGS/EXPS/OEXP). Bila ada, inilah yang
   * menentukan pengelompokan — jauh lebih andal daripada menebak dari rentang
   * kode, karena COA bisa memakai penomoran apa pun (mis. HPP di 5101 sedangkan
   * beban operasional di 6000).
   *
   * WAJIB diisi (boleh `null`) dan sengaja tidak opsional: pemanggil yang lupa
   * mengirimnya diam-diam jatuh ke tebakan rentang kode, sehingga HPP berhenti
   * terhitung sebagai HPP — Laba Kotor berubah menjadi sama dengan Pendapatan
   * tanpa error apa pun. Dengan wajib-diisi, kelalaian itu ketahuan saat
   * `tsc`, bukan saat membaca laporan.
   */
  reportGroup: string | null
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

/** First four digits of a code, so "5000" and "5-1000" both normalise. */
function codeBlock(code: string): number {
  const digits = code.replace(/[^0-9]/g, "")
  return digits ? Number(digits.slice(0, 4)) : Number.NaN
}

function inRange(code: string, from: number, to: number): boolean {
  const block = codeBlock(code)
  return Number.isFinite(block) && block >= from && block <= to
}

type ClassifiableAccount = Pick<IncomeStatementAccountInput, "code" | "type" | "reportGroup">

const isCogs = (a: ClassifiableAccount) =>
  /^5-1/.test(a.code) || inRange(a.code, 5000, 5099)
const isOtherIncome = (a: ClassifiableAccount) =>
  /^8-/.test(a.code) || inRange(a.code, 8000, 8999)
const isOtherExpense = (a: ClassifiableAccount) =>
  /^9-/.test(a.code) || inRange(a.code, 9000, 9999)

/** Tipe akun Accurate → bagian laporan laba rugi. */
const REPORT_GROUP_SECTION: Record<string, IncomeStatementSection> = {
  REVE: "revenue",
  OINC: "other_income",
  COGS: "cogs",
  EXPS: "operating_expense",
  OEXP: "other_expense",
}

/** Section of the income statement an account belongs to (null = not in the P&L). */
export type IncomeStatementSection =
  | "revenue"
  | "cogs"
  | "operating_expense"
  | "other_income"
  | "other_expense"

/**
 * Single source of truth for the P&L grouping, shared by the totals waterfall
 * and the report page's hierarchical rows so both can never disagree.
 */
export function classifyIncomeStatementAccount(
  account: ClassifiableAccount
): IncomeStatementSection | null {
  // 1. Tipe akun (paling andal) — dipakai COA standar yang menyimpan reportGroup.
  const byGroup = account.reportGroup ? REPORT_GROUP_SECTION[account.reportGroup] : undefined
  if (byGroup) return byGroup

  // 2. Cadangan: COA kustom tanpa reportGroup → tebak dari rentang kode.
  if (isOtherIncome(account)) return "other_income"
  if (isOtherExpense(account)) return "other_expense"
  if (isCogs(account)) return "cogs"
  if (account.type === "REVENUE") return "revenue"
  if (account.type === "EXPENSE") return "operating_expense"
  return null
}

/** Credit-normal sections show credit − debit; the rest show debit − credit. */
export function isCreditNormalSection(section: IncomeStatementSection): boolean {
  return section === "revenue" || section === "other_income"
}

export function computeIncomeStatement(
  accounts: IncomeStatementAccountInput[]
): IncomeStatementResult {
  // Setiap akun dikelompokkan lewat SATU fungsi klasifikasi, sehingga subtotal di
  // laporan tidak mungkin berbeda dengan baris-barisnya. Utang: reportGroup
  // (tipe akun Accurate) bila ada, kalau tidak jatuh ke rentang kode lama.
  const buckets: Record<IncomeStatementSection, IncomeStatementLine[]> = {
    revenue: [],
    cogs: [],
    operating_expense: [],
    other_income: [],
    other_expense: [],
  }

  for (const account of accounts) {
    const section = classifyIncomeStatementAccount(account)
    if (!section) continue
    const balance = isCreditNormalSection(section)
      ? safeSubtract(account.credit, account.debit, 2)
      : safeSubtract(account.debit, account.credit, 2)
    if (balance === 0) continue
    buckets[section].push({ id: account.id, code: account.code, name: account.name, balance })
  }

  const revenueData = buckets.revenue
  const cogsData = buckets.cogs
  const expenseData = buckets.operating_expense
  const otherIncomeData = buckets.other_income
  const otherExpenseData = buckets.other_expense

  const sum = (rows: IncomeStatementLine[]) =>
    rows.reduce((acc, a) => safeAdd(acc, a.balance, 2), 0)
  const totalRevenue = sum(revenueData)
  const totalCogs = sum(cogsData)
  const grossProfit = safeSubtract(totalRevenue, totalCogs, 2)
  const totalExpense = sum(expenseData)
  const operatingProfit = safeSubtract(grossProfit, totalExpense, 2)
  const totalOtherIncome = sum(otherIncomeData)
  const totalOtherExpense = sum(otherExpenseData)
  const totalOther = safeSubtract(totalOtherIncome, totalOtherExpense, 2)
  const netProfit = safeAdd(operatingProfit, totalOther, 2)
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
