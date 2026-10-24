/**
 * Evaluasi masa percobaan & keputusan kontrak (F-2026-10-24-099-S) — builder
 * murni + penjaga. Sumber kebenaran: spec §2/§3/§6/§9 + putusan Lead
 * t_a52e310b (Q-PROB-1/2/3/4/6) di docs/erp-research-backlog.md.
 *
 * - Q-PROB-1: mulai percobaan = joinDate sumber tunggal (tanpa kolom mulai
 *   kedua). probationEndDate >= joinDate && <= joinDate+3 bulan kalender WIB.
 * - Q-PROB-3: skor 3 sumbu kategori tertutup {perlu_perhatian, cukup, baik}
 *   TANPA angka/gabungan (BR-PROB-05). Titik 30/60/90 kalender WIB dari
 *   joinDate; review final (milestone 90, atau titik akhir bila durasi <90)
 *   satu-satunya sumatif; 30/60 formatif boleh kosong ("belum diisi"),
 *   TIDAK memblokir final. Submit hanya dalam [dueDate, dueDate+7 hari].
 * - Q-PROB-6: kumulatif PKWT dari segmen ContractDecisionRequest APPLIED
 *   (appliedFromStartDate..appliedEndDate) + segmen berjalan + usulan
 *   extend; DILARANG rekonstruksi ActivityLog. Total <= 5 tahun kalender
 *   (tanggal akhir <= mulai segmen pertama + 5 tahun kalender WIB);
 *   contractStartDate null pada PKWT aktif = fail-closed.
 * - Status probation TURUNAN (tanggal + keputusan final), bukan kolom bebas.
 * - Tanpa nominal/kompensasi apa pun (BR-PROB-11).
 *
 * Pure (tanpa Prisma/DOM). Hari kalender WIB via wibDayNumber
 * employee-lifecycle.ts; aritmetika bulan/tahun kalender pada tanggal WIB.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/* ------------------------------------------------------------------ */
/* Kosakata tertutup                                                   */
/* ------------------------------------------------------------------ */

export const PROBATION_SCORE_CATEGORIES = ["perlu_perhatian", "cukup", "baik"] as const
export type ProbationScoreCategory = (typeof PROBATION_SCORE_CATEGORIES)[number]

export const PROBATION_RECOMMENDATIONS = [
  "lanjut",
  "perhatian_khusus",
  "tidak_lulus_diusulkan",
] as const
export type ProbationRecommendation = (typeof PROBATION_RECOMMENDATIONS)[number]

export const PROBATION_REVIEW_STATUSES = ["draft", "submitted", "decided"] as const
export type ProbationReviewStatus = (typeof PROBATION_REVIEW_STATUSES)[number]

export const PROBATION_FINAL_DECISIONS = ["passed", "extended", "failed"] as const
export type ProbationFinalDecision = (typeof PROBATION_FINAL_DECISIONS)[number]

export const CONTRACT_DECISION_KINDS = ["extend_pkwt", "convert_pkwtt", "end_contract"] as const
export type ContractDecisionKind = (typeof CONTRACT_DECISION_KINDS)[number]

export const CONTRACT_DECISION_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
  "cancelled",
] as const
export type ContractDecisionStatus = (typeof CONTRACT_DECISION_STATUSES)[number]

export const PROBATION_SCORE_LABELS: Record<ProbationScoreCategory, string> = {
  perlu_perhatian: "Perlu Perhatian",
  cukup: "Cukup",
  baik: "Baik",
}

export const PROBATION_RECOMMENDATION_LABELS: Record<ProbationRecommendation, string> = {
  lanjut: "Lanjut",
  perhatian_khusus: "Perhatian Khusus",
  tidak_lulus_diusulkan: "Tidak Lulus Diusulkan",
}

export const PROBATION_FINAL_DECISION_LABELS: Record<ProbationFinalDecision, string> = {
  passed: "Lulus",
  extended: "Perpanjang Percobaan",
  failed: "Tidak Lulus",
}

export const CONTRACT_DECISION_KIND_LABELS: Record<ContractDecisionKind, string> = {
  extend_pkwt: "Perpanjang Kontrak (PKWT)",
  convert_pkwtt: "Angkat Tetap (PKWTT)",
  end_contract: "Selesai Tanpa Perpanjangan",
}

export function isProbationScoreCategory(value: unknown): value is ProbationScoreCategory {
  return typeof value === "string" && (PROBATION_SCORE_CATEGORIES as readonly string[]).includes(value)
}

