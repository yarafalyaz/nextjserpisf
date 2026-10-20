/**
 * Ringkasan tagihan pekerjaan (job-billing) — read-model F-2026-10-20-03.
 *
 * Menjawab satu pertanyaan yang selama ini tak bisa dijawab dari data
 * existing: untuk satu quotation/job, berapa yang SUDAH ditagih dan berapa
 * SISA yang belum ditagih?
 *
 * - nilaiBerjalan = Quotation.grandTotal (nilai job berjalan; CO belum ada
 *   modelnya, jadi tidak ada tambahan delta — lihat F-2026-10-20-02).
 * - sudahDitagih = Σ SalesInvoice.grandTotal dengan status posted/partial/
 *   paid dan belum terhapus (deletedAt null). Draft/approved/sent/cancelled
 *   TIDAK dihitung: draft belum lahir sebagai piutang, cancelled batal.
 *   Status memakai string polos, bukan enum Prisma, supaya builder ini
 *   tetap pure dan bisa diuji tanpa mock Prisma (pola production-variance).
 * - sisa = nilaiBerjalan − sudahDitagih; negatif (overbilled) TIDAK
 *   di-clamp ke nol — overbilled adalah sinyal utk ditandai, bukan
 *   disembunyikan.
 * - sudahDibayar = Σ SalesInvoice.paidAmount pada invoice yang sama
 *   (posted/partial/paid), dilaporkan terpisah dari sudahDitagih supaya
 *   UI bisa bedakan "belum ditagih" vs "ditagih belum dibayar".
 * - DP terkonfirmasi (DownPayment status confirmed) dilaporkan terpisah
 *   sebagai uangMukaDiterima; DP BUKAN tagihan (vonis accountant
 *   F-2026-10-20-03: termin/DP = kas saja, revenue+stok hanya invoice
 *   final), jadi tidak mengurangi sisa tagihan.
 * - Kredit pelanggan terbuka (F-2026-10-20-43): saldo CustomerCredit
 *   status open, saldo = received − allocated − refunded per baris
 *   sen-aman, hanya baris saldo > 0 yang dilaporkan. kreditTerbuka
 *   TIDAK mengurangi sisaBelumDitagih/sisaBelumDibayar — ia prepayment
 *   pelanggan, bukan tagihan. sisaEfektif = sisaBelumDibayar −
 *   kreditTerbuka (tampil saja, bisa negatif = dana pelanggan masih
 *   di tangan bengkel melebihi sisa tagihan).
 *
 * Pure (tanpa Prisma/DOM). Loader DB ada di job-billing-summary-data.ts.
 */

import { safeRound, safeSubtract, safeSum } from "@/lib/utils/math"

/** Status invoice yang dihitung sebagai "sudah ditagih". */
export const BILLED_INVOICE_STATUSES = ["posted", "partial", "paid"] as const

export interface JobBillingInvoiceInput {
  id: number
  documentNo: string
  status: string
  grandTotal: number
  paidAmount: number
  deletedAt: Date | null
}

export interface JobBillingSummaryInput {
  quotationId: number
  quotationDocumentNo: string
  /** Quotation.grandTotal — nilai job berjalan. */
  nilaiBerjalan: number
  invoices: JobBillingInvoiceInput[]
  /** DownPayment yang sudah terkonfirmasi (status confirmed). */
  confirmedDownPayments: { amount: number }[]
  /** Baris CustomerCredit terbuka milik quotation/customer ini. */
  openCustomerCredits?: JobBillingCreditInput[]
}

export interface JobBillingCreditInput {
  id: number
  documentNo: string
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
}

export interface JobBillingCreditLine {
  id: number
  documentNo: string
  /** received − allocated − refunded, sen-aman. */
  saldo: number
}

export interface JobBillingInvoiceLine {
  id: number
  documentNo: string
  status: string
  grandTotal: number
  paidAmount: number
}

export interface JobBillingSummary {
  quotationId: number
  quotationDocumentNo: string
  nilaiBerjalan: number
  /** Σ grandTotal invoice posted/partial/paid non-deleted. */
  sudahDitagih: number
  /** Σ paidAmount invoice yang sama. */
  sudahDibayar: number
  /** nilaiBerjalan − sudahDitagih (bisa negatif = overbilled). */
  sisaBelumDitagih: number
  /** sudahDitagih − sudahDibayar. */
  sisaBelumDibayar: number
  /** Σ DownPayment confirmed — kas diterima, bukan tagihan. */
  uangMukaDiterima: number
  /** Σ saldo CustomerCredit terbuka (bukan tagihan). */
  kreditTerbuka: number
  /** sisaBelumDibayar − kreditTerbuka (tampil saja; bisa negatif). */
  sisaEfektif: number
  /** Baris kredit terbuka bersaldo > 0, urut id naik. */
  openCredits: JobBillingCreditLine[]
  /** sudahDitagih > nilaiBerjalan. */
  overbilled: boolean
  /** Baris invoice yang terhitung, urut id naik. */
  billedInvoices: JobBillingInvoiceLine[]
}

function round2(value: number): number {
  return safeRound(value, 2)
}

export function isBilledInvoice(invoice: JobBillingInvoiceInput): boolean {
  return (
    invoice.deletedAt === null &&
    (BILLED_INVOICE_STATUSES as readonly string[]).includes(invoice.status)
  )
}

export function buildJobBillingSummary(input: JobBillingSummaryInput): JobBillingSummary {
  const billed = input.invoices
    .filter(isBilledInvoice)
    .sort((a, b) => a.id - b.id)

  const nilaiBerjalan = round2(input.nilaiBerjalan)
  const sudahDitagih = safeSum(billed.map((i) => i.grandTotal), 2)
  const sudahDibayar = safeSum(billed.map((i) => i.paidAmount), 2)
  const sisaBelumDibayar = safeSubtract(sudahDitagih, sudahDibayar, 2)

  const openCredits = (input.openCustomerCredits ?? [])
    .map((c) => ({
      id: c.id,
      documentNo: c.documentNo,
      saldo: safeSubtract(
        safeSubtract(c.receivedAmount, c.allocatedAmount, 2),
        c.refundedAmount,
        2,
      ),
    }))
    .filter((c) => c.saldo > 0)
    .sort((a, b) => a.id - b.id)
  const kreditTerbuka = safeSum(openCredits.map((c) => c.saldo), 2)

  return {
    quotationId: input.quotationId,
    quotationDocumentNo: input.quotationDocumentNo,
    nilaiBerjalan,
    sudahDitagih,
    sudahDibayar,
    sisaBelumDitagih: safeSubtract(nilaiBerjalan, sudahDitagih, 2),
    sisaBelumDibayar,
    uangMukaDiterima: safeSum(input.confirmedDownPayments.map((d) => d.amount), 2),
    kreditTerbuka,
    sisaEfektif: safeSubtract(sisaBelumDibayar, kreditTerbuka, 2),
    openCredits,
    overbilled: sudahDitagih > nilaiBerjalan,
    billedInvoices: billed.map((i) => ({
      id: i.id,
      documentNo: i.documentNo,
      status: i.status,
      grandTotal: round2(i.grandTotal),
      paidAmount: round2(i.paidAmount),
    })),
  }
}
