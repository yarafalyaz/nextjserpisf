/**
 * Aging buckets for AR/AP "jatuh tempo" reports.
 *
 * The previous implementation named buckets by DAYS-UNTIL-DUE ("1–30 Hari")
 * while the intent was DAYS-OVERDUE, and lumped every overdue invoice (any
 * negative days-until-due) into a single "Jatuh Tempo Hari Ini" bucket — so an
 * invoice 200 days late looked identical to one due today. These helpers bucket
 * by days overdue instead, which is what an aging report means.
 */

export const AGING_BUCKETS = [
  "Belum Jatuh Tempo",
  "1–30 Hari",
  "31–60 Hari",
  "61–90 Hari",
  "> 90 Hari",
] as const

export type AgingBucket = (typeof AGING_BUCKETS)[number]

/** Whole days between `due` and `asOf` (positive = overdue). Date-only, so
 *  time-of-day cannot cause an off-by-one at the day boundary. */
export function daysOverdue(due: Date, asOf: Date): number {
  const d0 = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const d1 = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  return Math.round((d1 - d0) / (1000 * 60 * 60 * 24))
}

/** Bucket a document by how many days it is overdue (0/negative = not yet due). */
export function agingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return "Belum Jatuh Tempo"
  if (overdueDays <= 30) return "1–30 Hari"
  if (overdueDays <= 60) return "31–60 Hari"
  if (overdueDays <= 90) return "61–90 Hari"
  return "> 90 Hari"
}
