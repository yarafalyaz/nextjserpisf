/**
 * Surat peringatan & disiplin karyawan (F-2026-10-25-005-S) — builder murni.
 * Sumber kebenaran: spec §2/§3/§6/§7/§8 di docs/erp-research-backlog.md.
 *
 * Lapisan ini SENGAJA tanpa Prisma/aksi/izin/schema: spec §10 menetapkan
 * inti DISC-B1 SESUDAH putusan Lead Q-DISC-1..4 (daftar kategori berat,
 * izin khusus, jendela tanggapan, pola rekod pembatal). Yang dikodekan di
 * sini hanya aturan yang tidak menunggu putusan itu:
 * - BR-DISC-01/02 (BENCHMARK PP 35/2021 Pasal 52): jenjang berurutan
 *   SP1→SP2→SP3, tiap SP berlaku paling lama 6 bulan kalender, lewat masa
 *   berlaku jenjang reset SP1.
 * - BR-DISC-03: masa berlaku TURUNAN dari issuedAt (bukan kolom status).
 * - BR-DISC-04: jenjang berikutnya dihitung server dari rekod issued aktif
 *   pada violationDate; pilihan bebas pengaju ditolak penjaga.
 * - BR-DISC-05: SP pertama-dan-terakhir hanya untuk kategori pada daftar
 *   berat. Daftar resmi = konstanta Q-DISC-1 di bawah (DISC-B1); penjaga
 *   tetap menerima daftar tersuntik supaya tes dapat memakai daftar lain.
 * - BR-DISC-06: SoD — penyetuju != pengaju; SP3 & pertama-dan-terakhir
 *   wajib penyetuju kedua berbeda dari pengaju dan penyetuju pertama.
 * - BR-DISC-09: pelanggaran dalam masa SP3/pertama-dan-terakhir aktif
 *   BUKAN SP4 — hasil turunan hanya tanda kajian berhenti. Nol keputusan
 *   PHK, nol nominal (BR-DISC-08): tipe di file ini tidak membawa field
 *   gaji/uang apa pun.
 * - BR-DISC-12: tanggapan karyawan menempel, tidak mengubah jenjang.
 *   Jendela 7 hari kalender dari issuedAt (Q-DISC-3) dijaga penjaga
 *   response window di bawah; lewat jendela ditolak berisik.
 *
 * Rekod `voidedAt != null` (rekod pembatal BR-DISC-10) dikecualikan dari
 * rantai jenjang (AC-DISC-10). Teguran lisan (`verbal`) tercatat tetapi
 * BUKAN SP — tidak menaikkan jenjang (§1.2).
 *
 * Pure (tanpa Prisma/DOM). Aritmetika bulan kalender WIB reuse
 * addCalendarMonthsWib dari probation.ts (satu sumber hitung).
 */

import { addCalendarMonthsWib } from "@/lib/reports/probation"
import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/* ------------------------------------------------------------------ */
/* Kosakata tertutup                                                   */
/* ------------------------------------------------------------------ */

export const DISCIPLINARY_LEVELS = ["verbal", "sp1", "sp2", "sp3", "sp_first_final"] as const
export type DisciplinaryLevel = (typeof DISCIPLINARY_LEVELS)[number]

export const DISCIPLINARY_WORKFLOW_STATUSES = [
  "draft",
  "pending_approval",
  "issued",
  "rejected",
] as const
export type DisciplinaryWorkflowStatus = (typeof DISCIPLINARY_WORKFLOW_STATUSES)[number]

/* ------------------------------------------------------------------ */
/* Kategori pelanggaran (Q-DISC-1, putusan Lead 2026-10-25)            */
/* ------------------------------------------------------------------ */

/**
 * Daftar kategori resmi fase 1 — KONSTANTA TERVALIDASI (Q-DISC-1), bukan
 * data master bebas-input dan bukan teks bebas/'lain-lain'. Perubahan
 * daftar = perubahan kode bervonis Lead. Nilai disimpan verbatim sebagai
 * `violationCategory`; penjaga kategori memakai daftar ini.
 */
export const DISCIPLINARY_SEVERE_CATEGORIES = [
  "pencurian/penggelapan aset perusahaan",
  "pemalsuan dokumen/data perusahaan",
  "kekerasan fisik/perkelahian di tempat kerja",
  "pelecehan seksual",
  "bekerja di bawah pengaruh narkotika/alkohol",
  "perusakan aset dengan sengaja",
  "membocorkan rahasia dagang/data pelanggan",
] as const

export const DISCIPLINARY_GENERAL_CATEGORIES = [
  "mangkir tanpa keterangan berulang",
  "pelanggaran SOP keselamatan kerja/tidak memakai APD",
  "kelalaian menyebabkan kerusakan aset",
  "konflik kepentingan tanpa pengungkapan",
  "perilaku tidak sopan ke pelanggan/rekan kerja",
  "pelanggaran prosedur administrasi berulang",
] as const