export function isProbationRecommendation(value: unknown): value is ProbationRecommendation {
  return typeof value === "string" && (PROBATION_RECOMMENDATIONS as readonly string[]).includes(value)
}

export function isProbationFinalDecision(value: unknown): value is ProbationFinalDecision {
  return typeof value === "string" && (PROBATION_FINAL_DECISIONS as readonly string[]).includes(value)
}

export function isContractDecisionKind(value: unknown): value is ContractDecisionKind {
  return typeof value === "string" && (CONTRACT_DECISION_KINDS as readonly string[]).includes(value)
}

export function probationScoreLabel(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  return isProbationScoreCategory(value) ? PROBATION_SCORE_LABELS[value] : value
}

export function probationRecommendationLabel(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  return isProbationRecommendation(value) ? PROBATION_RECOMMENDATION_LABELS[value] : value
}

/* ------------------------------------------------------------------ */
/* Aritmetika tanggal kalender WIB                                     */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

interface WibYmd {
  y: number
  m: number // 1-12
  d: number
}

function toWibYmd(date: Date): WibYmd {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS)
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() }
}

function fromWibYmd({ y, m, d }: WibYmd): Date {
  // ponytail: 00:00 UTC = 07:00 WIB hari yang sama; wibDayNumber stabil.
  // Instan tengah malam WIB eksak tidak dibutuhkan penjaga hari kalender.
  return new Date(Date.UTC(y, m - 1, d))
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Tambah bulan kalender pada tanggal WIB (hari ditahan di akhir bulan bila perlu). */
export function addCalendarMonthsWib(date: Date, months: number): Date {
  const { y, m, d } = toWibYmd(date)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return fromWibYmd({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) })
}

/** Tambah tahun kalender pada tanggal WIB. */
export function addCalendarYearsWib(date: Date, years: number): Date {
  return addCalendarMonthsWib(date, years * 12)
}

