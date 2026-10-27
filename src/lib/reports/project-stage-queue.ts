/**
 * F-2026-10-27-092-S (092-B+F) — antrean tahap proyek berjalan tanpa
 * progres baru. Turunan murni baca-saja di atas rekod ProjectStage +
 * ProjectStageProgress existing (BR-PSQ-01..12); tanpa kolom/status
 * tersimpan baru dan tanpa nominal apa pun.
 *
 * PUTUSAN LEAD (final):
 * - Q-PSQ-1: `MENGENDAP` = umur kesegaran > 7 hari kalender WIB;
 *   `BERJALAN` = <= 7 hari. Satu konstanta server bernama
 *   (`PROJECT_STAGE_MENGENDAP_THRESHOLD_DAYS`).
 * - Q-PSQ-2: kata verbatim spec — judul `Tahap Proyek Berjalan Tanpa
 *   Progres Baru`; tingkat `BERJALAN`/`MENGENDAP`; penanda
 *   `PROGRES_TERAKHIR`, `MULAI_TANPA_PROGRES`, `TANPA_ACUAN`,
 *   `TAHAP_BERJALAN_DI_PROYEK_SELESAI`. Satu konstanta label server;
 *   UI menempel verbatim.
 * - Q-PSQ-3/5: gerbang `view_projects` persis (ditegakkan loader),
 *   tanpa key izin baru; seksi turunan di halaman proyek existing.
 * - Q-PSQ-6: tanpa vonis accountant — nol nominal tahap ini.
 *
 * Populasi (BR-PSQ-01): PERSIS `ProjectStage.status === "in_progress"`.
 * `pending`/`completed`/`skipped`/status liar semuanya KELUAR dan
 * tidak ditebak padanannya (EC-PSQ-6).
 *
 * Acuan kesegaran (BR-PSQ-02): rekod ProjectStageProgress terakhir
 * per tahap (`createdAt desc, id desc` — definisi loader earned value
 * existing), BUKAN `updatedAt` tahap dan BUKAN `startedAt` bila rekod
 * ada. `updatedAt` diterima sebagai bawaan rekod dan SENGAJA tidak
 * pernah dibaca builder. Nol rekod (BR-PSQ-03): acuan = `startedAt`
 * tertanda `MULAI_TANPA_PROGRES`, persen null; `startedAt` null juga
 * -> umur null tertanda `TANPA_ACUAN`, tetap tampil, tidak dihitung
 * mengendap (null bukan epoch/0). Persen (BR-PSQ-05) = `percentage`
 * rekod terakhir VERBATIM — tanpa rata-rata/interpolasi/derivasi.
 *
 * Umur = selisih HARI KALENDER WIB (pola `wibDayNumber` keluarga
 * antrean), bukan jam mentah (BR-PSQ-04).
 *
 * Pure (tanpa Prisma/DOM). Loader: `project-stage-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Judul verbatim Q-PSQ-2 — UI menempel apa adanya. */
export const PROJECT_STAGE_QUEUE_TITLE = "Tahap Proyek Berjalan Tanpa Progres Baru"

/** Ambang MENGENDAP: umur kesegaran > 7 hari kalender WIB (Q-PSQ-1). */
export const PROJECT_STAGE_MENGENDAP_THRESHOLD_DAYS = 7

/** Batas ambil tampil eksplisit (BR-PSQ-10, pola keluarga 200). */
export const PROJECT_STAGE_QUEUE_LIMIT = 200

export const PROJECT_STAGE_TRUNCATED_LABEL = "Terpotong"

export const PROJECT_STAGE_LEVELS = ["MENGENDAP", "BERJALAN", "TANPA_ACUAN"] as const

export type ProjectStageLevel = (typeof PROJECT_STAGE_LEVELS)[number]

/** Label tingkat verbatim Q-PSQ-2 — satu konstanta server, UI verbatim. */
export const PROJECT_STAGE_LEVEL_LABELS: Record<ProjectStageLevel, string> = {
  MENGENDAP: "MENGENDAP",
  BERJALAN: "BERJALAN",
  TANPA_ACUAN: "TANPA_ACUAN",
}

export const PROJECT_STAGE_SOURCE_MARKERS = [
  "PROGRES_TERAKHIR",
  "MULAI_TANPA_PROGRES",
  "TANPA_ACUAN",
] as const

export type ProjectStageSourceMarker = (typeof PROJECT_STAGE_SOURCE_MARKERS)[number]

