/**
 * Builder murni jadwal termin per job — F-2026-10-22-067-S inti
 * (induk F-2026-10-20-106), putusan BOT 1 Q-TM67-1/3/5 (kartu
 * t_40805adc) + vonis BOT 4 F-2026-10-22-072-V.
 *
 * Mengikat:
 * - Jangkar Quotation saja; satu jadwal aktif per Quotation.
 * - Basis persen = persen kumulatif × Quotation.grandTotal berjalan
 *   TERMASUK PPN (pola job-billing-progress). Satu basis; tidak ada
 *   basis DPP/ex-PPN di sini maupun di pemanggil.
 * - "Terpenuhi" diukur dari tertagih kumulatif
 *   billedAmountExcludingCancelled (invoice non-cancelled, draft ikut
 *   memesan porsi — definisi sama progres/selisih). DP BUKAN tagihan
 *   (vonis F-03): DP confirmed tidak pernah masuk ukuran terpenuhi.
 * - Status per termin turunan server: belum_jatuh_tempo (dueDate
 *   belum lewat) -> jatuh_tempo (dueDate lewat, tertagih < target)
 *   -> terpenuhi_sebagian (0 < tertagih < target, tanggal apa pun)
 *   -> terpenuhi (tertagih >= target). Milestone TIDAK memicu status
 *   (Q-TM67-3: belum ada event milestone tepercaya per termin).
 * - Target nominal selalu dihitung ulang dari persen × grandTotal
 *   berjalan; sisa pembulatan sen di termin terakhir supaya
 *   Σ target persis = grandTotal (vonis F-072-V butir 1 + falsifikasi
 *   BOT 6 butir 6: grandTotal Rp1, persen 33/33/34 -> Σ = Rp1).
 * - Builder ini tidak menulis apa pun dan tidak menerbitkan invoice/
 *   DP/jurnal; dueDate baris bukan input aging (aging tetap dari
 *   dueDate invoice di aging.ts).
 *
 * Pure (tanpa Prisma/DOM). Loader DB: job-payment-schedule-data.ts.
 * Aksi tulis: src/actions/job-payment-schedule.actions.ts.
 */

import { safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"
import {
  billedAmountExcludingCancelled,
} from "./job-billing-progress"
import type { DifferenceInvoiceInput } from "./job-billing-difference"

export type ProgressInvoiceInvoiceLike = DifferenceInvoiceInput

export const JOB_PAYMENT_SCHEDULE_LABEL = "Jadwal kesepakatan"

export type JobPaymentTermStatus =
  | "belum_jatuh_tempo"
  | "jatuh_tempo"
  | "terpenuhi_sebagian"
  | "terpenuhi"

/** Kata status persis untuk UI (AC-TM67-6) — UI menempel apa adanya. */
export const JOB_PAYMENT_TERM_STATUS_LABELS: Record<JobPaymentTermStatus, string> = {
  belum_jatuh_tempo: "Belum Jatuh Tempo",
  jatuh_tempo: "Jatuh Tempo",
  terpenuhi_sebagian: "Terpenuhi Sebagian",
  terpenuhi: "Terpenuhi",
}

export interface JobPaymentTermInput {
  id: number
  name: string
  /** Persen kumulatif 0..100, Decimal(5,2) di DB. */
  cumulativePercent: number
  dueDate: Date
  milestoneLabel: string | null
  sortOrder: number
}

export interface JobPaymentTermLine extends JobPaymentTermInput {
  /** Target kumulatif nominal dari persen × grandTotal berjalan. */
  targetAmount: number
  /** Porsi termin ini sendiri = target kumulatif − target kumulatif sebelumnya. */
  termAmount: number
  /** Tertagih kumulatif yang sudah mencapai target termin ini (min(tertagih, target)). */
  fulfilledAmount: number
  status: JobPaymentTermStatus
  statusLabel: string
  /** dueDate lewat kalender WIB dan termin belum terpenuhi. */
  overdue: boolean
}

export interface JobPaymentScheduleView {
  scheduleId: number
  quotationId: number
  /** Nilai kontrak berjalan (Quotation.grandTotal, termasuk PPN). */
  contractValue: number
  /** Σ invoice non-cancelled (definisi billedAmountExcludingCancelled). */
  billedAmount: number
  terms: JobPaymentTermLine[]
  /** Termin belum terpenuhi pertama (kandidat tagih berikutnya); null bila semua terpenuhi. */
  nextTermId: number | null
  allFulfilled: boolean
}

/** Hari kalender WIB (YYYY-MM-DD) dari sebuah Date, tanpa bergantung TZ proses selain offset tetap +7. */
export function wibCalendarDay(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const y = wib.getUTCFullYear()
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0")
  const d = String(wib.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function validateTerms(terms: JobPaymentTermInput[]): string | null {
  if (terms.length === 0) return "Jadwal termin wajib memiliki minimal satu baris termin"
  let prev = 0
  for (const [i, term] of terms.entries()) {
    const label = `Termin ${i + 1}${term.name ? ` (${term.name})` : ""}`
    if (!term.name || term.name.trim() === "") return `${label}: nama termin wajib diisi`
    if (!(term.cumulativePercent > 0) || term.cumulativePercent > 100) {
      return `${label}: persen kumulatif harus lebih dari 0 dan maksimal 100`
    }
    if (term.cumulativePercent <= prev) {
      return `${label}: persen kumulatif harus naik ketat dari termin sebelumnya`
    }
    prev = term.cumulativePercent
  }
  const last = terms[terms.length - 1]
  if (last.cumulativePercent !== 100) {
    return `Termin terakhir (${last.name}): persen kumulatif harus persis 100`
  }
  return null
}

/**
 * Validasi daftar termin untuk aksi tulis (dipakai server action;
 * UI tidak memvalidasi sendiri). Mengembalikan pesan error pertama
 * berbahasa Indonesia, atau null bila sah.
 */
export function validateJobPaymentTerms(
  terms: { name: string; cumulativePercent: number }[],
): string | null {
  return validateTerms(
    terms.map((t, i) => ({
      id: i,
      name: t.name,
      cumulativePercent: t.cumulativePercent,
      dueDate: new Date(0),
      milestoneLabel: null,
      sortOrder: i,
    })),
  )
}

export function buildJobPaymentScheduleView(input: {
  scheduleId: number
  quotationId: number
  quotationGrandTotal: number
  terms: JobPaymentTermInput[]
  invoices: ProgressInvoiceInvoiceLike[]
  /** Instan "sekarang" (diinjeksikan supaya deterministik di tes). */
  now: Date
}): JobPaymentScheduleView {
  const contractValue = safeRound(input.quotationGrandTotal, 2)
  const billed = billedAmountExcludingCancelled(input.invoices)
  const terms = [...input.terms].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const todayWib = wibCalendarDay(input.now)

  const lines: JobPaymentTermLine[] = []
  let prevTarget = 0
  terms.forEach((term, index) => {
    const isLast = index === terms.length - 1
    // Sisa pembulatan di termin terakhir: target terakhir persis
    // grandTotal, bukan hasil kali persen yang bisa meleset 1 sen.
    const targetAmount = isLast
      ? contractValue
      : safeMultiply(contractValue, term.cumulativePercent / 100, 2)
    const termAmount = safeSubtract(targetAmount, prevTarget, 2)
    prevTarget = targetAmount
    const fulfilledAmount = Math.min(billed, targetAmount)
    const overdue = wibCalendarDay(term.dueDate) < todayWib && billed < targetAmount
    const status: JobPaymentTermStatus =
      billed >= targetAmount
        ? "terpenuhi"
        : billed > (index === 0 ? 0 : lines[index - 1].targetAmount)
          ? "terpenuhi_sebagian"
          : overdue
            ? "jatuh_tempo"
            : "belum_jatuh_tempo"
    lines.push({
      ...term,
      targetAmount,
      termAmount,
      fulfilledAmount,
      status,
      statusLabel: JOB_PAYMENT_TERM_STATUS_LABELS[status],
      overdue,
    })
  })

  const next = lines.find((l) => l.status !== "terpenuhi") ?? null
  return {
    scheduleId: input.scheduleId,
    quotationId: input.quotationId,
    contractValue,
    billedAmount: billed,
    terms: lines,
    nextTermId: next ? next.id : null,
    allFulfilled: next === null && lines.length > 0,
  }
}