/** Tambah hari kalender WIB. */
export function addDaysWib(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Selisih hari kalender WIB inklusif dua ujung (definisi tunggal segmen). */
export function inclusiveDaySpanWib(start: Date, end: Date): number {
  return wibDayNumber(end) - wibDayNumber(start) + 1
}

/* ------------------------------------------------------------------ */
/* Titik evaluasi & status turunan                                     */
/* ------------------------------------------------------------------ */

export const PROBATION_MILESTONES = ["30", "60", "90", "final"] as const
export type ProbationMilestone = (typeof PROBATION_MILESTONES)[number]

export interface ProbationMilestoneSlot {
  milestone: ProbationMilestone
  /** Titik kalender; untuk "final" <90 hari = probationEndDate. */
  dueDate: Date
  /** final = satu-satunya sumatif (Q-PROB-3). */
  isFinal: boolean
  label: string
}

/**
 * Titik evaluasi dari joinDate (Q-PROB-1/3). Durasi >= 90 hari: titik
 * 30/60/90, final = 90. Durasi < 90: titik 30/60 yang <= akhir + final di
 * probationEndDate. probationEndDate di luar (joinDate, joinDate+3 bulan]
 * = tidak ada titik (penjaga buka menolak lebih dulu).
 */
export function probationMilestoneSlots(joinDate: Date, probationEndDate: Date): ProbationMilestoneSlot[] {
  const slots: ProbationMilestoneSlot[] = []
  for (const days of [30, 60, 90] as const) {
    const due = addDaysWib(joinDate, days)
    if (wibDayNumber(due) <= wibDayNumber(probationEndDate)) {
      slots.push({
        milestone: String(days) as ProbationMilestone,
        dueDate: due,
        isFinal: days === 90,
        label: `Evaluasi Hari ke-${days}`,
      })
    }
  }
  if (!slots.some((s) => s.isFinal)) {
    slots.push({
      milestone: "final",
      dueDate: probationEndDate,
      isFinal: true,
      label: "Evaluasi Akhir Percobaan",
    })
  }
  return slots
}

export type ProbationDerivedStatus =
  | "not_in_probation"
  | "in_probation"
  | "awaiting_decision"
  | "passed"
  | "extended"
  | "failed"
  | "overdue_undecided"

export interface ProbationStateInput {
  employmentStatus: string | null
  joinDate: Date
  probationEndDate: Date | null
  /** Keputusan di baris final (status decided); null = belum diputus. */
  finalDecision: ProbationFinalDecision | null
  /** Review final sudah submitted/decided. */
  finalReviewSubmitted: boolean
}

/**
 * Status percobaan TURUNAN (Q-PROB-1, spec §2/§6). Lewat akhir tanpa
 * keputusan tetap "belum diputus" — TIDAK lulus otomatis (BR-PROB-06).
 */
export function deriveProbationStatus(input: ProbationStateInput, today: Date): ProbationDerivedStatus {
  if (input.probationEndDate == null) return "not_in_probation"
  if (input.finalDecision === "passed") return "passed"
  if (input.finalDecision === "failed") return "failed"
  if (input.finalDecision === "extended") return "extended"
  if (input.finalReviewSubmitted) return "awaiting_decision"
  if (wibDayNumber(today) > wibDayNumber(input.probationEndDate)) return "overdue_undecided"
  return "in_probation"
}

export const PROBATION_DERIVED_STATUS_LABELS: Record<ProbationDerivedStatus, string> = {
  not_in_probation: "Tidak dalam percobaan",
  in_probation: "Dalam percobaan",
  awaiting_decision: "Menunggu keputusan",
  passed: "Lulus percobaan",
  extended: "Percobaan diperpanjang",
  failed: "Tidak lulus percobaan",
  overdue_undecided: "Percobaan lewat, belum diputus",
}

/* ------------------------------------------------------------------ */
/* Penjaga murni (dipakai aksi server; dicabut = tes MERAH)            */
/* ------------------------------------------------------------------ */

export type GuardResult = { allowed: true } | { allowed: false; message: string }

const ok: GuardResult = { allowed: true }
const deny = (message: string): GuardResult => ({ allowed: false, message })

/** BR-PROB-02 + BR-PROB-04/Q-PROB-1: buka percobaan hanya PKWTT, <= 3 bulan. */
export function evaluateOpenProbation(input: {
  employmentStatus: string | null
  joinDate: Date
  probationEndDate: Date
}): GuardResult {
  if (input.employmentStatus !== "PKWTT") {
    return deny("Masa percobaan hanya dapat dibuka untuk karyawan Tetap (PKWTT)")
  }
  if (wibDayNumber(input.probationEndDate) <= wibDayNumber(input.joinDate)) {
    return deny("Tanggal akhir masa percobaan harus sesudah tanggal mulai bekerja")
  }
  if (wibDayNumber(input.probationEndDate) > wibDayNumber(addCalendarMonthsWib(input.joinDate, 3))) {
    return deny("Durasi masa percobaan tidak boleh melebihi 3 bulan sejak tanggal mulai bekerja")
  }
  return ok
}

/** BR-PROB-04: perpanjangan percobaan — total sejak joinDate tetap <= 3 bulan. */
export function evaluateExtendProbation(input: { joinDate: Date; newProbationEndDate: Date }): GuardResult {
  if (wibDayNumber(input.newProbationEndDate) > wibDayNumber(addCalendarMonthsWib(input.joinDate, 3))) {
    return deny("Perpanjangan masa percobaan tidak boleh membuat total durasi melebihi 3 bulan sejak tanggal mulai bekerja")
  }
  return ok
}

/**
 * Submit review (Q-PROB-3): jendela [dueDate, dueDate+7 hari] WIB; skor 3
 * sumbu wajib kategori sah; catatan wajib bila rekomendasi != lanjut ATAU
 * ada sumbu perlu_perhatian ("di bawah ambang" bukan ambang numerik).
 */
export function evaluateSubmitProbationReview(input: {
  dueDate: Date
  today: Date
  technicalScore: string | null
  disciplineScore: string | null
  attendanceScore: string | null
  notes: string | null
  recommendation: string | null
}): GuardResult {
  const scores = [input.technicalScore, input.disciplineScore, input.attendanceScore]
  if (scores.some((s) => !isProbationScoreCategory(s))) {
    return deny("Skor teknis, disiplin, dan kehadiran wajib diisi dengan kategori yang sah")
  }
  if (!isProbationRecommendation(input.recommendation)) {
    return deny("Rekomendasi evaluasi wajib dipilih")
  }
  const todayDay = wibDayNumber(input.today)
  const dueDay = wibDayNumber(input.dueDate)
  if (todayDay < dueDay || todayDay > dueDay + 7) {
    return deny("Evaluasi hanya dapat dikirim dalam jendela jatuh tempo sampai 7 hari sesudahnya")
  }
  const hasAttention = scores.includes("perlu_perhatian")
  const notesEmpty = input.notes == null || input.notes.trim() === ""
  if ((input.recommendation !== "lanjut" || hasAttention) && notesEmpty) {
    return deny("Catatan wajib diisi bila ada sumbu perlu perhatian atau rekomendasi bukan lanjut")
  }
  return ok
}

/** BR-PROB-07: putus akhir percobaan wajib review final submitted. */
export function evaluateDecideProbation(input: {
  finalReviewStatus: string | null
  decision: string | null
}): GuardResult {
  if (input.finalReviewStatus !== "submitted" && input.finalReviewStatus !== "decided") {
    return deny("Keputusan akhir masa percobaan wajib merujuk evaluasi final yang sudah dikirim")
  }
  if (!isProbationFinalDecision(input.decision)) {
    return deny("Keputusan akhir masa percobaan tidak valid")
  }
  return ok
}

/**
 * BR-PROB-09 + SoD penuh Q-PROB-2: penyetuju != pengaju DAN != penilai
 * review final yang dirujuk. Identitas dibandingkan sebagai Employee id.
 */
export function evaluateContractApprovalSod(input: {
  approverEmployeeId: number | null
  requestedByEmployeeId: number
  finalReviewerEmployeeId: number | null
}): GuardResult {
  if (input.approverEmployeeId != null && input.approverEmployeeId === input.requestedByEmployeeId) {
    return deny("Penyetuju tidak boleh menyetujui pengajuan yang diajukan sendiri")
  }
  if (
    input.approverEmployeeId != null &&
    input.finalReviewerEmployeeId != null &&
    input.approverEmployeeId === input.finalReviewerEmployeeId
  ) {
    return deny("Penyetuju tidak boleh sama dengan penilai evaluasi final yang dirujuk pengajuan ini")
  }
  return ok
}

/**
 * BR-PROB-08/Q-PROB-6: kumulatif PKWT. appliedSegments = segmen applied
 * sebelumnya (appliedFromStartDate..appliedEndDate); currentStart =
 * contractStartDate berjalan (null = fail-closed); proposalEnd khusus
 * extend_pkwt. Batas: akhir usulan <= mulai segmen pertama + 5 tahun
 * kalender WIB; +1 hari = tolak.
 */
export function evaluatePkwtCumulative(input: {
  kind: ContractDecisionKind
  appliedSegments: readonly { start: Date; end: Date }[]
  currentStart: Date | null
  currentEnd: Date | null
  proposedEnd: Date | null
}): GuardResult {
  if (input.kind !== "extend_pkwt") return ok
  if (input.currentStart == null) {
    return deny("Tanggal mulai kontrak berjalan belum lengkap di data karyawan; lengkapi data karyawan terlebih dahulu sebelum mengajukan perpanjangan PKWT")
  }
  if (input.proposedEnd == null) {
    return deny("Tanggal akhir kontrak usulan wajib diisi untuk perpanjangan PKWT")
  }
  if (wibDayNumber(input.proposedEnd) < wibDayNumber(input.currentStart)) {
    return deny("Tanggal akhir kontrak usulan tidak boleh sebelum tanggal mulai kontrak berjalan")
  }
  const starts = [
    ...input.appliedSegments.map((s) => s.start),
    ...(input.currentEnd != null && wibDayNumber(input.currentEnd) >= wibDayNumber(input.currentStart)
      ? [input.currentStart]
      : []),
    input.currentStart,
  ]
  const firstStart = starts.reduce((a, b) => (wibDayNumber(a) <= wibDayNumber(b) ? a : b), input.currentStart)
  const limit = addCalendarYearsWib(firstStart, 5)
  if (wibDayNumber(input.proposedEnd) > wibDayNumber(limit)) {
    return deny("Perpanjangan ditolak: total masa PKWT kumulatif akan melebihi 5 tahun")
  }
  return ok
}

/** Total hari kumulatif inklusif (satu definisi untuk builder + penjaga). */
export function pkwtCumulativeDays(input: {
  appliedSegments: readonly { start: Date; end: Date }[]
  currentStart: Date | null
  currentEnd: Date | null
  proposedEnd: Date | null
}): number | null {
  if (input.currentStart == null) return null
  let total = 0
  for (const s of input.appliedSegments) total += inclusiveDaySpanWib(s.start, s.end)
  if (input.currentEnd != null && wibDayNumber(input.currentEnd) >= wibDayNumber(input.currentStart)) {
    total += inclusiveDaySpanWib(input.currentStart, input.currentEnd)
  }
  if (input.proposedEnd != null && wibDayNumber(input.proposedEnd) >= wibDayNumber(input.currentStart)) {
    total += inclusiveDaySpanWib(input.currentStart, input.proposedEnd) - (input.currentEnd != null ? inclusiveDaySpanWib(input.currentStart, input.currentEnd) : 0)
  }
  return total
}