/** Penanda sumber umur verbatim Q-PSQ-2 — satu konstanta server. */
export const PROJECT_STAGE_SOURCE_LABELS: Record<ProjectStageSourceMarker, string> = {
  PROGRES_TERAKHIR: "PROGRES_TERAKHIR",
  MULAI_TANPA_PROGRES: "MULAI_TANPA_PROGRES",
  TANPA_ACUAN: "TANPA_ACUAN",
}

/** Penanda tahap berjalan di proyek selesai verbatim Q-PSQ-2/BR-PSQ-08. */
export const PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL = "TAHAP_BERJALAN_DI_PROYEK_SELESAI"

/** Label kolom verbatim — satu konstanta server, UI verbatim. */
export const PROJECT_STAGE_COLUMN_LABELS = {
  stage: "Tahap",
  project: "Proyek",
  customer: "Pelanggan",
  projectStatus: "Status Proyek",
  persen: "Persen Terakhir",
  acuan: "Acuan Terakhir",
  umur: "Umur Kesegaran",
  level: "Tingkat",
} as const

/** Notice batas jujur BR-PSQ-07 + baca-saja BR-PSQ-06. */
export const PROJECT_STAGE_QUEUE_NOTICE_TEXT =
  "Daftar tahap proyek yang sedang berjalan lintas proyek berdasarkan catatan progres terakhir. Pada tahap ini semua pemegang izin view_projects melihat semua tahap, sama seperti halaman proyek existing. Daftar ini baca-saja; mencatat progres dilakukan lewat halaman proyek existing."

export const PROJECT_STAGE_QUEUE_EMPTY_TEXT = "Tidak ada tahap proyek berjalan."

const LEVEL_RANK: Record<ProjectStageLevel, number> = {
  MENGENDAP: 0,
  BERJALAN: 1,
  TANPA_ACUAN: 2,
}

export interface ProjectStageProgressRecord {
  id: number
  percentage: number
  createdAt: Date
}

export interface ProjectStageQueueInput {
  stageId: number
  stageName: string
  sortOrder: number
  /** Status tersimpan apa adanya (string bebas, BR-PSQ-01). */
  status: string
  startedAt: Date | null
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-PSQ-02). */
  updatedAt?: Date | null
  projectId: number
  projectSlug: string | null
  projectName: string | null
  /** Status proyek induk tersimpan apa adanya (BR-PSQ-08). */
  projectStatus: string | null
  customerName: string | null
  /** Semua rekod progres tahap; builder memilih terakhir (BR-PSQ-02). */
  progress: readonly ProjectStageProgressRecord[]
}

export interface ProjectStageQueueRow {
  stageId: number
  stageName: string
  sortOrder: number
  status: string
  projectId: number
  projectSlug: string | null
  projectName: string | null
  projectStatus: string | null
  customerName: string | null
  /** Persen rekod terakhir verbatim; null bila nol rekod (BR-PSQ-05). */
  persenTerakhir: number | null
  persenLabel: string | null
  /** Tanggal acuan kesegaran (progres terakhir / startedAt / null). */
  acuanTerakhir: Date | null
  sumberUmur: ProjectStageSourceMarker
  sumberUmurLabel: string
  /** Umur kesegaran hari kalender WIB; null = TANPA_ACUAN. */
  umurHari: number | null
  umurLabel: string
  level: ProjectStageLevel
  levelLabel: string
  diProyekSelesai: boolean
  flags: string[]
}

export interface ProjectStageProjectRecap {
  projectId: number
  projectName: string | null
  count: number
}

export interface ProjectStageQueue {
  rows: ProjectStageQueueRow[]
  /** Σ tahap per tingkat atas populasi PENUH (sebelum potong). */
  levelCounts: Record<ProjectStageLevel, number>
  /** Σ tahap per sumber umur atas populasi penuh. */
  sourceCounts: Record<ProjectStageSourceMarker, number>
  /** Rekap per proyek atas populasi penuh (BR-PSQ-10). */
  projectRecap: ProjectStageProjectRecap[]
  totalPopulation: number
  terpotong: boolean
  limit: number
  noticeText: string
}

function latestProgress(
  progress: readonly ProjectStageProgressRecord[],
): ProjectStageProgressRecord | null {
  let latest: ProjectStageProgressRecord | null = null
  for (const record of progress) {
    if (
      latest === null ||
      record.createdAt.getTime() > latest.createdAt.getTime() ||
      (record.createdAt.getTime() === latest.createdAt.getTime() && record.id > latest.id)
    ) {
      latest = record
    }
  }
  return latest
}

