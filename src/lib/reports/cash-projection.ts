/**
 * Simple cash projection from the documents that will move money.
 *
 * Pure by design (no Prisma): the caller supplies the opening cash balance plus
 * the outstanding receivables (inflow) and payables (outflow) with their due
 * dates; this module buckets them per month and accumulates the closing balance.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { formatPeriod } from "@/lib/utils/format"
import { payableOutstandingCanonical } from "@/lib/reports/aging-amounts"

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
  balanceDue?: unknown
}

export interface ReceivableProjectionInvoice {
  id: number
  dueDate: Date | null
  grandTotal: unknown
  paidAmount: unknown
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

/**
 * Status slip yang boleh jadi basis estimasi gaji proyeksi kas — selaras
 * kontrak laporan payroll (`payroll-reports-data`: RECOGNISED_PAYROLL_STATUSES
 * = approved/paid). Filter negatif `{ not: "cancelled" }` ikut mengakui draft
 * (belum final) dan `rejected` dari approval generik; tidak ada penulis
 * produksi yang menulis `cancelled`, jadi filter itu hanya pintu lolos.
 */
export const PAYROLL_PROJECTION_STATUSES = ["approved", "paid"] as const

/**
 * Jumlah netSalary satu periode gaji dari slip mentah (satu baris per slip:
 * id + penunjuk koreksi). Slip asal yang sudah digantikan koreksi dibuang —
 * jurnalnya sudah di-reverse dan slip koreksi mengemban angka penuh
 * (R8-SDM-02, pola `payroll-reports-data`). Penunjuk koreksi dibaca tanpa
 * filter periode: asal tetap terbuang walau koreksinya lahir di periode lain.
 */
export function sumProjectionPayrollNet(
  periodSlips: readonly { id: number; netSalary: unknown }[],
  correctorSlipIds: ReadonlySet<number>,
): number {
  const total = periodSlips
    .filter((slip) => !correctorSlipIds.has(slip.id))
    .reduce((sum, slip) => sum + Number(slip.netSalary ?? 0), 0)
  return safeAdd(0, total, 2)
}

/** CashFlowItems for outstanding sales invoices: remainder is NET of completed
 * return credit (canonical outstanding = grandTotal - paidAmount - returnCredit),
 * so a fully returned unpaid invoice does not overstate projected cash inflow. */
export function buildReceivableProjectionItems(
  invoices: readonly ReceivableProjectionInvoice[],
  returnCreditByInvoiceId: ReadonlyMap<number, number>,
): CashFlowItem[] {
  return invoices
    .filter((invoice): invoice is ReceivableProjectionInvoice & { dueDate: Date } => invoice.dueDate != null)
    .map((invoice) => ({
      dueDate: invoice.dueDate,
      amount: safeSubtract(
        safeSubtract(Number(invoice.grandTotal ?? 0), Number(invoice.paidAmount ?? 0), 2),
        returnCreditByInvoiceId.get(invoice.id) ?? 0,
        2,
      ),
    }))
    .filter((row) => row.amount > 0)
}

/** CashFlowItems for outstanding vendor bills: remainder is NET of withholding
 * (same invariant as aging/payables-summary: grandTotal - withholding - paid),
 * so a bill with PPh withheld does not overstate projected cash outflow. */
export function buildPayableProjectionItems(bills: readonly PayableProjectionBill[]): CashFlowItem[] {
  return bills
    .filter((bill): bill is PayableProjectionBill & { dueDate: Date } => bill.dueDate != null)
    .map((bill) => ({
      dueDate: bill.dueDate,
      amount: payableOutstandingCanonical({
        balanceDue: bill.balanceDue == null ? null : Number(bill.balanceDue),
        grandTotal: Number(bill.grandTotal ?? 0),
        withholdingAmount: Number(bill.withholdingAmount ?? 0),
        paidAmount: Number(bill.paidAmount ?? 0),
      }),
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
