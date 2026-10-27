/**
 * F-2026-10-27-103-S tahap 1 — antrean transaksi berulang jatuh
 * tempo / gagal jalan mengendap (awalan kode RTQ per putusan Lead,
 * beda register rekrutmen 080-S).
 *
 * Turunan murni baca-saja: populasi RecurringTransaction aktif,
 * tidak terhapus, `nextRunDate` due pada hari kalender WIB berjalan
 * (BR-RCQ103-01/10). Ember dari `lastResult` ternormalisasi server:
 * awalan persis "Gagal:" = GAGAL_JALAN; selainnya (termasuk null =
 * belum pernah jalan) = JATUH_TEMPO_BELUM_JALAN (BR-RCQ103-02).
 * Pensiun "Berakhir…" nonaktif tidak pernah masuk (BR-RCQ103-03).
 *
 * PUTUSAN LEAD Q-RCQ103 (komentar PR #1170): ambang MENGENDAP 3 hari
 * kalender WIB disahkan; label/urutan usulan spec apa adanya; baca-
 * saja; gerbang existing tanpa key baru. Vonis Accountant 108-V:
 * template/nominal/posting dari antrean DILARANG.
 *
 * Umur HANYA dari `nextRunDate` (BR-RCQ103-04): lastRunAt/updatedAt/
 * createdAt dilarang. Payload tanpa template, tanpa nominal, tanpa
 * createdBy (BR-RCQ103-07/11). Pure (tanpa Prisma/DOM).
 * Loader: `recurring-due-queue-data.ts`.
 */

import { FREQUENCY_LABELS, type RecurrenceFrequency } from "@/lib/reports/recurring-schedule"
import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang mengendap (hari kalender WIB sejak nextRunDate) — Q-RCQ103-1: 3. */
export const RECURRING_DUE_STALE_DAYS = 3

export const RECURRING_DUE_TITLE = "Transaksi Berulang Jatuh Tempo"

export const RECURRING_DUE_BUCKET_LABELS = {
  GAGAL_JALAN: "Gagal Jalan",
  JATUH_TEMPO_BELUM_JALAN: "Jatuh Tempo Belum Jalan",
} as const

export type RecurringDueBucket = keyof typeof RECURRING_DUE_BUCKET_LABELS

export const RECURRING_DUE_LEVEL_LABELS = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
} as const

export type RecurringDueLevel = keyof typeof RECURRING_DUE_LEVEL_LABELS

export const RECURRING_DUE_NEVER_RAN_LABEL = "belum pernah jalan"

export const RECURRING_DUE_NOTICE_TEXT =
  "Daftar ini hanya jadwal transaksi berulang aktif yang sudah jatuh tempo pada hari ini, termasuk yang terakhir gagal jalan. Umur dihitung sejak tanggal jadwal seharusnya jalan, bukan sejak kegagalan pertama. Jalankan atau perbaiki lewat halaman Transaksi Berulang existing."

const MS_PER_DAY = 86_400_000
const FAILED_PREFIX = "Gagal:"
const QUEUE_LIMIT = 200

export const RECURRING_DUE_QUEUE_LIMIT = QUEUE_LIMIT

export interface RecurringDueInput {
  scheduleId: number
  slug: string | null
  name: string
  type: string
  frequency: string
  interval: number
  nextRunDate: Date
  endDate: Date | null
  lastRunAt: Date | null
  runCount: number
  lastResult: string | null
  isActive: boolean
  deletedAt: Date | null
}

export interface RecurringDueRow {
  scheduleId: number
  slug: string | null
  name: string
  type: string
  frequency: string
  frequencyLabel: string
  interval: number
  nextRunDate: Date
  endDate: Date | null
  lastRunAt: Date | null
  runCount: number
  bucket: RecurringDueBucket
  bucketLabel: string
  /** Pesan gagal apa adanya; hanya untuk GAGAL_JALAN. */
  failureMessage: string | null
  neverRan: boolean
  neverRanLabel: string | null
  /** Hari kalender WIB sejak nextRunDate (due hari ini = 0). */
  ageDays: number
  level: RecurringDueLevel
  levelLabel: string
}