export function buildProjectStageQueue(
  inputs: readonly ProjectStageQueueInput[],
  now: Date = new Date(),
  limit: number = PROJECT_STAGE_QUEUE_LIMIT,
): ProjectStageQueue {
  const todayNumber = wibDayNumber(now)
  const rows: ProjectStageQueueRow[] = []

  for (const input of inputs) {
    // BR-PSQ-01: populasi PERSIS satu nilai; selainnya keluar semua.
    if (input.status !== "in_progress") continue

    const latest = latestProgress(input.progress)
    const acuanTerakhir = latest ? latest.createdAt : input.startedAt
    const sumberUmur: ProjectStageSourceMarker = latest
      ? "PROGRES_TERAKHIR"
      : input.startedAt
        ? "MULAI_TANPA_PROGRES"
        : "TANPA_ACUAN"

    // TANPA_ACUAN: umur null jujur; TIDAK diperlakukan epoch/0.
    // Acuan masa depan (impor/migrasi) dijepit 0 — tidak pernah negatif.
    const umurHari =
      acuanTerakhir === null
        ? null
        : Math.max(0, todayNumber - wibDayNumber(acuanTerakhir))
    const level: ProjectStageLevel =
      umurHari === null
        ? "TANPA_ACUAN"
        : umurHari > PROJECT_STAGE_MENGENDAP_THRESHOLD_DAYS
          ? "MENGENDAP"
          : "BERJALAN"

    const diProyekSelesai = input.projectStatus === "completed"
    const flags: string[] = []
    if (sumberUmur !== "PROGRES_TERAKHIR") flags.push(sumberUmur)
    if (diProyekSelesai) flags.push(PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL)

    rows.push({
      stageId: input.stageId,
      stageName: input.stageName,
      sortOrder: input.sortOrder,
      status: input.status,
      projectId: input.projectId,
      projectSlug: input.projectSlug,
      projectName: input.projectName,
      projectStatus: input.projectStatus,
      customerName: input.customerName,
      persenTerakhir: latest ? latest.percentage : null,
      persenLabel: latest ? `${latest.percentage}%` : null,
      acuanTerakhir,
      sumberUmur,
      sumberUmurLabel: PROJECT_STAGE_SOURCE_LABELS[sumberUmur],
      umurHari,
      umurLabel: umurHari === null ? "TANPA_ACUAN" : `${umurHari} hari`,
      level,
      levelLabel: PROJECT_STAGE_LEVEL_LABELS[level],
      diProyekSelesai,
      flags,
    })
  }

  // BR-PSQ-10: MENGENDAP (umur terbesar) -> BERJALAN (umur terbesar)
  // -> TANPA_ACUAN; seri -> nama proyek naik, sortOrder naik, id naik.
  rows.sort((a, b) => {
    const levelDiff = LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    if (levelDiff !== 0) return levelDiff
    const umurDiff = (b.umurHari ?? -1) - (a.umurHari ?? -1)
    if (umurDiff !== 0) return umurDiff
    const nameDiff = (a.projectName ?? "").localeCompare(b.projectName ?? "", "id-ID")
    if (nameDiff !== 0) return nameDiff
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.stageId - b.stageId
  })

  // Rekap dari POPULASI PENUH sebelum potongan tampil (BR-PSQ-10).
  const levelCounts: Record<ProjectStageLevel, number> = {
    MENGENDAP: 0,
    BERJALAN: 0,
    TANPA_ACUAN: 0,
  }
  const sourceCounts: Record<ProjectStageSourceMarker, number> = {
    PROGRES_TERAKHIR: 0,
    MULAI_TANPA_PROGRES: 0,
    TANPA_ACUAN: 0,
  }
  const projectMap = new Map<number, ProjectStageProjectRecap>()
  for (const row of rows) {
    levelCounts[row.level] += 1
    sourceCounts[row.sumberUmur] += 1
    const project = projectMap.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      count: 0,
    }
    project.count += 1
    projectMap.set(row.projectId, project)
  }

  const projectRecap = [...projectMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const nameDiff = (a.projectName ?? "").localeCompare(b.projectName ?? "", "id-ID")
    if (nameDiff !== 0) return nameDiff
    return a.projectId - b.projectId
  })

  const safeLimit = Math.max(0, Math.floor(limit))

  return {
    rows: rows.slice(0, safeLimit),
    levelCounts,
    sourceCounts,
    projectRecap,
    totalPopulation: rows.length,
    terpotong: rows.length > safeLimit,
    limit: safeLimit,
    noticeText: PROJECT_STAGE_QUEUE_NOTICE_TEXT,
  }
}
