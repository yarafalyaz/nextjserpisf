/**
 * Customer receivables analytics: outstanding vs credit limit, and the average
 * payment delay (DSO proxy) derived from actual invoice/payment dates.
 *
 * Pure by design (no Prisma) so the credit-utilisation and weighted-average
 * arithmetic can be unit tested.
 */

import { formatNumber } from "@/lib/utils/format"
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
    `Rp${formatNumber(value, 2)}`
  return `Lewat batas kredit ${fmt(overBy)} (batas ${fmt(row.creditLimit)}, terutang ${fmt(row.outstanding)})`
}

/**
 * F-2026-10-21-017 lapis aman + F-2026-10-21-017-S (vonis BOT 4
 * F-2026-10-22-044-V): paparan kredit penuh per pelanggan.
 * PaparanKasar = K1 piutang terbuka + K2 SO confirmed/processing/completed
 * belum tertagih (grandTotal SO dikurangi porsi invoice recognised)
 * + K5 WO berjalan belum terwakili (per quotation tanpa SO:
 * max(0, Quotation.grandTotal − invoice recognised − SO non-cancelled
 * ber-quotationId); dihitung loader per quotation, bukan per WO).
 * PaparanBersih (field `exposure`) = max(0, PaparanKasar − K3 − K4):
 * K3 = DP confirmed EFEKTIF pilihan (b) vonis V3 — loader hanya meneruskan
 * DP confirmed yang quotation-nya belum punya invoice recognised, karena DP
 * terkonversi sudah mengurangi K1 lewat paidAmount (down-payment.hook);
 * K4 = CustomerCredit status open, saldo max(0, received−allocated−refunded)
 * per baris (label USULAN spec BR-CR-05, disahkan advisory vonis V2 —
 * tampil terpisah, bukan dasar gate).
 * Advisory saja — tidak menahan dokumen; inti gerbang DITUNDA (vonis V7).
 * Limit 0 = belum diatur (BUKAN tanpa limit, BUKAN blokir); status "unset".
 */
export interface CustomerCreditExposureInput extends CustomerReceivableInput {
  openOrderAmount: number
  /** K3 efektif (pilihan b vonis V3); opsional agar pemanggil lama tetap sah. */
  confirmedDownPayment?: number
  /** K4: saldo CustomerCredit terbuka; opsional, default 0. */
  openCustomerCredit?: number
  /** K5: nilai WO berjalan belum terwakili per quotation; opsional, default 0. */
  woUnrepresented?: number
  /** Bendera AC-CR-09: WO aktif tanpa quotationId (K5-nya 0, bukan tebakan ProductionCost). */
  woWithoutQuotationCount?: number
}

export interface CustomerCreditExposureRow extends CustomerCreditExposureInput {
  /** PaparanKasar = K1 + K2 + K5, sebelum pengurang. */
  grossExposure: number
  /** PaparanBersih = max(0, grossExposure − K3 − K4). */
  exposure: number
  remainingCredit: number
  utilization: number | null
  status: "unset" | "ok" | "warning" | "over"
}

export const CREDIT_EXPOSURE_STATUS_LABEL: Record<CustomerCreditExposureRow["status"], string> = {
  unset: "Limit belum diatur",
  ok: "Aman",
  warning: "Mendekati batas",
  over: "Lewat batas",
}

export function buildCustomerCreditExposure(rows: CustomerCreditExposureInput[]): CustomerCreditExposureRow[] {
  return rows
    .map((row) => {
      const dp = Math.max(0, row.confirmedDownPayment ?? 0)
      const credit = Math.max(0, row.openCustomerCredit ?? 0)
      const wo = Math.max(0, row.woUnrepresented ?? 0)
      const grossExposure = safeAdd(safeAdd(row.outstanding, row.openOrderAmount, 2), wo, 2)
      const exposure = Math.max(0, safeSubtract(grossExposure, safeAdd(dp, credit, 2), 2))
      const remainingCredit = safeSubtract(row.creditLimit, exposure, 2)
      const utilization = row.creditLimit > 0 ? Math.round((exposure / row.creditLimit) * 10000) / 100 : null
      const status: CustomerCreditExposureRow["status"] =
        row.creditLimit <= 0 ? "unset" : utilization != null && utilization >= 100 ? "over" : utilization != null && utilization >= 80 ? "warning" : "ok"
      return { ...row, grossExposure, exposure, remainingCredit, utilization, status }
    })
    .sort((a, b) => b.exposure - a.exposure)
}

