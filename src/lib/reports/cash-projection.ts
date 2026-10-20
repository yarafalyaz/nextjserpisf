/**
 * Simple cash projection from the documents that will move money.
 *
 * Pure by design (no Prisma): the caller supplies the opening cash balance plus
 * the outstanding receivables (inflow) and payables (outflow) with their due
 * dates; this module buckets them per month and accumulates the closing balance.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { formatPeriod } from "@/lib/utils/format"
import { payableOutstanding } from "@/lib/reports/aging-amounts"

export interface CashFlowItem {
  dueDate: Date
  amount: number
}

export interface CashProjectionMonth {
  /** YYYY-MM */
  month: string
  label: string
  inflow: number
  outflow: number
  net: number
  closing: number
}

export interface PayableProjectionBill {
  dueDate: Date | null
  grandTotal: unknown
  withholdingAmount?: unknown
  paidAmount: unknown
}

/** CashFlowItems for outstanding vendor bills: remainder is NET of withholding
 * (same invariant as aging/payables-summary: grandTotal - withholding - paid),
 * so a bill with PPh withheld does not overstate projected cash outflow. */
export function buildPayableProjectionItems(bills: readonly PayableProjectionBill[]): CashFlowItem[] {
  return bills
    .filter((bill): bill is PayableProjectionBill & { dueDate: Date } => bill.dueDate != null)
    .map((bill) => ({
      dueDate: bill.dueDate,
      amount: payableOutstanding(
        Number(bill.grandTotal ?? 0),
        Number(bill.withholdingAmount ?? 0),
        Number(bill.paidAmount ?? 0),
      ),
    }))
    .filter((row) => row.amount > 0)
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

/**
 * Project `months` months starting at `from`'s month.
 * Items without a due date are ignored (the caller decides how to treat them).
 */
export function projectCash(
  opening: number,
  from: Date,
  months: number,
  receivables: CashFlowItem[],
  payables: CashFlowItem[],
): CashProjectionMonth[] {
  const buckets = new Map<string, { inflow: number; outflow: number }>()

  for (let i = 0; i < months; i++) {
    const cursor = new Date(from.getFullYear(), from.getMonth() + i, 1)
    buckets.set(monthKey(cursor), { inflow: 0, outflow: 0 })
  }

  const add = (item: CashFlowItem, field: "inflow" | "outflow") => {
    const bucket = buckets.get(monthKey(item.dueDate))
    if (!bucket) return
    bucket[field] = safeAdd(bucket[field], item.amount, 2)
  }

  for (const item of receivables) add(item, "inflow")
  for (const item of payables) add(item, "outflow")

  let closing = safeAdd(0, opening, 2)
  const result: CashProjectionMonth[] = []
  for (const [month, bucket] of buckets) {
    const net = safeSubtract(bucket.inflow, bucket.outflow, 2)
    closing = safeAdd(closing, net, 2)
    result.push({ month, label: formatPeriod(month), inflow: bucket.inflow, outflow: bucket.outflow, net, closing })
  }

  return result.sort((a, b) => a.month.localeCompare(b.month))
}
