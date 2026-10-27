/**
 * Builder murni antrean prospek mendekati/lampaui target tutup
 * (F-2026-10-25-027-S, putusan Lead 2026-10-25 15:20 WIB).
 *
 * `Lead.expectedCloseDate` existing dibaca apa adanya — tanpa migrasi,
 * tanpa mutasi, tanpa probabilitas/persen/prediksi (BR-EC-03, warisan
 * BR-LF-08: tidak ada tabel probabilitas di repo). Builder BARU terpisah
 * dari `buildLeadFunnel` (Q-EC-3 Lead): funnel = agregat tahap kohort,
 * antrean ini = per baris urgensi tanggal.
 *
 * Keanggotaan (BR-EC-01): hanya Lead `deletedAt` kosong DAN status
 * non-terminal (`won`/`lost` keluar). Status di luar LEAD_STATUSES tetap
 * tampil tertanda "Status tidak dikenal", tidak dipetakan paksa.
 * Tanggal per hari kalender WIB (BR-EC-02): hari target sendiri = sisa 0
 * (MENDEKATI), kemarin = LEWAT_TARGET overdue 1. `expectedCloseDate`
 * kosong = ember TANPA_TARGET terpisah tanpa sisa/overdue karangan
 * (BR-EC-04). Jendela MENDEKATI = parameter builder eksplisit, default
 * 7 hari kalender tunggal tahap 1 (Q-EC-1 Lead, BR-EC-05) — bukan kolom.
 * Urutan (BR-EC-06): LEWAT_TARGET overdue terbesar dulu, lalu MENDEKATI
 * sisa terkecil dulu; seri diputus leadNumber lalu id. Baris TANPA_TARGET
 * tidak masuk urutan urgensi. `estimatedValue` kosong tidak masuk Σ
 * sebagai Rp0 dan tertanda per baris + hitungan ember (BR-EC-09).
 * Loader: `lead-expected-close-data.ts`.
 */

import {
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_STAGE_LABELS,
  LEAD_FUNNEL_UNASSIGNED_LABEL,
  LEAD_FUNNEL_UNKNOWN_STATUS_LABEL,
} from "@/lib/reports/lead-funnel"
import { LEAD_STATUSES } from "@/lib/validations/crm.schemas"
import { safeAdd } from "@/lib/utils/math"

export {
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_STAGE_LABELS,
  LEAD_FUNNEL_UNASSIGNED_LABEL,
  LEAD_FUNNEL_UNKNOWN_STATUS_LABEL,
}

/** Jendela MENDEKATI default tahap 1 — Q-EC-1 Lead (7 hari kalender). */
export const LEAD_EXPECTED_CLOSE_WINDOW_DAYS = 7

export const LEAD_EXPECTED_CLOSE_BUCKET_KEYS = [
  "LEWAT_TARGET",
  "MENDEKATI",
  "TANPA_TARGET",
] as const

export type LeadExpectedCloseBucketKey =
  (typeof LEAD_EXPECTED_CLOSE_BUCKET_KEYS)[number]

/** Label ember verbatim — UI menempel apa adanya, tanpa hitung ulang. */
export const LEAD_EXPECTED_CLOSE_BUCKET_LABELS: Record<
  LeadExpectedCloseBucketKey,
  string
> = {
  LEWAT_TARGET: "Lewat target tutup",
  MENDEKATI: "Mendekati target tutup",
  TANPA_TARGET: "Tanpa target tutup",
}

/** Notice nilai verbatim BR-EC-03 — UI menempel apa adanya. */
export const LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT =
  "Nilai estimasi saat ini, bukan piutang, pendapatan, atau prediksi."

const TERMINAL_STATUSES = new Set(["won", "lost"])
const KNOWN_STATUSES = new Set<string>(LEAD_STATUSES)

export interface LeadExpectedCloseInput {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  expectedCloseDate: Date | null
  /** estimatedValue saat ini; null = tanpa nilai estimasi (BR-EC-09). */
  estimatedValue: number | null
  assignedTo: number | null
  /** Nama penanggung ter-resolusi loader; null bila belum ditugaskan. */
  assignedToName: string | null
  deletedAt: Date | null
}

export interface LeadExpectedCloseRow {
  leadId: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  /** Label tahap verbatim funnel; status liar = "Status tidak dikenal". */
  stageLabel: string
  isUnknownStatus: boolean
  bucket: LeadExpectedCloseBucketKey
  bucketLabel: string
  expectedCloseDate: Date | null
  /** Hari lewat target; hanya LEWAT_TARGET, selain itu null. */
  overdueDays: number | null
  /** Sisa hari ke target; hanya MENDEKATI (0 = hari ini), selain itu null. */
  remainingDays: number | null
  assignedTo: number | null
  assignedToName: string | null
  /** Nama penanggung atau label "Belum ditugaskan" warisan funnel. */
  assigneeLabel: string
  estimatedValue: number | null
  hasEstimatedValue: boolean
  /** Label BR-EC-09 bila tanpa nilai; null bila bernilai. */
  noValueLabel: string | null
}

export interface LeadExpectedCloseBucket {
  bucket: LeadExpectedCloseBucketKey
  label: string
  count: number
  /** Σ estimatedValue baris bernilai saja; tanpa nilai tidak dihitung 0. */
  totalEstimatedValue: number
  /** Jumlah baris tanpa nilai estimasi di ember ini (BR-EC-09). */
  noValueCount: number
  rows: LeadExpectedCloseRow[]
}

