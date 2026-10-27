/**
 * Builder murni corong prospek (F-2026-10-22-092-S, putusan Q-LF-1..5 BOT 1).
 *
 * Dua pandangan WAJIB dibedakan, tidak dicampur (spec §2):
 * - Posisi saat ini: snapshot prospek non-deleted per status SEKARANG +
 *   Σ estimatedValue (kosong = ember tanpa nilai terpisah, BUKAN Rp0).
 * - Corong gerakan periode: kohort = prospek yang punya LeadActivity
 *   type=status_change/conversion dengan createdAt dalam periode (Q-LF-3);
 *   pencapaian tahap dari SELURUH histori sampai akhir periode. Mencapai
 *   tahap = tahap tertinggi yang pernah dicapai (newStatus tertinggi;
 *   aktivitas conversion = mencapai `won`). Tahap antara yang dilewati
 *   lompatan tanpa pernah tercatat eksplisit ditandai
 *   `terlewati_tidak_tercatat` (BR-LF-06); mundur tidak menghapus
 *   pencapaian tertinggi (BR-LF-07).
 *
 * Ember jujur: status di luar LEAD_STATUSES → `status_tidak_dikenal`
 * (tidak dipetakan paksa, BR-LF-01); `won` tanpa bukti konversi
 * (convertedAt/customerId kosong) → `menang_belum_terkonversi` (BR-LF-03);
 * tanpa histori tahap memadai → `tanpa_histori_tahap`, keluar dari
 * penyebut rasio transisi (BR-LF-04). Penyebut 0 → rasio `null`
 * ("belum ada data"), bukan 0% (BR-LF-05).
 *
 * Nilai Σ memakai estimatedValue SAAT INI (tidak ada histori nilai di
 * schema) — label jujur wajib di bawah. TIDAK ada probabilitas tertimbang
 * (tidak ada tabel probabilitas; mengarang persen dilarang, BR-LF-08).
 * Baca-saja: builder ini tidak menulis Lead/LeadActivity/Customer apa pun
 * (BR-LF-10). Loader: `lead-funnel-data.ts`.
 */

import { LEAD_STATUSES } from "@/lib/validations/crm.schemas"
import {
  buildLeadLostReasonBreakdown,
  latestLeadLostDescription,
  type LeadLostReasonBreakdownRow,
} from "@/lib/reports/lead-lost-reason"
import { safeAdd } from "@/lib/utils/math"

/** Label tahap verbatim spec §6 — UI menempel apa adanya. */
export const LEAD_FUNNEL_STAGE_LABELS: Record<string, string> = {
  new: "Baru",
  contacted: "Dihubungi",
  qualified: "Terkualifikasi",
  proposal: "Proposal",
  negotiation: "Negosiasi",
  won: "Menang",
  lost: "Kalah",
}

export const LEAD_FUNNEL_UNKNOWN_STATUS_LABEL = "Status tidak dikenal"
export const LEAD_FUNNEL_WON_NOT_CONVERTED_LABEL = "Menang belum terkonversi"
export const LEAD_FUNNEL_NO_STAGE_HISTORY_LABEL = "Tanpa histori tahap"
export const LEAD_FUNNEL_UNASSIGNED_LABEL = "Belum ditugaskan"
export const LEAD_FUNNEL_NO_SOURCE_LABEL = "Sumber tidak tercatat"
export const LEAD_FUNNEL_NO_VALUE_LABEL = "Prospek tanpa nilai estimasi"

/** Notice jujur verbatim spec §6 — UI menempel apa adanya. */
export const LEAD_FUNNEL_MOVEMENT_NOTICE_TEXT =
  "Corong gerakan membaca histori perubahan status. Prospek lama tanpa histori tampil di posisi saat ini saja."
export const LEAD_FUNNEL_VALUE_NOTICE_TEXT =
  "Nilai estimasi adalah perkiraan peluang, bukan piutang atau pendapatan."
/** BR-LF-08: Σ nilai memakai nilai saat ini, bukan nilai saat tahap terjadi. */
export const LEAD_FUNNEL_CURRENT_VALUE_NOTICE_TEXT =
  "Nilai estimasi saat ini, bukan nilai saat tahap terjadi."

/** Tahap maju kanonik (tanpa `lost` — keluar kalah dari tahap mana pun). */
export const LEAD_FUNNEL_FORWARD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
] as const

export type LeadFunnelForwardStage = (typeof LEAD_FUNNEL_FORWARD_STAGES)[number]

const FORWARD_INDEX = new Map<string, number>(
  LEAD_FUNNEL_FORWARD_STAGES.map((stage, index) => [stage, index]),
)
const KNOWN_STATUSES = new Set<string>(LEAD_STATUSES)

