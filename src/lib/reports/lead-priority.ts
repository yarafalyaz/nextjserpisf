/**
 * Builder murni daftar kerja prioritas lead (F-2026-10-25-031-S tahap 1
 * lapis aman — baca-saja, tanpa kolom/migrasi/aksi ubah).
 *
 * Premis jujur (BR-LSC-01/02/03): Lead di skema hari ini TANPA kolom
 * prioritas — jadi satu-satunya keadaan ketetapan yang faktual adalah
 * "Belum ditetapkan" (BR-LSC-03: kosong bukan "rendah" karangan).
 * Builder ini membekukan populasi + urutan deterministik BR-LSC-08
 * untuk keadaan itu; tingkat manual (tinggi/sedang/rendah usulan spec)
 * dan fisik ketetapan menunggu putusan Lead Q-LSC-2/Q-LSC-3 — builder
 * TIDAK mengarang tingkat, skor angka, bobot, probabilitas, atau
 * prediksi (BR-LSC-06/11). Skor turunan menunggu gerbang Q-LSC-1.
 *
 * Populasi (§4 spec): Lead `deletedAt` kosong, status non-terminal
 * (`won`/`lost` keluar), belum terkonversi (`convertedAt` kosong).
 * Status liar tampil tertanda "Status tidak dikenal" (warisan
 * BR-LF-01), tidak dipetakan paksa. Urutan BR-LSC-08 untuk populasi
 * belum-ditetapkan: tingkat sama semua → seri expectedCloseDate asc
 * (kosong terakhir — E-LSC-7, tanpa Rp0/tanpa tanggal karangan), lalu
 * leadNumber, lalu id. `estimatedValue` kosong di luar Σ dan tertanda
 * per baris (BR-LSC-10 warisan BR-LF-08). Loader:
 * `lead-priority-data.ts`.
 */

import {
  LEAD_FUNNEL_NO_SOURCE_LABEL,
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_STAGE_LABELS,
  LEAD_FUNNEL_UNASSIGNED_LABEL,
  LEAD_FUNNEL_UNKNOWN_STATUS_LABEL,
  LEAD_FUNNEL_VALUE_NOTICE_TEXT,
} from "@/lib/reports/lead-funnel"
import { LEAD_STATUSES } from "@/lib/validations/crm.schemas"
import { safeAdd } from "@/lib/utils/math"

export {
  LEAD_FUNNEL_NO_SOURCE_LABEL,
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_STAGE_LABELS,
  LEAD_FUNNEL_UNASSIGNED_LABEL,
  LEAD_FUNNEL_UNKNOWN_STATUS_LABEL,
  LEAD_FUNNEL_VALUE_NOTICE_TEXT,
}

/** Ember ketetapan tahap 1 lapis aman — satu-satunya keadaan faktual. */
export const LEAD_PRIORITY_BUCKET_KEYS = ["BELUM_DITETAPKAN"] as const

export type LeadPriorityBucketKey = (typeof LEAD_PRIORITY_BUCKET_KEYS)[number]

/** Label ember verbatim BR-LSC-03 — UI menempel apa adanya. */
export const LEAD_PRIORITY_BUCKET_LABELS: Record<LeadPriorityBucketKey, string> = {
  BELUM_DITETAPKAN: "Belum ditetapkan",
}

/** Penanda sifat ketetapan verbatim — bukan skor, bukan ketetapan penjual. */
export const LEAD_PRIORITY_BASIS_LABEL = "Penanda prioritas manual belum tersedia"

const TERMINAL_STATUSES = new Set(["won", "lost"])
const KNOWN_STATUSES = new Set<string>(LEAD_STATUSES)

export interface LeadPriorityInput {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  source: string | null
  expectedCloseDate: Date | null
  /** estimatedValue saat ini; null = tanpa nilai estimasi (BR-LSC-10). */
  estimatedValue: number | null
  assignedTo: number | null
  /** Nama penanggung ter-resolusi loader; null bila belum ditugaskan. */
  assignedToName: string | null
  convertedAt: Date | null
  deletedAt: Date | null
}

