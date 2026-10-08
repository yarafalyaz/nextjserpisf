import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"

/**
 * SQL-side aggregation for financial reports.
 *
 * The report pages used to do `account.findMany({ include: { journalEntries: … } })`
 * and then `reduce()` the rows in Node. That pulls EVERY matching journal line into
 * application memory (years of postings across all accounts) just to add up two
 * columns, which risks OOM/latency on a real ledger. These helpers push the sum
 * into the database with `groupBy` and return the same numbers, computed with
 * DECIMAL arithmetic instead of floating point.
 *
 * Only POSTED and REVERSED journals are counted: a reversal is posted as its own
 * journal, so including both makes the reversed pair net to zero - which is the
 * correct treatment (see reverseJournal in finance.actions.ts).
 */

export const REPORT_JOURNAL_STATUSES = ["POSTED", "REVERSED"] as const

export type ReportEntryFilter = {
  accountIds?: number[]
  costCenterIds?: number[]
  /** Applied to journal.transactionDate. */
  date?: { gte?: Date; lte?: Date; lt?: Date }
}

export type AccountSums = { debit: number; credit: number }

function buildWhere(filter: ReportEntryFilter): Prisma.JournalEntryWhereInput {
  const { gte, lte, lt } = filter.date ?? {}
  return {
    ...(filter.accountIds?.length ? { accountId: { in: filter.accountIds } } : {}),
    ...(filter.costCenterIds?.length ? { costCenterId: { in: filter.costCenterIds } } : {}),
    journal: {
      status: { in: [...REPORT_JOURNAL_STATUSES] },
      // Defensive: journals are hard-deleted today, but if a soft-delete path is
      // ever added, reports must not silently count deleted GL.
      deletedAt: null,
      ...(gte || lte || lt ? { transactionDate: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}), ...(lt ? { lt } : {}) } } : {}),
    },
  }
}

/** Per-account debit/credit totals (the shape computeTrialBalance expects). */
export async function sumEntriesByAccount(filter: ReportEntryFilter = {}): Promise<Map<number, AccountSums>> {
  const grouped = await prisma.journalEntry.groupBy({
    by: ["accountId"],
    where: buildWhere(filter),
    _sum: { debit: true, credit: true },
  })

  const sums = new Map<number, AccountSums>()
  for (const row of grouped) {
    sums.set(row.accountId, {
      debit: Number(row._sum.debit ?? 0),
      credit: Number(row._sum.credit ?? 0),
    })
  }
  return sums
}

/**
 * Net (debit - credit) keyed by `${accountId}-${costCenterId || 0}`, the exact key
 * the budget-vs-actual reports build per row.
 */
export async function sumNetByAccountAndCostCenter(filter: ReportEntryFilter = {}): Promise<Map<string, number>> {
  const grouped = await prisma.journalEntry.groupBy({
    by: ["accountId", "costCenterId"],
    where: buildWhere(filter),
    _sum: { debit: true, credit: true },
  })

  const sums = new Map<string, number>()
  for (const row of grouped) {
    sums.set(
      `${row.accountId}-${row.costCenterId || 0}`,
      Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0),
    )
  }
  return sums
}

/** Net (debit - credit) for a single account, e.g. the ledger opening balance. */
export async function sumNetForAccount(accountId: number, filter: ReportEntryFilter = {}): Promise<number> {
  const grouped = await prisma.journalEntry.aggregate({
    where: buildWhere({ ...filter, accountIds: [accountId] }),
    _sum: { debit: true, credit: true },
  })
  return Number(grouped._sum.debit ?? 0) - Number(grouped._sum.credit ?? 0)
}