export interface LeadFunnelActivityInput {
  type: string
  oldStatus: string | null
  newStatus: string | null
  createdAt: Date
  /** F-2026-10-25-030-S: awalan [kalah:key] dibaca builder alasan kalah dari sini. */
  description?: string | null
}

export interface LeadFunnelLeadInput {
  id: number
  status: string
  /** estimatedValue saat ini; null = tanpa nilai estimasi (ember terpisah). */
  estimatedValue: number | null
  source: string | null
  assignedTo: number | null
  /** Nama penanggung ter-resolusi loader; null bila belum ditugaskan. */
  assignedToName: string | null
  customerId: number | null
  convertedAt: Date | null
  deletedAt: Date | null
  activities: readonly LeadFunnelActivityInput[]
}

export interface LeadFunnelStageBucket {
  status: string
  label: string
  count: number
  /** Σ estimatedValue prospek bernilai pada ember ini. */
  estimatedValueTotal: number
  /** Prospek dengan estimatedValue kosong — TIDAK menyatu dengan Rp0. */
  withoutValueCount: number
}

export interface LeadFunnelBreakdownRow {
  /** source apa adanya / nama penanggung / label ember jujur. */
  key: string
  label: string
  count: number
  estimatedValueTotal: number
  withoutValueCount: number
  wonCount: number
  lostCount: number
  convertedCount: number
}

export interface LeadFunnelPosition {
  /** Satu ember per status LEAD_STATUSES, urutan kanonik. */
  stages: LeadFunnelStageBucket[]
  unknownStatus: LeadFunnelStageBucket
  totalLeads: number
  /** won tanpa convertedAt/customerId (BR-LF-03) — subset dari ember won. */
  wonNotConverted: LeadFunnelStageBucket
  /** Terkonversi nyata: convertedAt atau customerId terisi (BR-LF-03). */
  convertedCount: number
  /** Tanpa aktivitas status_change/conversion sama sekali (BR-LF-04). */
  noStageHistoryCount: number
  bySource: LeadFunnelBreakdownRow[]
  /** null bila scope permukaan tidak mengizinkan nama penanggung (Q-LF-1). */
  byAssignee: LeadFunnelBreakdownRow[] | null
  /** F-2026-10-25-030-S Q-LR-3: rincian lostCount per kategori alasan kalah. */
  lostByReason: LeadLostReasonBreakdownRow[]
}

export interface LeadFunnelMovementStage {
  status: LeadFunnelForwardStage
  label: string
  /** Prospek kohort yang mencapai tahap ini (termasuk lewat lompatan). */
  reachedCount: number
  /** Mencapai tahap ini TANPA pernah tercatat eksplisit di tahap ini. */
  skippedUnrecordedCount: number
  /** reachedCount(tahap ini) / reachedCount(tahap sebelumnya); null = belum ada data. */
  transitionRatioFromPrevious: number | null
}

export interface LeadFunnelMovement {
  periodStart: Date
  periodEnd: Date
  /** Prospek dengan aktivitas gerakan dalam periode (Q-LF-3). */
  cohortCount: number
  stages: LeadFunnelMovementStage[]
  lostReachedCount: number
  /** won di kohort tanpa bukti konversi (BR-LF-03). */
  wonNotConvertedCount: number
  convertedCount: number
  /** Kohort tanpa pencapaian tahap yang bisa dibaca — keluar penyebut rasio. */
  noStageHistoryCount: number
  /** Kohort yang status tercatatnya hanya status asing. */
  unknownStatusCount: number
  bySource: LeadFunnelBreakdownRow[]
  byAssignee: LeadFunnelBreakdownRow[] | null
}

export interface LeadFunnel {
  position: LeadFunnelPosition
  movement: LeadFunnelMovement | null
}

export interface LeadFunnelOptions {
  /** Sertakan pemecahan per penanggung bernama (Q-LF-1: hanya report/manage). */
  includeAssigneeBreakdown: boolean
  /** Periode corong gerakan inklusif; null = posisi saja. */
  period: { start: Date; end: Date } | null
}

function emptyBucket(status: string, label: string): LeadFunnelStageBucket {
  return { status, label, count: 0, estimatedValueTotal: 0, withoutValueCount: 0 }
}

function addToBucket(bucket: LeadFunnelStageBucket, lead: LeadFunnelLeadInput): void {
  bucket.count += 1
  if (lead.estimatedValue == null) bucket.withoutValueCount += 1
  else bucket.estimatedValueTotal = safeAdd(bucket.estimatedValueTotal, lead.estimatedValue, 2)
}

function isConverted(lead: LeadFunnelLeadInput): boolean {
  return lead.convertedAt != null || lead.customerId != null
}

function isMovementActivity(activity: LeadFunnelActivityInput): boolean {
  return activity.type === "status_change" || activity.type === "conversion"
}

