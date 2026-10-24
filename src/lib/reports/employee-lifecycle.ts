/**
 * Siklus hidup karyawan (F-2026-10-22-085-S) — builder murni + penjaga payroll.
 *
 * Sumber kebenaran: spec BOT 5 §2/§3/§6 + putusan BOT 1 §9A (Q-EMP-1/2/3)
 * di docs/erp-research-backlog.md.
 *
 * - Kosakata tertutup: employmentStatus PKWTT|PKWT|DAILY|INTERN,
 *   endReason contract_completed|resigned|terminated|retired|deceased|other.
 *   null status = "belum diatur" (BR-EMP-03, tanpa backfill tebak).
 * - Daftar perhatian memuat HANYA fakta status/tanggal (BR-EMP-07/08):
 *   tidak ada field gaji/nominal apa pun di keluaran builder ini.
 * - Penjaga payroll (Q-EMP-3): periode seluruhnya sesudah employmentEndedAt
 *   = tolak keras slip reguler; periode memotong = wajib konfirmasi tercatat
 *   dan jalur sahnya slip final. Pesan §6 verbatim.
 *
 * Pure (tanpa Prisma/DOM). Tanggal dibandingkan per hari kalender WIB:
 * semua Date dinormalisasi ke hari UTC dari tanggal WIB-nya.
 */

import { formatDate } from "@/lib/utils/format"

export const EMPLOYMENT_STATUSES = ["PKWTT", "PKWT", "DAILY", "INTERN"] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const EMPLOYMENT_END_REASONS = [
  "contract_completed",
  "resigned",
  "terminated",
  "retired",
  "deceased",
  "other",
] as const
export type EmploymentEndReason = (typeof EMPLOYMENT_END_REASONS)[number]

/** Label tampil §6 verbatim. */
export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  PKWTT: "Tetap (PKWTT)",
  PKWT: "Kontrak (PKWT)",
  DAILY: "Harian Lepas",
  INTERN: "Magang",
}

export const EMPLOYMENT_END_REASON_LABELS: Record<EmploymentEndReason, string> = {
  contract_completed: "Kontrak Selesai",
  resigned: "Mengundurkan Diri",
  terminated: "Diberhentikan",
  retired: "Pensiun",
  deceased: "Meninggal Dunia",
  other: "Lainnya",
}

export const EMPLOYMENT_STATUS_UNSET_LABEL = "Belum diatur"

/** Lencana daftar perhatian §6 verbatim. */
export const EMPLOYEE_LIFECYCLE_ATTENTION_LABELS = {
  contractExpiring: "Kontrak berakhir <= 30 hari",
  contractOverdue: "Kontrak lewat, belum dicatat berhenti",
  endedButActive: "Sudah berhenti, masih aktif payroll",
  statusUnset: "Status belum diatur",
  // F-2026-10-24-099-S Q-PROB-4 (tahap 1 daftar pasif existing saja):
  probationDue: "Evaluasi percobaan jatuh tempo",
  probationOverdue: "Percobaan lewat, belum diputus",
  contractDecisionPending: "Keputusan kontrak menunggu penerapan",
} as const

export type EmployeeLifecycleAttentionKind = keyof typeof EMPLOYEE_LIFECYCLE_ATTENTION_LABELS

export function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return typeof value === "string" && (EMPLOYMENT_STATUSES as readonly string[]).includes(value)
}

export function isEmploymentEndReason(value: unknown): value is EmploymentEndReason {
  return typeof value === "string" && (EMPLOYMENT_END_REASONS as readonly string[]).includes(value)
}

export function employmentStatusLabel(value: string | null | undefined): string {
  if (value == null || value === "") return EMPLOYMENT_STATUS_UNSET_LABEL
  return isEmploymentStatus(value) ? EMPLOYMENT_STATUS_LABELS[value] : value
}

export function employmentEndReasonLabel(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  return isEmploymentEndReason(value) ? EMPLOYMENT_END_REASON_LABELS[value] : value
}

const DAY_MS = 24 * 60 * 60 * 1000
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

/** Hari kalender WIB sebagai angka hari UTC (perbandingan tanggal murni). */
export function wibDayNumber(date: Date): number {
  return Math.floor((date.getTime() + WIB_OFFSET_MS) / DAY_MS)
}

export interface EmployeeLifecycleInput {
  employeeId: number
  name: string
  employmentStatus: string | null
  contractEndDate: Date | null
  employmentEndedAt: Date | null
  endReason: string | null
  isActive: boolean
  // F-2026-10-24-099-S Q-PROB-4 (opsional; absen = perilaku F-085-S murni):
  joinDate?: Date | null
  probationEndDate?: Date | null
  /** Keputusan final probation (baris final decided); null = belum diputus. */
  probationFinalDecision?: string | null
  /** Jatuh tempo titik evaluasi berikutnya yang belum submitted (turunan). */
  probationNextDueDate?: Date | null
  /** Pengajuan kontrak approved belum applied, atau submitted >7 hari. */
  contractDecisionPending?: boolean
}

