/**
 * Pure helpers for the Anggaran vs Realisasi (budget vs actual) report.
 *
 * Extracted from the report page so the realisasi sign convention can be
 * unit-tested without Prisma.
 *
 * `sumNetByAccountAndCostCenter` returns a SIGNED net (debit - credit). That is
 * only the right "realisasi" for debit-normal accounts (ASSET, EXPENSE). For
 * credit-normal accounts (LIABILITY, EQUITY, REVENUE) the realised amount must
 * be credit - debit, so a fully-realised revenue budget reads as a positive
 * realisasi instead of a negative one. This mirrors the normal-balance
 * convention used by the Balance Sheet (see balance-sheet.ts).
 */

export function isDebitNormal(type: string): boolean {
  return type === "ASSET" || type === "EXPENSE"
}

/**
 * Convert a signed net (debit - credit) into a positive-magnitude realisasi
 * using the account's normal balance. Unknown/blank account type is treated as
 * debit-normal (the historical default) so behaviour is unchanged for accounts
 * the caller could not resolve.
 */
export function normaliseActual(netSigned: number, accountType: string | null | undefined): number {
  if (accountType && !isDebitNormal(accountType)) return -netSigned
  return netSigned
}

export interface BudgetRowInput {
  accountType: string | null | undefined
  /** Signed (debit - credit) actual from sumNetByAccountAndCostCenter. */
  netSigned: number
  budgetAmount: number
}

export interface BudgetRowComputed {
  actual: number
  variance: number
  percentage: number
}

export function computeBudgetRow(input: BudgetRowInput): BudgetRowComputed {
  const actual = normaliseActual(input.netSigned, input.accountType)
  const budgetAmount = input.budgetAmount
  const variance = budgetAmount - actual
  const percentage = budgetAmount > 0 ? (actual / budgetAmount) * 100 : 0
  return { actual, variance, percentage }
}