interface BreakdownAcc {
  row: LeadFunnelBreakdownRow
}

function addToBreakdown(
  map: Map<string, BreakdownAcc>,
  key: string,
  label: string,
  lead: LeadFunnelLeadInput,
): void {
  let acc = map.get(key)
  if (!acc) {
    acc = {
      row: {
        key,
        label,
        count: 0,
        estimatedValueTotal: 0,
        withoutValueCount: 0,
        wonCount: 0,
        lostCount: 0,
        convertedCount: 0,
      },
    }
    map.set(key, acc)
  }
  acc.row.count += 1
  if (lead.estimatedValue == null) acc.row.withoutValueCount += 1
  else acc.row.estimatedValueTotal = safeAdd(acc.row.estimatedValueTotal, lead.estimatedValue, 2)
  if (lead.status === "won") acc.row.wonCount += 1
  if (lead.status === "lost") acc.row.lostCount += 1
  if (isConverted(lead)) acc.row.convertedCount += 1
}

function sortedBreakdown(map: Map<string, BreakdownAcc>): LeadFunnelBreakdownRow[] {
  return Array.from(map.values(), (acc) => acc.row).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0
  })
}

function buildPosition(
  leads: readonly LeadFunnelLeadInput[],
  includeAssigneeBreakdown: boolean,
): LeadFunnelPosition {
  const stageByStatus = new Map<string, LeadFunnelStageBucket>(
    LEAD_STATUSES.map((status) => [
      status,
      emptyBucket(status, LEAD_FUNNEL_STAGE_LABELS[status] ?? status),
    ]),
  )
  const unknownStatus = emptyBucket("status_tidak_dikenal", LEAD_FUNNEL_UNKNOWN_STATUS_LABEL)
  const wonNotConverted = emptyBucket(
    "menang_belum_terkonversi",
    LEAD_FUNNEL_WON_NOT_CONVERTED_LABEL,
  )
  const bySource = new Map<string, BreakdownAcc>()
  const byAssignee = new Map<string, BreakdownAcc>()
  let convertedCount = 0
  let noStageHistoryCount = 0

  for (const lead of leads) {
    const bucket = stageByStatus.get(lead.status) ?? unknownStatus
    addToBucket(bucket, lead)
    if (lead.status === "won" && !isConverted(lead)) addToBucket(wonNotConverted, lead)
    if (isConverted(lead)) convertedCount += 1
    if (!lead.activities.some(isMovementActivity)) noStageHistoryCount += 1

    const sourceKey = lead.source?.trim() ? lead.source : null
    addToBreakdown(
      bySource,
      sourceKey ?? "sumber_tidak_tercatat",
      sourceKey ?? LEAD_FUNNEL_NO_SOURCE_LABEL,
      lead,
    )
    if (includeAssigneeBreakdown) {
      addToBreakdown(
        byAssignee,
        lead.assignedTo != null ? `user:${lead.assignedTo}` : "belum_ditugaskan",
        lead.assignedTo != null
          ? (lead.assignedToName ?? `#${lead.assignedTo}`)
          : LEAD_FUNNEL_UNASSIGNED_LABEL,
        lead,
      )
    }
  }

  return {
    stages: LEAD_STATUSES.map((status) => stageByStatus.get(status)!),
    unknownStatus,
    totalLeads: leads.length,
    wonNotConverted,
    convertedCount,
    noStageHistoryCount,
    bySource: sortedBreakdown(bySource),
    byAssignee: includeAssigneeBreakdown ? sortedBreakdown(byAssignee) : null,
    // Q-LR-3: rincian hanya lead lost posisi saat ini; aktivitas
    // status_change->lost TERBARU per lead (loader orderBy naik).
    lostByReason: buildLeadLostReasonBreakdown(
      leads
        .filter((lead) => lead.status === "lost")
        .map((lead) => latestLeadLostDescription(lead.activities)),
    ),
  }
}

interface CohortLeadResult {
  highestForwardIndex: number
  explicitStages: Set<string>
  reachedLost: boolean
  hasReadableStage: boolean
  onlyUnknownStatuses: boolean
}

