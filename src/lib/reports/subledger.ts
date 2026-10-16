/**
 * Buku Besar Pembantu (subledger) aggregation for receivables / payables.
 *
 * Pure by design (no Prisma) so the running-balance arithmetic is unit-testable.
 *
 * Sign convention (debit-normal view for the counterparty ledger):
 *   - AR: invoice → debit (customer owes more), payment/return → credit.
 *   - AP: vendor bill → credit (we owe more), payment/return → debit.
 * The caller decides which field carries the amount; this module only nets
 * `debit − credit` into a running balance.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface SubledgerEntry {
  /** Stable React key / dedupe key, e.g. `SalesInvoice:12`. */
  key: string
  date: Date
  documentNo: string
  href: string | null
  description: string | null
  debit: number
  credit: number
}

export interface SubledgerRow extends SubledgerEntry {
  balance: number
}

export interface SubledgerResult {
  openingBalance: number
  rows: SubledgerRow[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

export function buildSubledger(entries: SubledgerEntry[], openingBalance: number): SubledgerResult {
  let balance = safeAdd(0, openingBalance, 2)
  let totalDebit = 0
  let totalCredit = 0

  const rows: SubledgerRow[] = entries.map((entry) => {
    totalDebit = safeAdd(totalDebit, entry.debit, 2)
    totalCredit = safeAdd(totalCredit, entry.credit, 2)
    balance = safeAdd(balance, safeSubtract(entry.debit, entry.credit, 2), 2)
    return { ...entry, balance }
  })

  return {
    openingBalance: safeAdd(0, openingBalance, 2),
    rows,
    totalDebit,
    totalCredit,
    closingBalance: balance,
  }
}

/** Balance (debit − credit) of the entries that precede the period. */
export function openingFromEntries(
  entries: { date: Date; debit: number; credit: number }[],
  startDate: Date,
): number {
  let opening = 0
  for (const entry of entries) {
    if (entry.date.getTime() >= startDate.getTime()) continue
    opening = safeAdd(opening, safeSubtract(entry.debit, entry.credit, 2), 2)
  }
  return opening
}

/** Split pre-sorted entries into the period window. */
export function periodEntries<T extends { date: Date }>(entries: T[], startDate: Date, endDate: Date): T[] {
  const start = startDate.getTime()
  const end = endDate.getTime()
  return entries.filter((entry) => entry.date.getTime() >= start && entry.date.getTime() <= end)
}
