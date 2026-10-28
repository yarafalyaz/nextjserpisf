/**
 * Helper murni dialog run payroll massal (F-2026-10-22-076-S UI).
 *
 * UI TIDAK menghitung ulang angka payroll/BPJS/cicilan: file ini hanya
 * menurunkan field kalender yang dikirim ke server action
 * `generateBulkPayroll(period, startDate, endDate, paymentFrequency)` —
 * period "YYYY-MM" dari tanggal selesai (V-PF2-1/V-PF2-5 BOT 4) dan
 * tanggal selesai mingguan = mulai + 6 hari (jendela 7 hari mulai Senin).
 * Label alasan terlewati datang verbatim dari kontrak server
 * PAYROLL_RUN_SKIP_LABELS; di sini hanya diurutkan untuk tampil.
 */
import {
  PAYROLL_RUN_SKIP_LABELS,
  type PayrollRunSkipReason,
} from "@/lib/reports/payroll-frequency"

const DAY_MS = 24 * 60 * 60 * 1000

/** Urutan tampil alasan terlewati run massal (AC-PF-5: per alasan, tanpa nominal). */
export const PAYROLL_RUN_SKIP_REASON_ORDER: readonly PayrollRunSkipReason[] = [
  "frekuensiLain",
  "pinjaman",
  "bpjsBelumDidukung",
  "plafonPotongan",
  "irisan",
  "berhenti",
  "cakupan",
]

export interface PayrollRunSkipLine {
  reason: PayrollRunSkipReason
  label: string
  count: number
}

/** Baris tampil hasil run: hanya alasan berjumlah > 0, label verbatim kontrak server. */
export function payrollRunSkipLines(
  skippedByReason: Record<PayrollRunSkipReason, number>,
): PayrollRunSkipLine[] {
  return PAYROLL_RUN_SKIP_REASON_ORDER.filter(
    (reason) => (skippedByReason[reason] ?? 0) > 0,
  ).map((reason) => ({
    reason,
    label: PAYROLL_RUN_SKIP_LABELS[reason],
    count: skippedByReason[reason],
  }))
}

function parseYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Period tulis wajib "YYYY-MM" bulan tanggal selesai (V-PF2-1). Kosong bila tak valid. */
export function weeklyPeriodFromEndDate(endDateYmd: string): string {
  const date = parseYmd(endDateYmd)
  if (!date) return ""
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Tanggal selesai turunan run mingguan: mulai + 6 hari (jendela 7 hari). */
export function weeklyEndFromStart(startYmd: string): string {
  const date = parseYmd(startYmd)
  if (!date) return ""
  return formatYmd(new Date(date.getTime() + 6 * DAY_MS))
}

/** Senin (UTC) untuk tanggal "YYYY-MM-DD"; true bila Senin persis. */
export function isMondayYmd(ymd: string): boolean {
  const date = parseYmd(ymd)
  return date !== null && date.getUTCDay() === 1
}

/** Senin pada atau sebelum tanggal "YYYY-MM-DD" (default mulai run mingguan). */
export function mondayOnOrBefore(ymd: string): string {
  const date = parseYmd(ymd)
  if (!date) return ""
  const offset = (date.getUTCDay() + 6) % 7
  return formatYmd(new Date(date.getTime() - offset * DAY_MS))
}
