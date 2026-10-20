/**
 * Builder murni F-2026-10-20-58 + sub-bagian aman F-2026-10-20-59.
 *
 * F-58 — invoice progres: target kumulatif tertagih = persen × nilai
 * kontrak berjalan (Quotation.grandTotal). Kandidat progres = target −
 * sudah-tertagih. "Sudah tertagih" memakai DEFINISI SAMA dengan faktur
 * selisih (job-billing-difference): semua invoice non-cancelled lewat
 * tiga jembatan, draft ikut memesan porsi. Satu definisi di dua jalur
 * mencegah progres + selisih menagih porsi yang sama dua kali.
 *
 * F-59-aman — kandidat kredit revisi-turun: kelebihan = max(tertagih,
 * DP-confirmed) − nilai berjalan, dikurangi kredit RevisionDown yang
 * sudah tercatat untuk quotation ini (anti dobel antar-submit) dan
 * kredit DownPayment per DP sumber (jalur DP existing sudah mencatat
 * kelebihan per DP — jangan dicatat ulang di sini). Kredit lahir dengan
 * sourceType "RevisionDown" + sourceId = quotationId: satu sumber per
 * quotation, terpisah dari sumber DownPayment/Quotation existing.
 *
 * DP BUKAN tagihan (vonis accountant F-03): DP tidak mengurangi target
 * progres — ia hanya lantai untuk kandidat kredit (uang pelanggan yang
 * sudah di tangan bengkel tidak boleh hilang saat nilai turun).
 *
 * Pure (tanpa Prisma/DOM). Aksi tulis (createProgressInvoice /
 * createRevisionDownCredit) = tahap berikut sesudah vonis accountant
 * untuk jurnal inti F-59; builder ini tidak menulis apa pun.
 */

import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"
import type { DifferenceInvoiceInput } from "./job-billing-difference"

/** Σ invoice non-cancelled (definisi faktur selisih, draft memesan porsi). */
export function billedAmountExcludingCancelled(invoices: DifferenceInvoiceInput[]): number {
  return invoices
    .filter((inv) => inv.status !== "cancelled")
    .reduce((sum, inv) => safeAdd(sum, inv.grandTotal, 2), 0)
}

export interface ProgressInvoiceCandidate {
  eligible: boolean
  /** Nilai kontrak berjalan (Quotation.grandTotal). */
  contractValue: number
  /** Persen target kumulatif yang diminta (0..100). */
  targetPercent: number
  /** persen × contractValue, sen-aman. */
  targetBilled: number
  /** Σ invoice non-cancelled. */
  alreadyBilled: number
  /** targetBilled − alreadyBilled (nominal invoice progres DRAFT). */
  progressAmount: number
  /** contractValue − alreadyBilled (sisa sesudah progres ini bila dibuat). */
  remainingAfter: number
  reason: string | null
}

export function computeProgressInvoiceCandidate(input: {
  quotationGrandTotal: number
  targetPercent: number
  invoices: DifferenceInvoiceInput[]
}): ProgressInvoiceCandidate {
  const contractValue = safeRound(input.quotationGrandTotal, 2)
  const alreadyBilled = billedAmountExcludingCancelled(input.invoices)
  const base = {
    contractValue,
    targetPercent: input.targetPercent,
    alreadyBilled,
    remainingAfter: safeSubtract(contractValue, alreadyBilled, 2),
  }
  if (!(input.targetPercent > 0) || input.targetPercent > 100) {
    return {
      ...base,
      targetBilled: 0,
      progressAmount: 0,
      eligible: false,
      reason: "Persen progres harus lebih dari 0 dan maksimal 100",
    }
  }
  if (contractValue <= 0) {
    return {
      ...base,
      targetBilled: 0,
      progressAmount: 0,
      eligible: false,
      reason: "Nilai kontrak berjalan tidak positif; tidak ada dasar progres",
    }
  }
  const targetBilled = safeMultiply(contractValue, input.targetPercent / 100, 2)
  const progressAmount = safeSubtract(targetBilled, alreadyBilled, 2)
  if (progressAmount <= 0) {
    return {
      ...base,
      targetBilled,
      progressAmount,
      eligible: false,
      reason:
        progressAmount === 0
          ? "Target progres sudah tertagih penuh"
          : "Target progres di bawah total tertagih; kelebihan ditangani lewat kredit revisi-turun, bukan invoice progres",
    }
  }
  return { ...base, targetBilled, progressAmount, eligible: true, reason: null }
}

export interface RevisionDownCreditCandidate {
  eligible: boolean
  /** Nilai kontrak berjalan. */
  contractValue: number
  /** Σ invoice non-cancelled. */
  billedAmount: number
  /** Σ DownPayment confirmed. */
  confirmedDownPayment: number
  /** max(billed, DP) — uang/tagihan pelanggan yang sudah terikat. */
  committedAmount: number
  /** committed − contractValue (kelebihan bruto). */
  excessAmount: number
  /** Σ kredit RevisionDown existing untuk quotation ini. */
  existingRevisionDownCredit: number
  /** Σ kredit DownPayment existing (per DP sumber). */
  existingDownPaymentCredit: number
  /** Nominal kredit baru yang boleh dibuat (0 bila tidak eligible). */
  creditAmount: number
  reason: string | null
}

export function computeRevisionDownCreditCandidate(input: {
  quotationGrandTotal: number
  invoices: DifferenceInvoiceInput[]
  confirmedDownPayments: { amount: number }[]
  /** Kredit sourceType RevisionDown yang sudah ada untuk quotation ini. */
  existingRevisionDownCredits: { receivedAmount: number; allocatedAmount: number; refundedAmount: number }[]
  /** Kredit sourceType DownPayment untuk DP quotation ini. */
  existingDownPaymentCredits: { receivedAmount: number }[]
}): RevisionDownCreditCandidate {
  const contractValue = safeRound(input.quotationGrandTotal, 2)
  const billedAmount = billedAmountExcludingCancelled(input.invoices)
  const confirmedDownPayment = input.confirmedDownPayments.reduce(
    (sum, d) => safeAdd(sum, d.amount, 2),
    0,
  )
  const committedAmount = Math.max(billedAmount, confirmedDownPayment)
  const excessAmount = safeSubtract(committedAmount, contractValue, 2)
  const existingRevisionDownCredit = input.existingRevisionDownCredits.reduce(
    (sum, c) => safeAdd(sum, c.receivedAmount, 2),
    0,
  )
  const existingDownPaymentCredit = input.existingDownPaymentCredits.reduce(
    (sum, c) => safeAdd(sum, c.receivedAmount, 2),
    0,
  )
  const alreadyCredited = safeAdd(existingRevisionDownCredit, existingDownPaymentCredit, 2)
  const base = {
    contractValue,
    billedAmount,
    confirmedDownPayment,
    committedAmount,
    excessAmount,
    existingRevisionDownCredit,
    existingDownPaymentCredit,
  }
  if (excessAmount <= 0) {
    return {
      ...base,
      creditAmount: 0,
      eligible: false,
      reason: "Tidak ada kelebihan: tertagih dan DP terkonfirmasi tidak melebihi nilai berjalan",
    }
  }
  const creditAmount = safeSubtract(excessAmount, alreadyCredited, 2)
  if (creditAmount <= 0) {
    return {
      ...base,
      creditAmount: 0,
      eligible: false,
      reason: "Kelebihan revisi-turun sudah tercatat sebagai kredit pelanggan",
    }
  }
  return { ...base, creditAmount, eligible: true, reason: null }
}