export const DISCIPLINARY_VIOLATION_CATEGORIES = [
  ...DISCIPLINARY_GENERAL_CATEGORIES,
  ...DISCIPLINARY_SEVERE_CATEGORIES,
] as const

export function isDisciplinaryViolationCategory(value: unknown): value is string {
  return typeof value === "string" && (DISCIPLINARY_VIOLATION_CATEGORIES as readonly string[]).includes(value)
}

export function isDisciplinarySevereCategory(value: unknown): boolean {
  return typeof value === "string" && (DISCIPLINARY_SEVERE_CATEGORIES as readonly string[]).includes(value)
}

export const DISCIPLINARY_LEVEL_LABELS: Record<DisciplinaryLevel, string> = {
  verbal: "Teguran Lisan Tercatat",
  sp1: "Surat Peringatan 1 (SP1)",
  sp2: "Surat Peringatan 2 (SP2)",
  sp3: "Surat Peringatan 3 (SP3)",
  sp_first_final: "SP Pertama dan Terakhir",
}

/** Urutan jenjang SP (verbal & pertama-dan-terakhir di luar rantai). */
const SP_CHAIN: readonly DisciplinaryLevel[] = ["sp1", "sp2", "sp3"]

export function isDisciplinaryLevel(value: unknown): value is DisciplinaryLevel {
  return typeof value === "string" && (DISCIPLINARY_LEVELS as readonly string[]).includes(value)
}

export function disciplinaryLevelLabel(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  return isDisciplinaryLevel(value) ? DISCIPLINARY_LEVEL_LABELS[value] : value
}

/* ------------------------------------------------------------------ */
/* Bentuk rekod minimal (input murni, bukan tipe Prisma)               */
/* ------------------------------------------------------------------ */

export interface DisciplinaryRecordLike {
  /** Pengurutan stabil bila dua rekod terbit di hari yang sama. */
  id: number
  employeeId: number
  level: DisciplinaryLevel
  workflowStatus: DisciplinaryWorkflowStatus
  violationDate: Date
  /** Terisi hanya untuk rekod issued. */
  issuedAt: Date | null
  /** Terisi = rekod dibatalkan lewat rekod pembatal (BR-DISC-10). */
  voidedAt: Date | null
}

/* ------------------------------------------------------------------ */
/* Masa berlaku turunan (BR-DISC-02/03)                                */
/* ------------------------------------------------------------------ */

/** Masa berlaku tiap SP: 6 bulan kalender WIB (PP 35/2021 Pasal 52). */
export const DISCIPLINARY_VALIDITY_MONTHS = 6

/** Tanggal kedaluwarsa turunan: issuedAt + 6 bulan kalender WIB. */
export function disciplinaryExpiryDate(issuedAt: Date): Date {
  return addCalendarMonthsWib(issuedAt, DISCIPLINARY_VALIDITY_MONTHS)
}

export type DisciplinaryDerivedStatus = DisciplinaryWorkflowStatus | "active" | "expired"

/**
 * Status baca rekod. Untuk issued: `active` selama tanggal baca <= tanggal
 * kedaluwarsa turunan (spec §6: expired bila tanggal baca > issuedAt+6
 * bulan), `expired` sesudahnya. Bukan transisi tersimpan.
 */
export function deriveDisciplinaryStatus(
  record: Pick<DisciplinaryRecordLike, "workflowStatus" | "issuedAt">,
  at: Date,
): DisciplinaryDerivedStatus {
  if (record.workflowStatus !== "issued" || record.issuedAt == null) {
    return record.workflowStatus
  }
  return wibDayNumber(at) > wibDayNumber(disciplinaryExpiryDate(record.issuedAt))
    ? "expired"
    : "active"
}

/** Aktif pada tanggal acuan (dipakai rantai jenjang per violationDate). */
export function isDisciplinaryActiveAt(
  record: Pick<DisciplinaryRecordLike, "workflowStatus" | "issuedAt" | "voidedAt">,
  at: Date,
): boolean {
  if (record.workflowStatus !== "issued" || record.issuedAt == null || record.voidedAt != null) {
    return false
  }
  // Kejadian sebelum SP terbit tidak dihitung aktif oleh SP itu (edge §8).
  if (wibDayNumber(at) < wibDayNumber(record.issuedAt)) return false
  return deriveDisciplinaryStatus(record, at) === "active"
}

/* ------------------------------------------------------------------ */
/* Jenjang turunan (BR-DISC-01/04)                                     */
/* ------------------------------------------------------------------ */

export type NextDisciplinaryDerivation =
  | { kind: "level"; level: DisciplinaryLevel }
  | { kind: "review_termination"; activeLevel: DisciplinaryLevel }