export interface EmployeeLifecycleAttentionRow {
  employeeId: number
  name: string
  kind: EmployeeLifecycleAttentionKind
  /** Label lencana §6 verbatim. */
  label: string
  employmentStatus: string | null
  employmentStatusLabel: string
  contractEndDate: Date | null
  employmentEndedAt: Date | null
  endReason: string | null
  endReasonLabel: string | null
  isActive: boolean
}

/**
 * Daftar perhatian siklus hidup. Satu karyawan bisa muncul >1x (mis. PKWT
 * lewat + masih aktif). Urutan stabil: employeeId, lalu urutan kind di bawah.
 */
export function buildEmployeeLifecycleAttention(
  employees: readonly EmployeeLifecycleInput[],
  today: Date,
): EmployeeLifecycleAttentionRow[] {
  const todayDay = wibDayNumber(today)
  const rows: EmployeeLifecycleAttentionRow[] = []
  const push = (e: EmployeeLifecycleInput, kind: EmployeeLifecycleAttentionKind) => {
    rows.push({
      employeeId: e.employeeId,
      name: e.name,
      kind,
      label: EMPLOYEE_LIFECYCLE_ATTENTION_LABELS[kind],
      employmentStatus: e.employmentStatus,
      employmentStatusLabel: employmentStatusLabel(e.employmentStatus),
      contractEndDate: e.contractEndDate,
      employmentEndedAt: e.employmentEndedAt,
      endReason: e.endReason,
      endReasonLabel: employmentEndReasonLabel(e.endReason),
      isActive: e.isActive,
    })
  }
  for (const e of employees) {
    if (e.employmentEndedAt != null && e.isActive) push(e, "endedButActive")
    if (e.employmentStatus === "PKWT" && e.employmentEndedAt == null && e.contractEndDate != null) {
      const endDay = wibDayNumber(e.contractEndDate)
      if (endDay < todayDay) push(e, "contractOverdue")
      else if (endDay - todayDay <= 30) push(e, "contractExpiring")
    }
    if (e.employmentStatus == null) push(e, "statusUnset")
    // F-2026-10-24-099-S Q-PROB-4: maks 1 baris per karyawan+kind di sini
    // (satu push per kind). probationOverdue MENANG atas probationDue.
    if (
      e.employmentStatus === "PKWTT" &&
      e.employmentEndedAt == null &&
      e.probationEndDate != null &&
      e.probationFinalDecision == null
    ) {
      if (wibDayNumber(e.probationEndDate) < todayDay) push(e, "probationOverdue")
      else if (e.probationNextDueDate != null && wibDayNumber(e.probationNextDueDate) <= todayDay) {
        push(e, "probationDue")
      }
    }
    if (e.contractDecisionPending === true) push(e, "contractDecisionPending")
  }
  const kindOrder: EmployeeLifecycleAttentionKind[] = [
    "endedButActive",
    "contractOverdue",
    "probationOverdue",
    "contractExpiring",
    "probationDue",
    "contractDecisionPending",
    "statusUnset",
  ]
  rows.sort(
    (a, b) =>
      a.employeeId - b.employeeId || kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind),
  )
  return rows
}

/** Pesan gerbang payroll §6 verbatim (tanggal format panjang id-ID). */
export function payrollEndedEmployeeMessage(employmentEndedAt: Date): string {
  return `Karyawan sudah berhenti bekerja pada ${formatDate(employmentEndedAt)}. Slip reguler tidak dapat dibuat; gunakan slip final masa terakhir.`
}

export interface PayrollEmploymentGateInput {
  employmentEndedAt: Date | null
  periodStart: Date
  periodEnd: Date
  /** Slip final masa terakhir (resignationFinal terverifikasi server). */
  isFinalSlip: boolean
  /** Konfirmasi eksplisit tercatat untuk periode memotong (Q-EMP-3). */
  confirmCuttingPeriod?: boolean
}

export type PayrollEmploymentGateResult =
  | { allowed: true }
  | { allowed: false; reason: "ended_before_period" | "cutting_period_unconfirmed"; message: string }

/**
 * Gerbang BR-EMP-06 / Q-EMP-3.
 * - Slip final: selalu lolos (jalur sah masa terakhir).
 * - Periode mulai sesudah tanggal berhenti (startDay > endedDay): tolak keras.
 * - Periode memotong (startDay <= endedDay <= endDay): wajib konfirmasi.
 */
export function evaluatePayrollEmploymentGate(
  input: PayrollEmploymentGateInput,
): PayrollEmploymentGateResult {
  const ended = input.employmentEndedAt
  if (ended == null || input.isFinalSlip) return { allowed: true }
  const endedDay = wibDayNumber(ended)
  const startDay = wibDayNumber(input.periodStart)
  const endDay = wibDayNumber(input.periodEnd)
  const message = payrollEndedEmployeeMessage(ended)
  if (startDay > endedDay) return { allowed: false, reason: "ended_before_period", message }
  if (endedDay <= endDay && !input.confirmCuttingPeriod) {
    return { allowed: false, reason: "cutting_period_unconfirmed", message }
  }
  return { allowed: true }
}
