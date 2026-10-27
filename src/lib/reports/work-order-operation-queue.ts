/**
 * F-2026-10-27-100-S (100-B+F) — antrean operasi perintah kerja
 * (`WorkOrderOperation`) pending/in_progress mengendap lintas WO.
 * Turunan murni baca-saja; tanpa kolom/status tersimpan baru.
 *
 * PUTUSAN LEAD (final):
 * - Q-WOOQ-1: `MENGENDAP` = umur > 7 hari kalender WIB sejak acuan
 *   per status; `BERJALAN` = umur <= 7. Satu konstanta server bernama.
 * - Q-WOOQ-2: kata verbatim di bawah — judul, tingkat, penanda.
 *   Satu konstanta label server; UI menempel verbatim.
 * - Q-WOOQ-3: seksi turunan di area perintah kerja existing; rekap
 *   per tingkat + per status + per stasiun dari populasi penuh.
 * - Q-WOOQ-4: tingkat tetap mekanis dari umur; tahap terhalang
 *   tampil dengan penandanya (tidak ditahan/disembunyikan).
 * - Q-WOOQ-5: gerbang `view_work_orders` persis, tanpa key baru
 *   (ditegakkan loader).
 *
 * Populasi PERSIS (BR-WOOQ-01): `status ∈ {"pending","in_progress"}`.
 * `completed`/`skipped` terminal keluar; status liar di luar empat
 * nilai sah BUKAN populasi tahap 1 dan tidak ditebak (EC-WOOQ-6) —
 * berbeda dari keluarga antrean yang menampung status liar.
 * Status WO induk TIDAK menyaring populasi (BR-WOOQ-08).
 *
 * Acuan umur PER STATUS (BR-WOOQ-03): `pending` -> `createdAt`
 * (`SEJAK_DIBUAT`); `in_progress` -> `startedAt` (`SEJAK_MULAI`).
 * `in_progress` tanpa `startedAt` -> umur null (`MULAI_TANPA_STEMPEL`),
 * tidak masuk tingkat mana pun, TIDAK memakai `createdAt` diam-diam.
 * `updatedAt` diterima sebagai bawaan rekod dan SENGAJA tidak dibaca.
 * Perbandingan HARI KALENDER WIB (`wibDayNumber`), bukan jam mentah.
 *
 * Payload tanpa nominal/biaya/jam aktual/catatan (BR-WOOQ-09/12):
 * satu-satunya angka jam adalah `estimatedHours` verbatim (null
 * tertanda, bukan 0). Tanpa persen progres (BR-WOOQ-04).
 *
 * Pure (tanpa Prisma/DOM). Loader: `work-order-operation-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Judul verbatim Q-WOOQ-2 — UI menempel apa adanya. */
export const WORK_ORDER_OPERATION_QUEUE_TITLE = "Operasi Perintah Kerja Mengendap"

/** Ambang MENGENDAP: umur > 7 hari kalender WIB (Q-WOOQ-1). */
export const WORK_ORDER_OPERATION_MENGENDAP_THRESHOLD_DAYS = 7

/** Batas baris tampil eksplisit (BR-WOOQ-10, pola keluarga 200). */
export const WORK_ORDER_OPERATION_QUEUE_LIMIT = 200

export const WORK_ORDER_OPERATION_TRUNCATED_LABEL = "Terpotong"

export const WORK_ORDER_OPERATION_QUEUE_EMPTY_TEXT =
  "Tidak ada operasi perintah kerja yang menunggu atau berjalan."

export const WORK_ORDER_OPERATION_QUEUE_NOTICE_TEXT =
  "Daftar tahap perintah kerja yang masih menunggu atau sedang berjalan lintas perintah kerja. Pada tahap ini semua pemegang izin melihat semua tahap, sama seperti daftar perintah kerja existing. Daftar ini baca-saja; tindak lanjut dilakukan lewat detail perintah kerja existing."

export const WORK_ORDER_OPERATION_LEVELS = ["BERJALAN", "MENGENDAP"] as const

export type WorkOrderOperationLevel = (typeof WORK_ORDER_OPERATION_LEVELS)[number]