/** Rekod SP issued aktif terakhir pada tanggal acuan (rantai SP saja). */
export function lastActiveSpRecord(
  records: readonly DisciplinaryRecordLike[],
  employeeId: number,
  at: Date,
): DisciplinaryRecordLike | null {
  const active = records
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        SP_CHAIN.includes(r.level) &&
        isDisciplinaryActiveAt(r, at),
    )
    .sort((a, b) => {
      const byIssued = wibDayNumber(a.issuedAt as Date) - wibDayNumber(b.issuedAt as Date)
      return byIssued !== 0 ? byIssued : a.id - b.id
    })
  return active.length > 0 ? active[active.length - 1] : null
}

/**
 * Jenjang berikutnya untuk pelanggaran pada violationDate.
 * - Tidak ada SP aktif -> sp1 (rantai putus sesudah kedaluwarsa, BR-DISC-02).
 * - sp1 aktif -> sp2; sp2 aktif -> sp3.
 * - sp3 / sp_first_final aktif -> BUKAN SP4: tanda kajian berhenti
 *   (BR-DISC-09; keputusan berhenti di luar lapisan ini).
 */
export function deriveNextDisciplinaryLevel(
  records: readonly DisciplinaryRecordLike[],
  employeeId: number,
  violationDate: Date,
): NextDisciplinaryDerivation {
  const firstFinalActive = records.some(
    (r) =>
      r.employeeId === employeeId &&
      r.level === "sp_first_final" &&
      isDisciplinaryActiveAt(r, violationDate),
  )
  if (firstFinalActive) return { kind: "review_termination", activeLevel: "sp_first_final" }

  const last = lastActiveSpRecord(records, employeeId, violationDate)
  if (last == null) return { kind: "level", level: "sp1" }
  if (last.level === "sp1") return { kind: "level", level: "sp2" }
  if (last.level === "sp2") return { kind: "level", level: "sp3" }
  return { kind: "review_termination", activeLevel: "sp3" }
}

/* ------------------------------------------------------------------ */
/* Penjaga murni (dicabut = tes MERAH)                                 */
/* ------------------------------------------------------------------ */

export type GuardResult = { allowed: true } | { allowed: false; message: string }

const ok: GuardResult = { allowed: true }
const deny = (message: string): GuardResult => ({ allowed: false, message })

/**
 * BR-DISC-04 + AC-DISC-1: jenjang pilihan pengaju harus sama dengan
 * turunan server. Naik manual melewati turunan DITOLAK; turun ke teguran
 * lisan hanya oleh penyetuju (§1.2), bukan pilihan bebas pengaju di sini.
 */
export function evaluateRequestedDisciplinaryLevel(input: {
  records: readonly DisciplinaryRecordLike[]
  employeeId: number
  violationDate: Date
  requestedLevel: string | null
}): GuardResult {
  if (!isDisciplinaryLevel(input.requestedLevel) || input.requestedLevel === "verbal") {
    return deny("Jenjang peringatan tidak valid")
  }
  const derived = deriveNextDisciplinaryLevel(input.records, input.employeeId, input.violationDate)
  if (derived.kind === "review_termination") {
    return deny(
      "Karyawan masih dalam masa berlaku SP3/SP pertama dan terakhir; pelanggaran baru tidak diterbitkan sebagai SP baru dan diteruskan sebagai kajian berhenti",
    )
  }
  if (input.requestedLevel !== derived.level) {
    return deny(
      `Jenjang peringatan harus mengikuti urutan: usulan yang sah saat ini adalah ${DISCIPLINARY_LEVEL_LABELS[derived.level]}`,
    )
  }
  return ok
}

/**
 * BR-DISC-05 + AC-DISC-9: SP pertama-dan-terakhir hanya untuk kategori
 * pada daftar berat. Daftar disuntik pemanggil (Q-DISC-1 milik Lead);
 * daftar kosong = opsi tidak tersedia untuk kategori apa pun.
 */
export function evaluateFirstFinalDisciplinary(input: {
  violationCategory: string | null
  severeCategories: readonly string[]
}): GuardResult {
  const category = input.violationCategory?.trim() ?? ""
  if (category === "" || !input.severeCategories.includes(category)) {
    return deny(
      "SP pertama dan terakhir hanya dapat diterbitkan untuk kategori pelanggaran berat yang terdaftar",
    )
  }
  return ok
}

/**
 * BR-DISC-06 + AC-DISC-4: SoD. Penyetuju != pengaju. SP3 dan SP
 * pertama-dan-terakhir wajib penyetuju kedua, berbeda dari pengaju dan
 * dari penyetuju pertama. Identitas dibandingkan sebagai Employee id.
 */
