/**
 * Aggregation for the "Total Hutang" (accounts payable) report.
 *
 * Why this exists: the aging report (`hutang-jatuh-tempo`) silently drops any
 * bill without a `dueDate`, so the figure it prints is NOT the whole payable —
 * a bill with no term simply vanishes. This helper computes the true total over
 * every recognised vendor bill (posted/partial/paid), bucketing no-due-date
 * bills into their own "Tanpa Jatuh Tempo" group instead of discarding them.
 *
 * Pure by design (no Prisma) so the sums and bucketing can be unit-tested the
 * same way as `aging.ts` / `document-status.ts`.
 */

import { AGING_BUCKETS, agingBucket, daysOverdue, type AgingBucket } from "./aging"
import { safeAdd, safeSubtract } from "@/lib/utils/math"

/** Age bucket for bills that carry no due date at all. */
export const NO_DUE_DATE_BUCKET = "Tanpa Jatuh Tempo" as const
export type PayablesAgeBucket = AgingBucket | typeof NO_DUE_DATE_BUCKET

export interface PayableBill {
  vendorId: number
  vendorName: string
  documentNo: string
  dueDate: Date | null
  grandTotal: number
  paidAmount: number
}

export interface PayableBillRow extends PayableBill {
  outstanding: number
  /** Whole days overdue, or `null` when the bill has no due date. */
  overdueDays: number | null
  ageBucket: PayablesAgeBucket
}

export interface PayableVendorRow {
  vendorId: number
  vendorName: string
  billCount: number
  totalBilled: number
  totalPaid: number
  outstanding: number
}

export interface PayablesSummary {
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  /** Number of bills still carrying an outstanding balance. */
  billCount: number
  vendorCount: number
  overdueOutstanding: number
  notYetDueOutstanding: number
  noDueDateOutstanding: number
  rows: PayableBillRow[]
  vendors: PayableVendorRow[]
  aging: { key: PayablesAgeBucket; count: number; total: number }[]
}

/** Bucket order for display: aging buckets first, no-due-date last. */
const AGING_ORDER: PayablesAgeBucket[] = [...AGING_BUCKETS, NO_DUE_DATE_BUCKET]

export function buildPayablesSummary(bills: PayableBill[], asOf: Date): PayablesSummary {
  const rows: PayableBillRow[] = []

  let totalBilled = 0
  let totalPaid = 0

  for (const bill of bills) {
    const outstanding = safeSubtract(bill.grandTotal, bill.paidAmount, 2)
    totalBilled = safeAdd(totalBilled, bill.grandTotal, 2)
    totalPaid = safeAdd(totalPaid, bill.paidAmount, 2)

    if (outstanding <= 0) continue

    const overdueDays = bill.dueDate ? daysOverdue(bill.dueDate, asOf) : null
    const ageBucket: PayablesAgeBucket =
      overdueDays === null ? NO_DUE_DATE_BUCKET : agingBucket(overdueDays)

    rows.push({ ...bill, outstanding, overdueDays, ageBucket })
  }

  // Overdue first (oldest at the top); bills without a due date sink to the end.
  rows.sort((a, b) => {
    if (a.overdueDays === null && b.overdueDays === null) return b.outstanding - a.outstanding
    if (a.overdueDays === null) return 1
    if (b.overdueDays === null) return -1
    if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays
    return b.outstanding - a.outstanding
  })

  const vendorsById = new Map<number, PayableVendorRow>()
  for (const row of rows) {
    const agg = vendorsById.get(row.vendorId) ?? {
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      billCount: 0,
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
    }
    agg.billCount += 1
    agg.totalBilled = safeAdd(agg.totalBilled, row.grandTotal, 2)
    agg.totalPaid = safeAdd(agg.totalPaid, row.paidAmount, 2)
    agg.outstanding = safeAdd(agg.outstanding, row.outstanding, 2)
    vendorsById.set(row.vendorId, agg)
  }
  const vendors = Array.from(vendorsById.values()).sort((a, b) => b.outstanding - a.outstanding)

  const bucketTotals = new Map<PayablesAgeBucket, { count: number; total: number }>()
  for (const row of rows) {
    const agg = bucketTotals.get(row.ageBucket) ?? { count: 0, total: 0 }
    agg.count += 1
    agg.total = safeAdd(agg.total, row.outstanding, 2)
    bucketTotals.set(row.ageBucket, agg)
  }
  const aging = AGING_ORDER.map((key) => ({
    key,
    count: bucketTotals.get(key)?.count ?? 0,
    total: bucketTotals.get(key)?.total ?? 0,
  }))

  const totalOutstanding = rows.reduce((sum, row) => safeAdd(sum, row.outstanding, 2), 0)
  const noDueDateOutstanding = rows
    .filter((row) => row.ageBucket === NO_DUE_DATE_BUCKET)
    .reduce((sum, row) => safeAdd(sum, row.outstanding, 2), 0)
  const overdueOutstanding = rows
    .filter((row) => row.overdueDays !== null && row.overdueDays > 0)
    .reduce((sum, row) => safeAdd(sum, row.outstanding, 2), 0)
  const notYetDueOutstanding = safeSubtract(
    safeSubtract(totalOutstanding, overdueOutstanding, 2),
    noDueDateOutstanding,
    2,
  )

  return {
    totalBilled,
    totalPaid,
    totalOutstanding,
    billCount: rows.length,
    vendorCount: vendors.length,
    overdueOutstanding,
    notYetDueOutstanding,
    noDueDateOutstanding,
    rows,
    vendors,
    aging,
  }
}