/** Label tingkat verbatim Q-WOOQ-2 — satu konstanta server. */
export const WORK_ORDER_OPERATION_LEVEL_LABELS: Record<WorkOrderOperationLevel, string> = {
  BERJALAN: "BERJALAN",
  MENGENDAP: "MENGENDAP",
}

export const WORK_ORDER_OPERATION_POPULATION_STATUSES = ["pending", "in_progress"] as const

export type WorkOrderOperationPopulationStatus =
  (typeof WORK_ORDER_OPERATION_POPULATION_STATUSES)[number]

export const WORK_ORDER_OPERATION_STATUS_LABELS: Record<
  WorkOrderOperationPopulationStatus,
  string
> = {
  pending: "Menunggu",
  in_progress: "Dalam Proses",
}

/** Penanda verbatim Q-WOOQ-2 — satu konstanta server, UI verbatim. */
export const WORK_ORDER_OPERATION_MARKERS = {
  SEJAK_DIBUAT: "SEJAK_DIBUAT",
  SEJAK_MULAI: "SEJAK_MULAI",
  MULAI_TANPA_STEMPEL: "MULAI_TANPA_STEMPEL",
  TERHALANG_TAHAP_SEBELUMNYA: "TERHALANG_TAHAP_SEBELUMNYA",
  BELUM_ADA_STASIUN: "BELUM_ADA_STASIUN",
  BELUM_ADA_PENANGGUNG_JAWAB: "BELUM_ADA_PENANGGUNG_JAWAB",
  TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN: "TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN",
} as const

export type WorkOrderOperationAgeSource =
  | typeof WORK_ORDER_OPERATION_MARKERS.SEJAK_DIBUAT
  | typeof WORK_ORDER_OPERATION_MARKERS.SEJAK_MULAI
  | typeof WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL

/** Label kolom verbatim — satu konstanta server, UI verbatim. */
export const WORK_ORDER_OPERATION_COLUMN_LABELS = {
  operation: "Tahap",
  workOrder: "Perintah Kerja",
  workOrderStatus: "Status WO",
  status: "Status Tahap",
  umur: "Umur",
  sumberUmur: "Sumber Umur",
  tingkat: "Tingkat",
  workCenter: "Stasiun",
  assignee: "Penanggung Jawab",
  estimatedHours: "Estimasi Jam",
  endDate: "Tenggat WO",
} as const

const POPULATION = new Set<string>(WORK_ORDER_OPERATION_POPULATION_STATUSES)

const LEVEL_RANK: Record<WorkOrderOperationLevel, number> = {
  MENGENDAP: 0,
  BERJALAN: 1,
}

export interface WorkOrderOperationQueueInput {
  operationId: number
  workOrderId: number
  workOrderSlug: string | null
  documentNo: string
  /** Status WO induk tersimpan apa adanya (BR-WOOQ-08). */
  workOrderStatus: string
  /** Fakta pendamping verbatim; BUKAN acuan umur (BR-WOOQ-08). */
  workOrderEndDate: Date | null
  name: string
  sortOrder: number
  /** Status operasi tersimpan apa adanya; populasi persis dua nilai. */
  status: string
  workCenterId: number | null
  workCenterName: string | null
  assignedEmployeeId: number | null
  assigneeName: string | null
  /** Estimasi verbatim; null tertanda, bukan 0 (BR-WOOQ-04). */
  estimatedHours: number | null
  createdAt: Date
  startedAt: Date | null
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-WOOQ-03). */
  updatedAt?: Date | null
}

export interface WorkOrderOperationQueueRow {
  operationId: number
  workOrderId: number
  workOrderSlug: string | null
  documentNo: string
  workOrderStatus: string
  workOrderEndDate: Date | null
  /** Operasi aktif pada WO bukan in_progress (BR-WOOQ-08). */
  woTidakBerjalan: boolean
  name: string
  sortOrder: number
  status: WorkOrderOperationPopulationStatus
  statusLabel: string
  /** Hari kalender WIB sejak acuan per status; null = tanpa stempel. */
  umurHari: number | null
  umurLabel: string
  sumberUmur: WorkOrderOperationAgeSource
  /** Tanggal acuan umur; null tepat pada MULAI_TANPA_STEMPEL. */
  referenceDate: Date | null
  /** Null tepat pada umur null — tidak masuk tingkat mana pun. */
  tingkat: WorkOrderOperationLevel | null
  tingkatLabel: string
  workCenterId: number | null
  workCenterName: string | null
  workCenterLabel: string
  assignedEmployeeId: number | null
  assigneeName: string | null
  assigneeLabel: string
  estimatedHours: number | null
  /** Nama tahap penghalang urutan; null bila tidak terhalang. */
  blockedByName: string | null
  flags: string[]
}