export function evaluateDisciplinaryApprovalSod(input: {
  level: DisciplinaryLevel
  requestedByEmployeeId: number
  approverEmployeeId: number | null
  secondApproverEmployeeId: number | null
}): GuardResult {
  if (input.approverEmployeeId != null && input.approverEmployeeId === input.requestedByEmployeeId) {
    return deny("Penyetuju tidak boleh menyetujui pengajuan peringatan yang diajukan sendiri")
  }
  const needsSecond = input.level === "sp3" || input.level === "sp_first_final"
  if (needsSecond) {
    if (input.secondApproverEmployeeId == null) {
      return deny("SP3 dan SP pertama dan terakhir wajib disetujui penyetuju kedua")
    }
    if (input.secondApproverEmployeeId === input.requestedByEmployeeId) {
      return deny("Penyetuju kedua tidak boleh sama dengan pengaju")
    }
    if (
      input.approverEmployeeId != null &&
      input.secondApproverEmployeeId === input.approverEmployeeId
    ) {
      return deny("Penyetuju kedua tidak boleh sama dengan penyetuju pertama")
    }
  }
  return ok
}

/** AC-DISC-7: penolakan pengajuan wajib alasan; rejected bukan disiplin. */
export function evaluateDisciplinaryRejection(input: { reason: string | null }): GuardResult {
  if (input.reason == null || input.reason.trim() === "") {
    return deny("Alasan penolakan pengajuan peringatan wajib diisi")
  }
  return ok
}

/**
 * BR-DISC-12 + AC-DISC-6: tanggapan karyawan hanya untuk rekod issued
 * miliknya sendiri.
 */
export function evaluateDisciplinaryEmployeeResponse(input: {
  recordEmployeeId: number
  recordWorkflowStatus: DisciplinaryWorkflowStatus
  responderEmployeeId: number
  response: string | null
}): GuardResult {
  if (input.responderEmployeeId !== input.recordEmployeeId) {
    return deny("Tanggapan hanya dapat diberikan untuk rekod peringatan Anda sendiri")
  }
  if (input.recordWorkflowStatus !== "issued") {
    return deny("Tanggapan hanya dapat diberikan pada surat peringatan yang sudah terbit")
  }
  if (input.response == null || input.response.trim() === "") {
    return deny("Tanggapan karyawan wajib diisi")
  }
  return ok
}

/** Jendela tanggapan karyawan: 7 hari kalender dari issuedAt (Q-DISC-3). */
export const DISCIPLINARY_RESPONSE_WINDOW_DAYS = 7

/**
 * Q-DISC-3 + BR-DISC-12: jalur self-service karyawan hanya di dalam
 * jendela 7 hari kalender dari issuedAt (hari terbit = hari ke-0, batas
 * akhir = issuedAt + 7 hari kalender WIB). Lewat jendela DITOLAK berisik;
 * tanggapan terlambat hanya lewat aksi HR berlabel terlambat.
 */
export function evaluateDisciplinaryResponseWindow(input: {
  issuedAt: Date | null
  at: Date
}): GuardResult {
  if (input.issuedAt == null) {
    return deny("Tanggapan hanya dapat diberikan pada surat peringatan yang sudah terbit")
  }
  const lastDay = wibDayNumber(input.issuedAt) + DISCIPLINARY_RESPONSE_WINDOW_DAYS
  if (wibDayNumber(input.at) > lastDay) {
    return deny("Jendela tanggapan 7 hari kalender sejak surat peringatan terbit telah berakhir")
  }
  return ok
}

/* ------------------------------------------------------------------ */
/* Daftar perhatian HR (§1.7 — turunan baca, bukan status tersimpan)   */
/* ------------------------------------------------------------------ */

export interface DisciplinaryAttentionSummary {
  /** Rekod SP issued masih aktif pada tanggal baca. */
  active: DisciplinaryRecordLike[]
  /** Aktif dan kedaluwarsa dalam <= 30 hari kalender sejak tanggal baca. */
  expiringWithin30Days: DisciplinaryRecordLike[]
  /** SP3 / pertama-dan-terakhir aktif (risiko tertinggi). */
  highestRisk: DisciplinaryRecordLike[]
}

export function summarizeDisciplinaryAttention(
  records: readonly DisciplinaryRecordLike[],
  at: Date,
): DisciplinaryAttentionSummary {
  const active = records.filter((r) => isDisciplinaryActiveAt(r, at))
  const expiringWithin30Days = active.filter((r) => {
    const daysLeft = wibDayNumber(disciplinaryExpiryDate(r.issuedAt as Date)) - wibDayNumber(at)
    return daysLeft >= 0 && daysLeft <= 30
  })
  const highestRisk = active.filter((r) => r.level === "sp3" || r.level === "sp_first_final")
  return { active, expiringWithin30Days, highestRisk }
}