function evaluateCohortLead(
  lead: LeadFunnelLeadInput,
  periodEnd: Date,
): CohortLeadResult {
  const explicitStages = new Set<string>()
  let highestForwardIndex = -1
  let reachedLost = false
  let sawMovement = false
  let sawUnknownStatus = false

  for (const activity of lead.activities) {
    if (!isMovementActivity(activity)) continue
    if (activity.createdAt.getTime() > periodEnd.getTime()) continue
    sawMovement = true
    if (activity.type === "conversion") {
      explicitStages.add("won")
      highestForwardIndex = Math.max(highestForwardIndex, FORWARD_INDEX.get("won")!)
      continue
    }
    const next = activity.newStatus
    if (next == null) continue
    if (!KNOWN_STATUSES.has(next)) {
      sawUnknownStatus = true
      continue
    }
    explicitStages.add(next)
    if (next === "lost") reachedLost = true
    const index = FORWARD_INDEX.get(next)
    if (index != null) highestForwardIndex = Math.max(highestForwardIndex, index)
  }

  return {
    highestForwardIndex,
    explicitStages,
    reachedLost,
    hasReadableStage: highestForwardIndex >= 0 || reachedLost,
    onlyUnknownStatuses: sawMovement && !explicitStages.size && sawUnknownStatus,
  }
}

function buildMovement(
  leads: readonly LeadFunnelLeadInput[],
  period: { start: Date; end: Date },
  includeAssigneeBreakdown: boolean,
): LeadFunnelMovement {
  const startMs = period.start.getTime()
  const endMs = period.end.getTime()
  const reached: number[] = LEAD_FUNNEL_FORWARD_STAGES.map(() => 0)
  const skipped: number[] = LEAD_FUNNEL_FORWARD_STAGES.map(() => 0)
  const bySource = new Map<string, BreakdownAcc>()
  const byAssignee = new Map<string, BreakdownAcc>()
  let cohortCount = 0
  let lostReachedCount = 0
  let wonNotConvertedCount = 0
  let convertedCount = 0
  let noStageHistoryCount = 0
  let unknownStatusCount = 0

  for (const lead of leads) {
    const inCohort = lead.activities.some((activity) => {
      if (!isMovementActivity(activity)) return false
      const t = activity.createdAt.getTime()
      return t >= startMs && t <= endMs
    })
    if (!inCohort) continue
    cohortCount += 1

    const result = evaluateCohortLead(lead, period.end)
    if (!result.hasReadableStage) {
      noStageHistoryCount += 1
      if (result.onlyUnknownStatuses) unknownStatusCount += 1
      continue
    }
    for (let i = 0; i <= result.highestForwardIndex; i += 1) {
      reached[i] += 1
      if (!result.explicitStages.has(LEAD_FUNNEL_FORWARD_STAGES[i])) skipped[i] += 1
    }
    if (result.reachedLost) lostReachedCount += 1
    const reachedWon = result.highestForwardIndex >= FORWARD_INDEX.get("won")!
    if (reachedWon && !isConverted(lead)) wonNotConvertedCount += 1
    if (isConverted(lead)) convertedCount += 1

    const sourceKey = lead.source?.trim() ? lead.source : null
    addToBreakdown(
      bySource,
      sourceKey ?? "sumber_tidak_tercatat",
      sourceKey ?? LEAD_FUNNEL_NO_SOURCE_LABEL,
      lead,
    )
    if (includeAssigneeBreakdown) {
      addToBreakdown(
        byAssignee,
        lead.assignedTo != null ? `user:${lead.assignedTo}` : "belum_ditugaskan",
        lead.assignedTo != null
          ? (lead.assignedToName ?? `#${lead.assignedTo}`)
          : LEAD_FUNNEL_UNASSIGNED_LABEL,
        lead,
      )
    }
  }

  const stages: LeadFunnelMovementStage[] = LEAD_FUNNEL_FORWARD_STAGES.map((status, i) => ({
    status,
    label: LEAD_FUNNEL_STAGE_LABELS[status] ?? status,
    reachedCount: reached[i],
    skippedUnrecordedCount: skipped[i],
    transitionRatioFromPrevious:
      i === 0 ? null : reached[i - 1] === 0 ? null : reached[i] / reached[i - 1],
  }))

  return {
    periodStart: period.start,
    periodEnd: period.end,
    cohortCount,
    stages,
    lostReachedCount,
    wonNotConvertedCount,
    convertedCount,
    noStageHistoryCount,
    unknownStatusCount,
    bySource: sortedBreakdown(bySource),
    byAssignee: includeAssigneeBreakdown ? sortedBreakdown(byAssignee) : null,
  }
}

/**
 * Populasi = Lead.deletedAt IS NULL (BR-LF-02): baris terhapus yang lolos
 * ke builder tetap disaring di sini supaya angka tidak bergantung pada
 * loader saja. Satu prospek dihitung satu kali walau banyak aktivitas
 * (BR-LF-12).
 */
export function buildLeadFunnel(
  inputs: readonly LeadFunnelLeadInput[],
  options: LeadFunnelOptions,
): LeadFunnel {
  const leads = inputs.filter((lead) => lead.deletedAt == null)
  return {
    position: buildPosition(leads, options.includeAssigneeBreakdown),
    movement: options.period
      ? buildMovement(leads, options.period, options.includeAssigneeBreakdown)
      : null,
  }
}
