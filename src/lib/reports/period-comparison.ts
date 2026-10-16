/**
 * Period-over-period comparison for financial statements (Laba Rugi / Neraca).
 *
 * Pure by design (no Prisma) so the normal-balance conversion, variance and
 * percentage arithmetic can be unit tested.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface AccountBalance {
  id: number
  code: string
  name: string
  type: string
  balance: number
}

/** ASSET/EXPENSE are debit-normal, everything else credit-normal. */
function isDebitNormal(type: string): boolean {
  return type === "ASSET" || type === "EXPENSE"
}

/** Convert raw debit/credit sums into signed balances using the normal side. */
export function toAccountBalances(
  accounts: { id: number; code: string; name: string; type: string }[],
  sums: Map<number, { debit: number; credit: number }>,
): AccountBalance[] {
  return accounts.map((account) => {
    const sum = sums.get(account.id)
    const balance = !sum
      ? 0
      : isDebitNormal(account.type)
        ? safeSubtract(sum.debit, sum.credit, 2)
        : safeSubtract(sum.credit, sum.debit, 2)
    return { id: account.id, code: account.code, name: account.name, type: account.type, balance }
  })
}

export interface ComparisonRow {
  key: string
  code: string
  name: string
  current: number
  previous: number
  variance: number
  /** Percentage change vs the previous period; null when previous = 0. */
  percentage: number | null
}

export interface ComparisonResult {
  rows: ComparisonRow[]
  totalCurrent: number
  totalPrevious: number
  totalVariance: number
}

/**
 * Compare two periods account by account. Accounts that are zero in BOTH periods
 * are dropped so the report stays readable.
 */
export function buildComparison(current: AccountBalance[], previous: AccountBalance[]): ComparisonResult {
  const previousById = new Map(previous.map((row) => [row.id, row.balance]))

  const rows: ComparisonRow[] = current
    .map((row) => {
      const previousBalance = previousById.get(row.id) ?? 0
      const variance = safeSubtract(row.balance, previousBalance, 2)
      const percentage = previousBalance !== 0 ? (variance / Math.abs(previousBalance)) * 100 : null
      return {
        key: String(row.id),
        code: row.code,
        name: row.name,
        current: row.balance,
        previous: previousBalance,
        variance,
        percentage,
      }
    })
    .filter((row) => row.current !== 0 || row.previous !== 0)

  const totalCurrent = rows.reduce((sum, row) => safeAdd(sum, row.current, 2), 0)
  const totalPrevious = rows.reduce((sum, row) => safeAdd(sum, row.previous, 2), 0)

  return { rows, totalCurrent, totalPrevious, totalVariance: safeSubtract(totalCurrent, totalPrevious, 2) }
}

/** The same-length window immediately before `start`, used as the default comparator. */
export function previousWindow(start: Date, end: Date): { start: Date; end: Date } {
  const lengthMs = Math.max(0, end.getTime() - start.getTime())
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - lengthMs)
  return { start: previousStart, end: previousEnd }
}
