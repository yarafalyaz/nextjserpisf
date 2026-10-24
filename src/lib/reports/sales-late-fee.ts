/**
 * Read-model murni UI dokumen denda piutang (F-2026-10-22-093-V,
 * konsumen inti BOT 3 PR #676).
 *
 * Dokumen denda = dokumen TERPISAH dari faktur asal: view ini hanya
 * menampilkan snapshot tersimpan (tarif/basis/hari/plafon/nominal) apa
 * adanya. Sisa saldo dokumen dari `lateFeeOutstanding` builder inti —
 * UI TIDAK menghitung denda (tarif × hari × basis) dan TIDAK menyediakan
 * edit nominal posted (aksi edit nominal selalu menolak, E93-6).
 * Indikator antrean = agregat dokumen posted/partial yang SUDAH terbit,
 * bukan proyeksi denda yang belum diterbitkan.
 */

import { lateFeeOutstanding } from "@/lib/reports/late-fee"
import { safeAdd } from "@/lib/utils/math"

export const SALES_LATE_FEE_TITLE = "Dokumen Denda Piutang"

export const SALES_LATE_FEE_NOTICE_TEXT =
  "Dokumen denda adalah dokumen tagih terpisah dari faktur asal. Nominal snapshot tidak bisa diubah — koreksi hanya lewat pembalikan dokumen. Saldo denda terpisah dari sisa faktur asal."

export const SALES_LATE_FEE_ACCOUNT_UNSET_TEXT =
  "Akun Pendapatan Denda Keterlambatan Piutang belum diset di Pengaturan. Penerbitan dokumen denda akan ditolak server sampai akun dipetakan."

export const LATE_FEE_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  posted: "Terbit",
  partial: "Sebagian Dibayar",
  paid: "Lunas",
  reversed: "Dibalik",
}

export interface SalesLateFeePaymentInput {
  id: number
  documentNo: string
  amount: number
  paymentDate: Date
  paymentMethod: string
  referenceNo: string | null
}

export interface SalesLateFeeDocumentInput {
  id: number
  documentNo: string
  date: Date
  dueReferenceDate: Date
  overdueDays: number
  basisAmount: number
  ratePercentPerDay: number | null
  flatAmountPerDay: number | null
  capAmount: number | null
  amount: number
  paidAmount: number
  status: string
  reversesId: number | null
  notes: string | null
  payments: SalesLateFeePaymentInput[]
}

export type SalesLateFeePaymentView = SalesLateFeePaymentInput

export interface SalesLateFeeDocumentView {
  id: number
  documentNo: string
  date: Date
  dueReferenceDate: Date
  overdueDays: number
  basisAmount: number
  ratePercentPerDay: number | null
  flatAmountPerDay: number | null
  capAmount: number | null
  amount: number
  paidAmount: number
  /** Sisa saldo dokumen denda saja (E93-7), bukan sisa faktur asal. */
  outstanding: number
  status: string
  statusLabel: string
  isReversal: boolean
  canPay: boolean
  canReverse: boolean
  notes: string | null
  payments: SalesLateFeePaymentView[]
}

export interface CustomerLateFeeTermInput {
  id: number
  ratePercentPerDay: number | null
  flatAmountPerDay: number | null
  capAmount: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
  notes: string | null
}

export interface CustomerLateFeeTermView extends CustomerLateFeeTermInput {
  rateLabel: string
}

/** Label tarif snapshot tersimpan; bukan hitung ulang nominal. */
export function lateFeeRateLabel(
  ratePercentPerDay: number | null,
  flatAmountPerDay: number | null,
): string {
  if (ratePercentPerDay != null) return `${ratePercentPerDay}% per hari`
  if (flatAmountPerDay != null) return "Nominal tetap per hari"
  return "—"
}

export function buildSalesLateFeeDocuments(
  documents: readonly SalesLateFeeDocumentInput[],
): SalesLateFeeDocumentView[] {
  return documents.map((doc) => {
    const outstanding = lateFeeOutstanding(doc.amount, doc.paidAmount)
    const open = doc.status === "posted" || doc.status === "partial"
    return {
      id: doc.id,
      documentNo: doc.documentNo,
      date: doc.date,
      dueReferenceDate: doc.dueReferenceDate,
      overdueDays: doc.overdueDays,
      basisAmount: doc.basisAmount,
      ratePercentPerDay: doc.ratePercentPerDay,
      flatAmountPerDay: doc.flatAmountPerDay,
      capAmount: doc.capAmount,
      amount: doc.amount,
      paidAmount: doc.paidAmount,
      outstanding,
      status: doc.status,
      statusLabel: LATE_FEE_STATUS_LABELS[doc.status] ?? doc.status,
      isReversal: doc.reversesId != null,
      canPay: open && outstanding > 0.005,
      canReverse: open,
      notes: doc.notes,
      payments: doc.payments.map((payment) => ({ ...payment })),
    }
  })
}

export function buildCustomerLateFeeTerms(
  terms: readonly CustomerLateFeeTermInput[],
): CustomerLateFeeTermView[] {
  return terms.map((term) => ({
    ...term,
    rateLabel: lateFeeRateLabel(term.ratePercentPerDay, term.flatAmountPerDay),
  }))
}

export interface SalesLateFeePanelData {
  salesInvoiceId: number
  invoiceDocumentNo: string
  customerId: number
  customerName: string
  documents: SalesLateFeeDocumentView[]
  terms: CustomerLateFeeTermView[]
  /** Total saldo dokumen denda terbit untuk faktur ini (bukan proyeksi). */
  totalOutstanding: number
  hasOutstandingLateFee: boolean
  lateFeeIncomeAccountSet: boolean
}

export function buildSalesLateFeePanel(input: {
  salesInvoiceId: number
  invoiceDocumentNo: string
  customerId: number
  customerName: string
  documents: readonly SalesLateFeeDocumentInput[]
  terms: readonly CustomerLateFeeTermInput[]
  lateFeeIncomeAccountSet: boolean
}): SalesLateFeePanelData {
  const documents = buildSalesLateFeeDocuments(input.documents)
  const totalOutstanding = documents
    .filter((doc) => doc.status === "posted" || doc.status === "partial")
    .reduce((sum, doc) => safeAdd(sum, doc.outstanding, 2), 0)
  return {
    salesInvoiceId: input.salesInvoiceId,
    invoiceDocumentNo: input.invoiceDocumentNo,
    customerId: input.customerId,
    customerName: input.customerName,
    documents,
    terms: buildCustomerLateFeeTerms(input.terms),
    totalOutstanding,
    hasOutstandingLateFee: totalOutstanding > 0.005,
    lateFeeIncomeAccountSet: input.lateFeeIncomeAccountSet,
  }
}

/**
 * Indikator antrean penagihan: total saldo dokumen denda yang SUDAH
 * terbit (posted/partial, bukan dokumen reversal) per faktur.
 */
export function buildLateFeeOutstandingByInvoice(
  fees: readonly {
    salesInvoiceId: number
    amount: number
    paidAmount: number
    status: string
    reversesId: number | null
  }[],
): Map<number, number> {
  const byInvoice = new Map<number, number>()
  for (const fee of fees) {
    if (fee.status !== "posted" && fee.status !== "partial") continue
    if (fee.reversesId != null) continue
    const outstanding = lateFeeOutstanding(fee.amount, fee.paidAmount)
    if (outstanding <= 0.005) continue
    byInvoice.set(
      fee.salesInvoiceId,
      safeAdd(byInvoice.get(fee.salesInvoiceId) ?? 0, outstanding, 2),
    )
  }
  return byInvoice
}
