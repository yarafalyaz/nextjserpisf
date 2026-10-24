/**
 * Builder murni denda piutang (F-2026-10-22-093-V, vonis BOT 4 PR #563).
 *
 * Dokumen tagih TERPISAH: builder ini TIDAK PERNAH menyentuh nominal
 * faktur asal (E93-4), tidak menghitung otomatis untuk antrean
 * (BR-COL-07 — pemanggil menerbitkan eksplisit per faktur), tanpa PPN.
 *
 * Syarat sah (P2, fail-closed):
 *  (a) syarat kontraktual efektif SEBELUM due acuan dan masih berlaku
 *      pada due acuan; tepat satu basis tarif (rate XOR flat);
 *  (b) faktur posted/partial, sisa > 0, lewat due acuan;
 *  (d) akun pendapatan denda terisi (divalidasi hook, bukan di sini).
 *
 * Nominal: X = basis-snapshot × tarif × hari, plafon bila ada,
 * safeRound sen pola math repo (P3). Hari = selisih hari kalender
 * due acuan → tanggal terbit (basis tanggal lokal, bukan jam mentah).
 */

import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { safeRound } from "@/lib/utils/math"

export const LATE_FEE_STATUSES = [
  "draft",
  "posted",
  "partial",
  "paid",
  "reversed",
] as const
export type LateFeeStatus = (typeof LATE_FEE_STATUSES)[number]

export interface LateFeeTermSnapshot {
  id: number
  ratePercentPerDay: number | null
  flatAmountPerDay: number | null
  capAmount: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
}

export interface LateFeeInvoiceSnapshot {
  status: string
  grandTotal: number
  paidAmount: number
  /** Due acuan BR-COL-03: exchange.dueDate bila ada else faktur.dueDate. */
  dueReferenceDate: Date | null
}

export interface LateFeeComputation {
  termId: number
  dueReferenceDate: Date
  overdueDays: number
  basisAmount: number
  ratePercentPerDay: number | null
  flatAmountPerDay: number | null
  capAmount: number | null
  amount: number
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function computeOverdueDays(dueReferenceDate: Date, asOf: Date): number {
  const ms = startOfLocalDay(asOf) - startOfLocalDay(dueReferenceDate)
  return Math.floor(ms / 86_400_000)
}

/** Syarat berlaku pada due acuan: efektif SEBELUM due, belum berakhir di due. */
export function isTermEffectiveForDue(
  term: Pick<LateFeeTermSnapshot, "effectiveFrom" | "effectiveTo">,
  dueReferenceDate: Date,
): boolean {
  if (startOfLocalDay(term.effectiveFrom) >= startOfLocalDay(dueReferenceDate)) return false
  if (term.effectiveTo && startOfLocalDay(term.effectiveTo) < startOfLocalDay(dueReferenceDate)) return false
  return true
}

/**
 * Hitung denda dari snapshot. Lempar Error Bahasa Indonesia bila syarat
 * P2 tidak terpenuhi — pemanggil (action) menerjemahkan ke hasil gagal,
 * TIDAK ada fallback diam-diam.
 */
export function computeLateFeeAmount(input: {
  invoice: LateFeeInvoiceSnapshot
  term: LateFeeTermSnapshot | null
  asOf: Date
}): LateFeeComputation {
  const { invoice, term, asOf } = input

  if (!term) {
    throw new Error(
      "Dokumen denda ditolak: pelanggan belum punya syarat denda kontraktual bertanggal efektif.",
    )
  }
  const hasRate = term.ratePercentPerDay != null
  const hasFlat = term.flatAmountPerDay != null
  if (hasRate === hasFlat) {
    throw new Error(
      "Dokumen denda ditolak: syarat denda wajib tepat satu basis tarif (persen per hari atau nominal per hari).",
    )
  }
  if (hasRate && !(Number(term.ratePercentPerDay) > 0)) {
    throw new Error("Dokumen denda ditolak: tarif persen per hari harus lebih dari nol.")
  }
  if (hasFlat && !(Number(term.flatAmountPerDay) > 0)) {
    throw new Error("Dokumen denda ditolak: tarif nominal per hari harus lebih dari nol.")
  }

  if (invoice.status !== "posted" && invoice.status !== "partial") {
    throw new Error("Dokumen denda hanya untuk faktur yang sudah diposting dan belum lunas.")
  }
  const basisAmount = receivableOutstanding(invoice.grandTotal, invoice.paidAmount)
  if (basisAmount <= 0.005) {
    throw new Error("Dokumen denda ditolak: faktur tidak punya sisa piutang.")
  }
  if (!invoice.dueReferenceDate) {
    throw new Error("Dokumen denda ditolak: faktur belum punya tanggal jatuh tempo acuan.")
  }
  const dueReferenceDate = invoice.dueReferenceDate

  if (!isTermEffectiveForDue(term, dueReferenceDate)) {
    throw new Error(
      "Dokumen denda ditolak: syarat denda harus berlaku efektif sebelum tanggal jatuh tempo faktur.",
    )
  }

  const overdueDays = computeOverdueDays(dueReferenceDate, asOf)
  if (overdueDays <= 0) {
    throw new Error("Dokumen denda ditolak: faktur belum melewati tanggal jatuh tempo.")
  }

  let amount: number
  if (hasRate) {
    amount = safeRound((basisAmount * Number(term.ratePercentPerDay) * overdueDays) / 100, 2)
  } else {
    amount = safeRound(Number(term.flatAmountPerDay) * overdueDays, 2)
  }
  if (term.capAmount != null && amount > Number(term.capAmount)) {
    amount = safeRound(Number(term.capAmount), 2)
  }
  if (!(amount > 0)) {
    throw new Error("Dokumen denda ditolak: nominal denda hasil hitung harus lebih dari nol.")
  }

  return {
    termId: term.id,
    dueReferenceDate,
    overdueDays,
    basisAmount,
    ratePercentPerDay: hasRate ? Number(term.ratePercentPerDay) : null,
    flatAmountPerDay: hasFlat ? Number(term.flatAmountPerDay) : null,
    capAmount: term.capAmount != null ? Number(term.capAmount) : null,
    amount,
  }
}

/** Status dokumen denda sesudah pembayaran; posted/partial/paid saja. */
export function lateFeeStatusAfterPayment(amount: number, paidAmount: number): LateFeeStatus {
  if (paidAmount <= 0.005) return "posted"
  if (paidAmount >= amount - 0.005) return "paid"
  return "partial"
}

/** Sisa saldo dokumen denda (E93-7: terpisah dari sisa faktur asal). */
export function lateFeeOutstanding(amount: number, paidAmount: number): number {
  return safeRound(Number(amount) - Number(paidAmount), 2)
}