export interface WorkOrderOperationStationRecap {
  workCenterId: number | null
  workCenterLabel: string
  count: number
}

export interface WorkOrderOperationQueue {
  rows: WorkOrderOperationQueueRow[]
  /** Hitungan per tingkat dari populasi PENUH (umur null tidak dihitung). */
  levelCounts: Record<WorkOrderOperationLevel, number>
  /** Hitungan baris umur null (MULAI_TANPA_STEMPEL) populasi penuh. */
  tanpaUmurCount: number
  statusCounts: Record<WorkOrderOperationPopulationStatus, number>
  /** Rekap per stasiun populasi penuh, termasuk ember BELUM_ADA_STASIUN. */
  stationRecap: WorkOrderOperationStationRecap[]
  totalPopulation: number
  terpotong: boolean
  limit: number
  noticeText: string
  title: string
}

export function buildWorkOrderOperationQueue(
  inputs: readonly WorkOrderOperationQueueInput[],
  now: Date = new Date(),
  limit: number = WORK_ORDER_OPERATION_QUEUE_LIMIT,
): WorkOrderOperationQueue {
  const todayNumber = wibDayNumber(now)

  // BR-WOOQ-01: populasi persis dua status — terminal/liar keluar.
  const population = inputs.filter((input) => POPULATION.has(input.status))

  // Penanda terhalang dihitung dari set populasi per WO yang sama
  // (BR-WOOQ-05/11): tahap sebelumnya belum closed = masih populasi.
  const byWorkOrder = new Map<number, WorkOrderOperationQueueInput[]>()
  for (const input of population) {
    const arr = byWorkOrder.get(input.workOrderId) ?? []
    arr.push(input)
    byWorkOrder.set(input.workOrderId, arr)
  }

  const rows: WorkOrderOperationQueueRow[] = population.map((input) => {
    const status = input.status as WorkOrderOperationPopulationStatus

    let referenceDate: Date | null
    let sumberUmur: WorkOrderOperationAgeSource
    if (status === "pending") {
      referenceDate = input.createdAt
      sumberUmur = WORK_ORDER_OPERATION_MARKERS.SEJAK_DIBUAT
    } else if (input.startedAt !== null) {
      referenceDate = input.startedAt
      sumberUmur = WORK_ORDER_OPERATION_MARKERS.SEJAK_MULAI
    } else {
      referenceDate = null
      sumberUmur = WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL
    }

    const umurHari =
      referenceDate === null
        ? null
        : Math.max(0, todayNumber - wibDayNumber(referenceDate))
    const tingkat: WorkOrderOperationLevel | null =
      umurHari === null
        ? null
        : umurHari > WORK_ORDER_OPERATION_MENGENDAP_THRESHOLD_DAYS
          ? "MENGENDAP"
          : "BERJALAN"

    let blockedByName: string | null = null
    if (status === "pending") {
      const blocker = (byWorkOrder.get(input.workOrderId) ?? [])
        .filter((op) => op.sortOrder < input.sortOrder)
        .sort((a, b) => b.sortOrder - a.sortOrder || b.operationId - a.operationId)[0]
      blockedByName = blocker ? blocker.name : null
    }

    const woTidakBerjalan = input.workOrderStatus !== "in_progress"
    const flags: string[] = []
    if (sumberUmur === WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL) {
      flags.push(WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL)
    }
    if (blockedByName !== null) {
      flags.push(WORK_ORDER_OPERATION_MARKERS.TERHALANG_TAHAP_SEBELUMNYA)
    }
    if (input.workCenterId === null) {
      flags.push(WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_STASIUN)
    }
    if (input.assignedEmployeeId === null) {
      flags.push(WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_PENANGGUNG_JAWAB)
    }
    if (woTidakBerjalan) {
      flags.push(WORK_ORDER_OPERATION_MARKERS.TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN)
    }

    return {
      operationId: input.operationId,
      workOrderId: input.workOrderId,
      workOrderSlug: input.workOrderSlug,
      documentNo: input.documentNo,
      workOrderStatus: input.workOrderStatus,
      workOrderEndDate: input.workOrderEndDate,
      woTidakBerjalan,
      name: input.name,
      sortOrder: input.sortOrder,
      status,
      statusLabel: WORK_ORDER_OPERATION_STATUS_LABELS[status],
      umurHari,
      umurLabel:
        umurHari === null
          ? WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL
          : `${umurHari} hari`,
      sumberUmur,
      referenceDate,
      tingkat,
      tingkatLabel:
        tingkat === null
          ? WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL
          : WORK_ORDER_OPERATION_LEVEL_LABELS[tingkat],
      workCenterId: input.workCenterId,
      workCenterName: input.workCenterName,
      workCenterLabel:
        input.workCenterId === null
          ? WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_STASIUN
          : (input.workCenterName ?? WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_STASIUN),
      assignedEmployeeId: input.assignedEmployeeId,
      assigneeName: input.assigneeName,
      assigneeLabel:
        input.assignedEmployeeId === null
          ? WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_PENANGGUNG_JAWAB
          : (input.assigneeName ?? WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_PENANGGUNG_JAWAB),
      estimatedHours: input.estimatedHours,
      blockedByName,
      flags,
    }
  })

  // BR-WOOQ-10: MENGENDAP (umur terbesar) -> BERJALAN (umur terbesar)
  // -> umur-null terakhir; seri -> documentNo naik, sortOrder naik, id naik.
  rows.sort((a, b) => {
    const rankA = a.tingkat === null ? 2 : LEVEL_RANK[a.tingkat]
    const rankB = b.tingkat === null ? 2 : LEVEL_RANK[b.tingkat]
    if (rankA !== rankB) return rankA - rankB
    const ageDiff = (b.umurHari ?? -1) - (a.umurHari ?? -1)
    if (ageDiff !== 0) return ageDiff
    if (a.documentNo !== b.documentNo) return a.documentNo < b.documentNo ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.operationId - b.operationId
  })

  // Rekap dari POPULASI PENUH sebelum potongan tampil (BR-WOOQ-10).
  const levelCounts: Record<WorkOrderOperationLevel, number> = {
    BERJALAN: 0,
    MENGENDAP: 0,
  }
  const statusCounts: Record<WorkOrderOperationPopulationStatus, number> = {
    pending: 0,
    in_progress: 0,
  }
  let tanpaUmurCount = 0
  const stationMap = new Map<string, WorkOrderOperationStationRecap>()
  for (const row of rows) {
    if (row.tingkat !== null) levelCounts[row.tingkat] += 1
    else tanpaUmurCount += 1
    statusCounts[row.status] += 1
    const key = row.workCenterId === null ? "null" : `id:${row.workCenterId}`
    const recap = stationMap.get(key) ?? {
      workCenterId: row.workCenterId,
      workCenterLabel: row.workCenterLabel,
      count: 0,
    }
    recap.count += 1
    stationMap.set(key, recap)
  }
  const stationRecap = [...stationMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const nameDiff = a.workCenterLabel.localeCompare(b.workCenterLabel, "id-ID")
    if (nameDiff !== 0) return nameDiff
    return (a.workCenterId ?? -1) - (b.workCenterId ?? -1)
  })

  const safeLimit = Math.max(0, Math.floor(limit))

  return {
    rows: rows.slice(0, safeLimit),
    levelCounts,
    tanpaUmurCount,
    statusCounts,
    stationRecap,
    totalPopulation: rows.length,
    terpotong: rows.length > safeLimit,
    limit: safeLimit,
    noticeText: WORK_ORDER_OPERATION_QUEUE_NOTICE_TEXT,
    title: WORK_ORDER_OPERATION_QUEUE_TITLE,
  }
}