export interface LeadExpectedCloseQueue {
  /** LEWAT_TARGET lalu MENDEKATI, urutan urgensi BR-EC-06. */
  rows: LeadExpectedCloseRow[]
  /** Baris TANPA_TARGET terpisah; tidak masuk urutan urgensi. */
  withoutTargetRows: LeadExpectedCloseRow[]
  buckets: LeadExpectedCloseBucket[]
  windowDays: number
  valueNotice: string
  totalInQueue: number
  totalWithoutTarget: number
}

const MS_PER_DAY = 86_400_000

/** Awal hari kalender lokal (app TZ=Asia/Jakarta) sebagai angka hari. */
function calendarDay(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  )
}

function byLeadNumberThenId(a: LeadExpectedCloseRow, b: LeadExpectedCloseRow): number {
  const aNo = a.leadNumber ?? ""
  const bNo = b.leadNumber ?? ""
  if (aNo !== bNo) return aNo < bNo ? -1 : 1
  return a.leadId - b.leadId
}

export function buildLeadExpectedCloseQueue(
  inputs: readonly LeadExpectedCloseInput[],
  now: Date = new Date(),
  windowDays: number = LEAD_EXPECTED_CLOSE_WINDOW_DAYS,
): LeadExpectedCloseQueue {
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new Error("Jendela mendekati target tutup harus bilangan bulat >= 0 hari.")
  }
  const today = calendarDay(now)
  const rowsByBucket = new Map<LeadExpectedCloseBucketKey, LeadExpectedCloseRow[]>(
    LEAD_EXPECTED_CLOSE_BUCKET_KEYS.map((bucket) => [bucket, []]),
  )

  for (const input of inputs) {
    if (input.deletedAt != null) continue
    if (TERMINAL_STATUSES.has(input.status)) continue

    const isUnknownStatus = !KNOWN_STATUSES.has(input.status)
    let bucket: LeadExpectedCloseBucketKey
    let overdueDays: number | null = null
    let remainingDays: number | null = null

    if (input.expectedCloseDate == null) {
      bucket = "TANPA_TARGET"
    } else {
      const diff = calendarDay(input.expectedCloseDate) - today
      if (diff < 0) {
        bucket = "LEWAT_TARGET"
        overdueDays = -diff
      } else if (diff <= windowDays) {
        bucket = "MENDEKATI"
        remainingDays = diff
      } else {
        continue
      }
    }

    const hasEstimatedValue = input.estimatedValue != null
    rowsByBucket.get(bucket)!.push({
      leadId: input.id,
      slug: input.slug,
      leadNumber: input.leadNumber,
      name: input.name,
      status: input.status,
      stageLabel: isUnknownStatus
        ? LEAD_FUNNEL_UNKNOWN_STATUS_LABEL
        : (LEAD_FUNNEL_STAGE_LABELS[input.status] ?? LEAD_FUNNEL_UNKNOWN_STATUS_LABEL),
      isUnknownStatus,
      bucket,
      bucketLabel: LEAD_EXPECTED_CLOSE_BUCKET_LABELS[bucket],
      expectedCloseDate: input.expectedCloseDate,
      overdueDays,
      remainingDays,
      assignedTo: input.assignedTo,
      assignedToName: input.assignedToName,
      assigneeLabel: input.assignedToName ?? LEAD_FUNNEL_UNASSIGNED_LABEL,
      estimatedValue: input.estimatedValue,
      hasEstimatedValue,
      noValueLabel: hasEstimatedValue ? null : LEAD_FUNNEL_NO_VALUE_LABEL,
    })
  }

  const overdueRows = rowsByBucket.get("LEWAT_TARGET")!
  overdueRows.sort((a, b) => {
    if (a.overdueDays !== b.overdueDays) return (b.overdueDays ?? 0) - (a.overdueDays ?? 0)
    return byLeadNumberThenId(a, b)
  })
  const approachingRows = rowsByBucket.get("MENDEKATI")!
  approachingRows.sort((a, b) => {
    if (a.remainingDays !== b.remainingDays)
      return (a.remainingDays ?? 0) - (b.remainingDays ?? 0)
    return byLeadNumberThenId(a, b)
  })
  const withoutTargetRows = rowsByBucket.get("TANPA_TARGET")!
  withoutTargetRows.sort(byLeadNumberThenId)

  const orderedByBucket: Record<LeadExpectedCloseBucketKey, LeadExpectedCloseRow[]> = {
    LEWAT_TARGET: overdueRows,
    MENDEKATI: approachingRows,
    TANPA_TARGET: withoutTargetRows,
  }

  const buckets: LeadExpectedCloseBucket[] = LEAD_EXPECTED_CLOSE_BUCKET_KEYS.map(
    (bucket) => {
      const bucketRows = orderedByBucket[bucket]
      let totalEstimatedValue = 0
      let noValueCount = 0
      for (const row of bucketRows) {
        if (row.estimatedValue == null) noValueCount += 1
        else totalEstimatedValue = safeAdd(totalEstimatedValue, row.estimatedValue, 2)
      }
      return {
        bucket,
        label: LEAD_EXPECTED_CLOSE_BUCKET_LABELS[bucket],
        count: bucketRows.length,
        totalEstimatedValue,
        noValueCount,
        rows: bucketRows,
      }
    },
  )

  const rows = [...overdueRows, ...approachingRows]
  return {
    rows,
    withoutTargetRows,
    buckets,
    windowDays,
    valueNotice: LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT,
    totalInQueue: rows.length,
    totalWithoutTarget: withoutTargetRows.length,
  }
}