export interface RecurringDueQueue {
  rows: RecurringDueRow[]
  bucketCounts: Record<RecurringDueBucket, number>
  levelCounts: Record<RecurringDueLevel, number>
  /** Rekap populasi penuh per `type` tersimpan apa adanya (BR-RCQ103-08/09). */
  typeCounts: Record<string, number>
  /** Rekap populasi penuh per label frekuensi tampil. */
  frequencyCounts: Record<string, number>
  totalSchedules: number
  truncated: boolean
  noticeText: string
  title: string
}

function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

function frequencyLabel(frequency: string, interval: number): string {
  const label = (FREQUENCY_LABELS as Record<string, string>)[frequency] ?? frequency
  return interval > 1 ? `${label} (setiap ${interval}x)` : label
}

export function buildRecurringDueQueue(
  inputs: RecurringDueInput[],
  now: Date = new Date(),
  limit: number = QUEUE_LIMIT,
): RecurringDueQueue {
  const today = getWibTodayUtcDate(now)
  const rows: RecurringDueRow[] = []

  for (const input of inputs) {
    if (!input.isActive) continue
    if (input.deletedAt !== null) continue
    const dueDay = wibCalendarDay(input.nextRunDate)
    const ageDays = Math.round((today.getTime() - dueDay.getTime()) / MS_PER_DAY)
    if (ageDays < 0) continue

    const failed = input.lastResult !== null && input.lastResult.startsWith(FAILED_PREFIX)
    const bucket: RecurringDueBucket = failed ? "GAGAL_JALAN" : "JATUH_TEMPO_BELUM_JALAN"
    const level: RecurringDueLevel = ageDays >= RECURRING_DUE_STALE_DAYS ? "mengendap" : "menunggu"
    const neverRan = input.lastResult === null

    rows.push({
      scheduleId: input.scheduleId,
      slug: input.slug,
      name: input.name,
      type: input.type,
      frequency: input.frequency,
      frequencyLabel: frequencyLabel(input.frequency, input.interval),
      interval: input.interval,
      nextRunDate: input.nextRunDate,
      endDate: input.endDate,
      lastRunAt: input.lastRunAt,
      runCount: input.runCount,
      bucket,
      bucketLabel: RECURRING_DUE_BUCKET_LABELS[bucket],
      failureMessage: failed ? input.lastResult : null,
      neverRan,
      neverRanLabel: neverRan ? RECURRING_DUE_NEVER_RAN_LABEL : null,
      ageDays,
      level,
      levelLabel: RECURRING_DUE_LEVEL_LABELS[level],
    })
  }

  // BR-RCQ103-08: gagal dulu (umur terbesar), lalu belum-jalan (umur terbesar).
  const BUCKET_ORDER: Record<RecurringDueBucket, number> = {
    GAGAL_JALAN: 0,
    JATUH_TEMPO_BELUM_JALAN: 1,
  }
  rows.sort((a, b) => {
    const bucketDiff = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
    if (bucketDiff !== 0) return bucketDiff
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays
    const dueDiff = a.nextRunDate.getTime() - b.nextRunDate.getTime()
    if (dueDiff !== 0) return dueDiff
    return a.scheduleId - b.scheduleId
  })

  const bucketCounts: Record<RecurringDueBucket, number> = {
    GAGAL_JALAN: 0,
    JATUH_TEMPO_BELUM_JALAN: 0,
  }
  const levelCounts: Record<RecurringDueLevel, number> = { mengendap: 0, menunggu: 0 }
  const typeCounts: Record<string, number> = {}
  const frequencyCounts: Record<string, number> = {}
  for (const row of rows) {
    bucketCounts[row.bucket] += 1
    levelCounts[row.level] += 1
    typeCounts[row.type] = (typeCounts[row.type] ?? 0) + 1
    frequencyCounts[row.frequencyLabel] = (frequencyCounts[row.frequencyLabel] ?? 0) + 1
  }

  const truncated = rows.length > limit
  return {
    rows: truncated ? rows.slice(0, limit) : rows,
    bucketCounts,
    levelCounts,
    typeCounts,
    frequencyCounts,
    totalSchedules: rows.length,
    truncated,
    noticeText: RECURRING_DUE_NOTICE_TEXT,
    title: RECURRING_DUE_TITLE,
  }
}

export type { RecurrenceFrequency }