export interface LeadPriorityRow {
  leadId: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  /** Label tahap verbatim funnel; status liar = "Status tidak dikenal". */
  stageLabel: string
  isUnknownStatus: boolean
  bucket: LeadPriorityBucketKey
  bucketLabel: string
  /** Sumber apa adanya (BR-LSC-11); kosong = label funnel. */
  source: string | null
  sourceLabel: string
  expectedCloseDate: Date | null
  assignedTo: number | null
  assignedToName: string | null
  assigneeLabel: string
  estimatedValue: number | null
  hasEstimatedValue: boolean
  noValueLabel: string | null
}

export interface LeadPriorityBucket {
  bucket: LeadPriorityBucketKey
  label: string
  count: number
  /** Σ estimatedValue baris bernilai saja; tanpa nilai tidak dihitung 0. */
  totalEstimatedValue: number
  noValueCount: number
  rows: LeadPriorityRow[]
}

export interface LeadPriorityQueue {
  /** Populasi aktif terurut BR-LSC-08 (seluruhnya belum ditetapkan). */
  rows: LeadPriorityRow[]
  buckets: LeadPriorityBucket[]
  /** Keadaan ketetapan yang menjadi basis urutan — verbatim. */
  basisLabel: string
  valueNotice: string
  totalActive: number
}

function byCloseDateThenNumberThenId(a: LeadPriorityRow, b: LeadPriorityRow): number {
  const aTime = a.expectedCloseDate == null ? null : a.expectedCloseDate.getTime()
  const bTime = b.expectedCloseDate == null ? null : b.expectedCloseDate.getTime()
  if (aTime !== bTime) {
    if (aTime == null) return 1 // target kosong selalu terakhir (E-LSC-7)
    if (bTime == null) return -1
    return aTime - bTime
  }
  const aNo = a.leadNumber ?? ""
  const bNo = b.leadNumber ?? ""
  if (aNo !== bNo) return aNo < bNo ? -1 : 1
  return a.leadId - b.leadId
}

export function buildLeadPriorityQueue(
  inputs: readonly LeadPriorityInput[],
): LeadPriorityQueue {
  const rows: LeadPriorityRow[] = []

  for (const input of inputs) {
    if (input.deletedAt != null) continue
    if (input.convertedAt != null) continue
    if (TERMINAL_STATUSES.has(input.status)) continue

    const isUnknownStatus = !KNOWN_STATUSES.has(input.status)
    const hasEstimatedValue = input.estimatedValue != null
    rows.push({
      leadId: input.id,
      slug: input.slug,
      leadNumber: input.leadNumber,
      name: input.name,
      status: input.status,
      stageLabel: isUnknownStatus
        ? LEAD_FUNNEL_UNKNOWN_STATUS_LABEL
        : (LEAD_FUNNEL_STAGE_LABELS[input.status] ?? LEAD_FUNNEL_UNKNOWN_STATUS_LABEL),
      isUnknownStatus,
      bucket: "BELUM_DITETAPKAN",
      bucketLabel: LEAD_PRIORITY_BUCKET_LABELS.BELUM_DITETAPKAN,
      source: input.source,
      sourceLabel: input.source ?? LEAD_FUNNEL_NO_SOURCE_LABEL,
      expectedCloseDate: input.expectedCloseDate,
      assignedTo: input.assignedTo,
      assignedToName: input.assignedToName,
      assigneeLabel: input.assignedToName ?? LEAD_FUNNEL_UNASSIGNED_LABEL,
      estimatedValue: input.estimatedValue,
      hasEstimatedValue,
      noValueLabel: hasEstimatedValue ? null : LEAD_FUNNEL_NO_VALUE_LABEL,
    })
  }

  rows.sort(byCloseDateThenNumberThenId)

  let totalEstimatedValue = 0
  let noValueCount = 0
  for (const row of rows) {
    if (row.estimatedValue == null) noValueCount += 1
    else totalEstimatedValue = safeAdd(totalEstimatedValue, row.estimatedValue, 2)
  }

  return {
    rows,
    buckets: [
      {
        bucket: "BELUM_DITETAPKAN",
        label: LEAD_PRIORITY_BUCKET_LABELS.BELUM_DITETAPKAN,
        count: rows.length,
        totalEstimatedValue,
        noValueCount,
        rows,
      },
    ],
    basisLabel: LEAD_PRIORITY_BASIS_LABEL,
    valueNotice: LEAD_FUNNEL_VALUE_NOTICE_TEXT,
    totalActive: rows.length,
  }
}
