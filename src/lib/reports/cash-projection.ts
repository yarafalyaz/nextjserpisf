/**
 * Simple cash projection from the documents that will move money.
 *
 * Pure by design (no Prisma): the caller supplies the opening cash balance plus
 * the outstanding receivables (inflow) and payables (outflow) with their due
 * dates; this module buckets them per month and accumulates the closing balance.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { formatPeriod } from "@/lib/utils/format"

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

/**
 * Komitmen kas yang belum tertagih (F-2026-10-20-48(b)).
 *
 * Ditampilkan sebagai MEMO terpisah di proyeksi kas — TIDAK dicampur ke
 * saldo proyeksi utama: PO terbuka belum jadi tagihan, payroll bulan
 * depan belum jatuh tempo dokumen. Estimasi payroll = total netSalary
 * periode payroll terakhir (proxy kas keluar gaji bulan berikutnya).
 */
export interface OpenCommitmentSummary {
  openPurchaseOrderCount: number
  /** Sisa qty x harga per baris PO terbuka (belum diterima). */
  openPurchaseAmount: number
  /** Periode payroll terakhir yang jadi basis estimasi (YYYY-MM), bila ada. */
  payrollPeriod: string | null
  estimatedPayrollAmount: number
  total: number
}

export function summarizeOpenCommitments(input: {
  purchaseOrders: { status: string; items: { qty: number; receivedQty: number; unitPrice: number }[] }[]
  payrollPeriod: string | null
  payrollNetTotal: number
}): OpenCommitmentSummary {
  const open = input.purchaseOrders.filter(
    (po) => po.status === "ordered" || po.status === "partial_received",
  )
  const openPurchaseAmount = open.reduce(
    (sum, po) =>
      po.items.reduce(
        (s, i) => safeAdd(s, Math.max(i.qty - i.receivedQty, 0) * i.unitPrice, 2),
        sum,
      ),
    0,
  )
  return {
    openPurchaseOrderCount: open.length,
    openPurchaseAmount: safeAdd(0, openPurchaseAmount, 2),
    payrollPeriod: input.payrollPeriod,
    estimatedPayrollAmount: safeAdd(0, input.payrollNetTotal, 2),
    total: safeAdd(openPurchaseAmount, input.payrollNetTotal, 2),
  }
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
