/**
 * Customer receivables analytics: outstanding vs credit limit, and the average
 * payment delay (DSO proxy) derived from actual invoice/payment dates.
 *
 * Pure by design (no Prisma) so the credit-utilisation and weighted-average
 * arithmetic can be unit tested.
 */

import { safeAdd, safeDivide, safeMultiply, safeSubtract } from "@/lib/utils/math"

export interface CustomerReceivableInput {
  customerId: number
  customerName: string
  creditLimit: number
  outstanding: number
  overdue: number
  invoiceCount: number
}

export interface CustomerReceivableRow extends CustomerReceivableInput {
  /** creditLimit − outstanding (floor 0 when over the limit). */
  remainingCredit: number
  /** outstanding / creditLimit × 100; null when no limit is configured. */
  utilization: number | null
}

export function buildCustomerReceivables(rows: CustomerReceivableInput[]): CustomerReceivableRow[] {
  return rows
    .map((row) => ({
      ...row,
      remainingCredit: safeSubtract(row.creditLimit, row.outstanding, 2),
      utilization: row.creditLimit > 0 ? Math.round((row.outstanding / row.creditLimit) * 10000) / 100 : null,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

/** Plain-money label for a customer over their credit limit; null within
 *  limit. Limit 0 = no limit configured, never "over". Advisory only —
 *  never blocks saving. */
export function creditOverLimitLabel(row: CustomerReceivableInput): string | null {
  if (row.creditLimit <= 0) return null
  const overBy = safeSubtract(row.outstanding, row.creditLimit, 2)
  if (overBy <= 0) return null
  const fmt = (value: number) =>
    `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`
  return `Lewat batas kredit ${fmt(overBy)} (batas ${fmt(row.creditLimit)}, terutang ${fmt(row.outstanding)})`
}

/**
 * F-2026-10-21-017 lapis aman: paparan kredit penuh per pelanggan =
 * piutang terbuka + SO confirmed/processing/completed yang belum tertagih
 * (grandTotal SO dikurangi porsi yang sudah jadi invoice recognised)
 * dikurangi DP confirmed (uang muka terkonfirmasi sudah diterima kas,
 * jadi porsi itu tidak lagi berisiko; dijepit >= 0).
 * Advisory saja — tidak menahan dokumen; inti gerbang = putusan team-lead.
 * Limit 0 = belum diatur (BUKAN tanpa limit, BUKAN blokir); status "unset".
 */
export interface CustomerCreditExposureInput extends CustomerReceivableInput {
  openOrderAmount: number
  /** Total DP status confirmed per pelanggan; opsional agar pemanggil lama tetap sah. */
  confirmedDownPayment?: number
}

export interface CustomerCreditExposureRow extends CustomerCreditExposureInput {
  exposure: number
  remainingCredit: number
  utilization: number | null
  status: "unset" | "ok" | "warning" | "over"
}

export function buildCustomerCreditExposure(rows: CustomerCreditExposureInput[]): CustomerCreditExposureRow[] {
  return rows
    .map((row) => {
      const dp = Math.max(0, row.confirmedDownPayment ?? 0)
      const exposure = Math.max(0, safeSubtract(safeAdd(row.outstanding, row.openOrderAmount, 2), dp, 2))
      const remainingCredit = safeSubtract(row.creditLimit, exposure, 2)
      const utilization = row.creditLimit > 0 ? Math.round((exposure / row.creditLimit) * 10000) / 100 : null
      const status: CustomerCreditExposureRow["status"] =
        row.creditLimit <= 0 ? "unset" : utilization != null && utilization >= 100 ? "over" : utilization != null && utilization >= 80 ? "warning" : "ok"
      return { ...row, exposure, remainingCredit, utilization, status }
    })
    .sort((a, b) => b.exposure - a.exposure)
}

/**
 * Amount-weighted average days between invoice date and payment date.
 * Returns null when there is no payment to average.
 */
export function averagePaymentDays(
  payments: { invoiceDate: Date; paymentDate: Date; amount: number }[],
): number | null {
  if (payments.length === 0) return null

  let weighted = 0
  let total = 0
  for (const payment of payments) {
    const days = Math.max(
      0,
      Math.round((payment.paymentDate.getTime() - payment.invoiceDate.getTime()) / 86_400_000),
    )
    weighted = safeAdd(weighted, safeMultiply(days, payment.amount, 4), 4)
    total = safeAdd(total, payment.amount, 4)
  }

  if (total === 0) return null
  return Math.round(safeDivide(weighted, total, 4))
}