/** K3 efektif pilihan (b) vonis V3: DP confirmed yang quotation-nya sudah
 *  punya invoice recognised gugur (sudah tercermin di K1 lewat paidAmount). */
export function effectiveConfirmedDownPaymentByCustomer(
  downPayments: { customerId: number; quotationId: number; amount: number }[],
  convertedQuotationIds: ReadonlySet<number>,
): Map<number, number> {
  const byCustomer = new Map<number, number>()
  for (const dp of downPayments) {
    if (convertedQuotationIds.has(dp.quotationId)) continue
    byCustomer.set(dp.customerId, safeAdd(byCustomer.get(dp.customerId) ?? 0, dp.amount, 2))
  }
  return byCustomer
}

/** K4: saldo CustomerCredit terbuka per pelanggan; baris non-open gugur di
 *  query loader, saldo per baris dijepit max(0, received−allocated−refunded). */
export function openCustomerCreditByCustomer(
  credits: { customerId: number; receivedAmount: number; allocatedAmount: number; refundedAmount: number }[],
): Map<number, number> {
  const byCustomer = new Map<number, number>()
  for (const credit of credits) {
    const balance = Math.max(0, safeSubtract(safeSubtract(credit.receivedAmount, credit.allocatedAmount, 2), credit.refundedAmount, 2))
    if (balance <= 0) continue
    byCustomer.set(credit.customerId, safeAdd(byCustomer.get(credit.customerId) ?? 0, balance, 2))
  }
  return byCustomer
}

/** K5 per quotation (vonis V3): WO aktif memberi nilai hanya bila quotation
 *  belum punya SO sama sekali; nilai = max(0, grandTotal − invoice
 *  recognised − SO non-cancelled ber-quotationId). Dua WO satu quotation
 *  tidak menggandakan. Diatribusi ke customerId quotation. */
export function woUnrepresentedByCustomer(input: {
  workOrders: { customerId: number; quotationId: number | null }[]
  quotations: { id: number; customerId: number; grandTotal: number }[]
  salesOrders: { quotationId: number | null; grandTotal: number }[]
  invoices: { quotationId: number | null; grandTotal: number }[]
}): { byCustomer: Map<number, number>; withoutQuotationByCustomer: Map<number, number> } {
  const withoutQuotationByCustomer = new Map<number, number>()
  const activeQuotationIds = new Set<number>()
  for (const wo of input.workOrders) {
    if (wo.quotationId == null) {
      withoutQuotationByCustomer.set(wo.customerId, (withoutQuotationByCustomer.get(wo.customerId) ?? 0) + 1)
    } else {
      activeQuotationIds.add(wo.quotationId)
    }
  }
  const quotationsWithOrder = new Set<number>()
  const orderTotalByQuotation = new Map<number, number>()
  for (const order of input.salesOrders) {
    if (order.quotationId == null || !activeQuotationIds.has(order.quotationId)) continue
    quotationsWithOrder.add(order.quotationId)
    orderTotalByQuotation.set(order.quotationId, safeAdd(orderTotalByQuotation.get(order.quotationId) ?? 0, order.grandTotal, 2))
  }
  const invoicedByQuotation = new Map<number, number>()
  for (const inv of input.invoices) {
    if (inv.quotationId == null || !activeQuotationIds.has(inv.quotationId)) continue
    invoicedByQuotation.set(inv.quotationId, safeAdd(invoicedByQuotation.get(inv.quotationId) ?? 0, inv.grandTotal, 2))
  }
  const byCustomer = new Map<number, number>()
  for (const quotation of input.quotations) {
    if (!activeQuotationIds.has(quotation.id) || quotationsWithOrder.has(quotation.id)) continue
    const unrepresented = Math.max(
      0,
      safeSubtract(
        safeSubtract(quotation.grandTotal, invoicedByQuotation.get(quotation.id) ?? 0, 2),
        orderTotalByQuotation.get(quotation.id) ?? 0,
        2,
      ),
    )
    if (unrepresented <= 0) continue
    byCustomer.set(quotation.customerId, safeAdd(byCustomer.get(quotation.customerId) ?? 0, unrepresented, 2))
  }
  return { byCustomer, withoutQuotationByCustomer }
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
