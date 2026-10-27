/**
 * F-2026-10-27-091-S (091-B+F) — antrean tugas proyek (`Task`) lewat
 * tenggat belum selesai. Turunan murni baca-saja di atas rekod Task
 * existing (BR-PTQ-01..12); tanpa kolom/status tersimpan baru.
 *
 * PUTUSAN LEAD (final):
 * - Q-PTQ-1: `MENDEKATI` = sisa hari <= 3 hari kalender WIB, satu
 *   konstanta server bernama (`PROJECT_TASK_MENDEKATI_MAX_DAYS`).
 * - Q-PTQ-2: kata spec apa adanya — ember `LEWAT_TENGGAT`/`MENDEKATI`/
 *   `TANPA_TENGGAT`, label `Belum ditugaskan`, `Status Tidak Dikenal`,
 *   judul `Tugas Proyek Lewat Tenggat`. Satu konstanta label server;
 *   UI menempel verbatim.
 * - Q-PTQ-3: baca tahap 1 lintas-penugasan persis daftar existing
 *   (`view_projects`, tanpa saring per penugasan) + notice batas jujur.
 * - Q-PTQ-5: tanpa saring status proyek induk; tanpa kolom
 *   umur-sejak-dibuat tahap 1.
 * - Q-PTQ-6: tanpa nominal/denda (BR-PTQ-09); tanpa persen progres
 *   dalam bentuk apa pun (BR-PTQ-08).
 *
 * Populasi (BR-PTQ-01): persis `pending`/`in_progress`; `completed`/
 * `cancelled` terminal dan keluar. `skipped` adalah kosakata
 * ProjectStage — BUKAN Task — dan tidak relevan di sini. Status di
 * luar empat kosakata UI Task (BR-PTQ-02) masuk ember
 * `Status Tidak Dikenal` tertanda: tetap populasi belum-selesai,
 * tidak ditebak padanannya, tidak dihitung ke rekap status dikenal.
 *
 * Ember tenggat (BR-PTQ-03) turunan murni dari `dueDate` vs hari
 * kalender WIB (`wibDayNumber`): due kemarin = `LEWAT_TENGGAT`,
 * due hari ini = sisa 0 dan BUKAN lewat, null = `TANPA_TENGGAT`
 * (sisa/umur null, tidak pernah dihitung terlambat — null bukan
 * epoch). Umur hanya dari `dueDate` (BR-PTQ-04); `startDate`/
 * `createdAt`/`updatedAt` diterima sebagai bawaan rekod dan SENGAJA
 * tidak pernah dibaca sebagai acuan keterlambatan (`createdAt` hanya
 * mengurutkan ember `TANPA_TENGGAT`, tertua dulu, BR-PTQ-10).
 *
 * Payload tanpa persen, tanpa nominal, tanpa kontak karyawan
 * (BR-PTQ-08/09): hanya nama penanggung dari relasi.
 *
 * Pure (tanpa Prisma/DOM). Loader: `project-task-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Judul verbatim Q-PTQ-2 — UI menempel apa adanya. */
export const PROJECT_TASK_QUEUE_TITLE = "Tugas Proyek Lewat Tenggat"

/** Ambang MENDEKATI: sisa hari <= 3 hari kalender WIB (Q-PTQ-1). */
export const PROJECT_TASK_MENDEKATI_MAX_DAYS = 3

/** Batas ambil tampil eksplisit (BR-PTQ-10, pola keluarga 200). */
export const PROJECT_TASK_QUEUE_LIMIT = 200

/** Label penanggung kosong verbatim Q-PTQ-2/BR-PTQ-05. */
export const PROJECT_TASK_UNASSIGNED_LABEL = "Belum ditugaskan"

/** Label ember status asing verbatim Q-PTQ-2/BR-PTQ-02. */
export const PROJECT_TASK_UNKNOWN_STATUS_LABEL = "Status Tidak Dikenal"

/** Penanggung tertaut (`assignedTo` ada) tetapi relasi tidak terbaca. */
export const PROJECT_TASK_MISSING_ASSIGNEE_LABEL = "Penanggung Tidak Ditemukan"

export const PROJECT_TASK_TRUNCATED_LABEL = "Terpotong"

export const PROJECT_TASK_BUCKETS = [
  "LEWAT_TENGGAT",
  "MENDEKATI",
  "BELUM_MENDESAK",
  "TANPA_TENGGAT",
] as const

export type ProjectTaskBucket = (typeof PROJECT_TASK_BUCKETS)[number]

/** Label ember verbatim Q-PTQ-2 — satu konstanta server, UI verbatim. */
export const PROJECT_TASK_BUCKET_LABELS: Record<ProjectTaskBucket, string> = {
  LEWAT_TENGGAT: "Lewat Tenggat",
  MENDEKATI: "Mendekati",
  BELUM_MENDESAK: "Belum Mendesak",
  TANPA_TENGGAT: "Tanpa Tenggat",
}

/** Kosakata status dikenal Task (BR-PTQ-01, form tugas existing). */
export const PROJECT_TASK_KNOWN_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const

export const PROJECT_TASK_UNFINISHED_STATUSES = ["pending", "in_progress"] as const

export type ProjectTaskUnfinishedStatus = (typeof PROJECT_TASK_UNFINISHED_STATUSES)[number]

/** Label status dikenal mengikuti kosakata UI existing. */
export const PROJECT_TASK_STATUS_LABELS: Record<ProjectTaskUnfinishedStatus, string> = {
  pending: "Menunggu",
  in_progress: "Dalam Proses",
}

/** Label kolom verbatim — satu konstanta server, UI verbatim. */
export const PROJECT_TASK_COLUMN_LABELS = {
  name: "Tugas",
  project: "Proyek",
  assignee: "Penanggung Jawab",
  status: "Status",
  dueDate: "Tenggat",
  bucket: "Ember Tenggat",
  keterlambatan: "Keterlambatan",
} as const

/** Notice batas jujur Q-PTQ-3/BR-PTQ-06 + baca-saja BR-PTQ-07. */
export const PROJECT_TASK_QUEUE_NOTICE_TEXT =
  "Daftar tugas proyek yang belum selesai per ember tenggat. Pada tahap ini semua pemegang izin melihat semua tugas lintas penugasan, sama seperti daftar tugas existing. Daftar ini baca-saja; tindak lanjut dilakukan lewat detail/edit tugas existing."

export const PROJECT_TASK_QUEUE_EMPTY_TEXT = "Tidak ada tugas proyek belum selesai."

const TERMINAL_STATUSES = new Set(["completed", "cancelled"])
const KNOWN_STATUSES = new Set<string>(PROJECT_TASK_KNOWN_STATUSES)

const BUCKET_RANK: Record<ProjectTaskBucket, number> = {
  LEWAT_TENGGAT: 0,
  MENDEKATI: 1,
  BELUM_MENDESAK: 2,
  TANPA_TENGGAT: 3,
}

export interface ProjectTaskQueueInput {
  taskId: number
  slug: string | null
  name: string
  /** Status tersimpan apa adanya (string bebas, BR-PTQ-02). */
  status: string
  projectId: number
  projectName: string | null
  /** Kolom penugasan; null persis terbaca `Belum ditugaskan`. */
  assignedTo: number | null
  /** Nama dari relasi Employee tertaut; null bila relasi tak terbaca. */
  assigneeName: string | null
  dueDate: Date | null
  createdAt: Date
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-PTQ-04). */
  startDate?: Date | null
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-PTQ-04). */
  updatedAt?: Date | null
}

export interface ProjectTaskQueueRow {
  taskId: number
  slug: string | null
  name: string
  /** Status mentah tersimpan — tetap tertanda di samping label. */
  status: string
  /** Status dikenal belum-selesai; null hanya untuk status asing. */
  knownStatus: ProjectTaskUnfinishedStatus | null
  statusLabel: string
  statusTidakDikenal: boolean
  projectId: number
  projectName: string | null
  assignedTo: number | null
  assigneeName: string | null
  /** Label penanggung verbatim server (nama / Belum ditugaskan / tertanda). */
  assigneeLabel: string
  belumDitugaskan: boolean
  penanggungTidakDitemukan: boolean
  dueDate: Date | null
  createdAt: Date
  bucket: ProjectTaskBucket
  bucketLabel: string
  /** Hari kalender WIB due − hari ini; negatif = lewat; null = tanpa tenggat. */
  sisaHari: number | null
  /** Hari lewat tenggat (>= 1) hanya untuk LEWAT_TENGGAT; selain itu null. */
  umurLewatHari: number | null
  /** Label keterlambatan verbatim server — UI tidak menghitung ulang. */
  keterlambatanLabel: string
  flags: string[]
}

export interface ProjectTaskProjectRecap {
  projectId: number
  projectName: string | null
  count: number
}

export interface ProjectTaskAssigneeRecap {
  assignedTo: number | null
  assigneeLabel: string
  count: number
}

export interface ProjectTaskQueue {
  /** Baris tampil terurut BR-PTQ-10, dipotong pada `limit`. */
  rows: ProjectTaskQueueRow[]
  /** Σ tugas per ember atas populasi PENUH (sebelum potong). */
  bucketCounts: Record<ProjectTaskBucket, number>
  /** Σ tugas per status dikenal; status asing tidak masuk sini. */
  statusCounts: Record<ProjectTaskUnfinishedStatus, number>
  unknownStatusCount: number
  /** Rekap per proyek atas populasi penuh (BR-PTQ-10/12). */
  projectRecap: ProjectTaskProjectRecap[]
  /** Rekap per penanggung atas populasi penuh; null = Belum ditugaskan. */
  assigneeRecap: ProjectTaskAssigneeRecap[]
  /** Total populasi belum-selesai (dikenal + asing, tanpa terminal). */
  totalPopulation: number
  terpotong: boolean
  limit: number
  noticeText: string
}

function bucketFor(sisaHari: number | null): ProjectTaskBucket {
  if (sisaHari === null) return "TANPA_TENGGAT"
  if (sisaHari < 0) return "LEWAT_TENGGAT"
  if (sisaHari <= PROJECT_TASK_MENDEKATI_MAX_DAYS) return "MENDEKATI"
  return "BELUM_MENDESAK"
}

export function buildProjectTaskQueue(
  inputs: readonly ProjectTaskQueueInput[],
  now: Date = new Date(),
  limit: number = PROJECT_TASK_QUEUE_LIMIT,
): ProjectTaskQueue {
  const todayNumber = wibDayNumber(now)
  const rows: ProjectTaskQueueRow[] = []

  for (const input of inputs) {
    if (TERMINAL_STATUSES.has(input.status)) continue

    const statusTidakDikenal = !KNOWN_STATUSES.has(input.status)
    const knownStatus: ProjectTaskUnfinishedStatus | null = statusTidakDikenal
      ? null
      : (input.status as ProjectTaskUnfinishedStatus)

    // dueDate null = TANPA_TENGGAT jujur; TIDAK diperlakukan epoch/0.
    const sisaHari = input.dueDate === null ? null : wibDayNumber(input.dueDate) - todayNumber
    const bucket = bucketFor(sisaHari)
    const umurLewatHari = sisaHari !== null && sisaHari < 0 ? -sisaHari : null

    const belumDitugaskan = input.assignedTo === null
    const penanggungTidakDitemukan = !belumDitugaskan && input.assigneeName === null
    const assigneeLabel = belumDitugaskan
      ? PROJECT_TASK_UNASSIGNED_LABEL
      : penanggungTidakDitemukan
        ? PROJECT_TASK_MISSING_ASSIGNEE_LABEL
        : (input.assigneeName as string)

    const flags: string[] = []
    if (statusTidakDikenal) flags.push(PROJECT_TASK_UNKNOWN_STATUS_LABEL)
    if (belumDitugaskan) flags.push(PROJECT_TASK_UNASSIGNED_LABEL)
    if (penanggungTidakDitemukan) flags.push(PROJECT_TASK_MISSING_ASSIGNEE_LABEL)

    rows.push({
      taskId: input.taskId,
      slug: input.slug,
      name: input.name,
      status: input.status,
      knownStatus,
      statusLabel: statusTidakDikenal
        ? PROJECT_TASK_UNKNOWN_STATUS_LABEL
        : PROJECT_TASK_STATUS_LABELS[knownStatus as ProjectTaskUnfinishedStatus],
      statusTidakDikenal,
      projectId: input.projectId,
      projectName: input.projectName,
      assignedTo: input.assignedTo,
      assigneeName: input.assigneeName,
      assigneeLabel,
      belumDitugaskan,
      penanggungTidakDitemukan,
      dueDate: input.dueDate,
      createdAt: input.createdAt,
      bucket,
      bucketLabel: PROJECT_TASK_BUCKET_LABELS[bucket],
      sisaHari,
      umurLewatHari,
      keterlambatanLabel:
        bucket === "TANPA_TENGGAT"
          ? PROJECT_TASK_BUCKET_LABELS.TANPA_TENGGAT
          : bucket === "LEWAT_TENGGAT"
            ? `Terlambat ${umurLewatHari} hari`
            : `Sisa ${sisaHari} hari`,
      flags,
    })
  }

  // BR-PTQ-10: LEWAT_TENGGAT (umur terbesar = dueDate tertua) ->
  // MENDEKATI -> BELUM_MENDESAK (sisa terkecil = dueDate terawal) ->
  // TANPA_TENGGAT (tertua dibuat dulu); seri -> dueDate naik, id naik.
  rows.sort((a, b) => {
    const bucketDiff = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]
    if (bucketDiff !== 0) return bucketDiff
    if (a.bucket === "TANPA_TENGGAT") {
      const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
      if (createdDiff !== 0) return createdDiff
      return a.taskId - b.taskId
    }
    const dueDiff = (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)
    if (dueDiff !== 0) return dueDiff
    return a.taskId - b.taskId
  })

  // Rekap dari POPULASI PENUH sebelum potongan tampil (BR-PTQ-10/12).
  const bucketCounts: Record<ProjectTaskBucket, number> = {
    LEWAT_TENGGAT: 0,
    MENDEKATI: 0,
    BELUM_MENDESAK: 0,
    TANPA_TENGGAT: 0,
  }
  const statusCounts: Record<ProjectTaskUnfinishedStatus, number> = {
    pending: 0,
    in_progress: 0,
  }
  let unknownStatusCount = 0
  const projectMap = new Map<number, ProjectTaskProjectRecap>()
  const assigneeMap = new Map<string, ProjectTaskAssigneeRecap>()
  for (const row of rows) {
    bucketCounts[row.bucket] += 1
    if (row.knownStatus !== null) statusCounts[row.knownStatus] += 1
    else unknownStatusCount += 1

    const project = projectMap.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      count: 0,
    }
    project.count += 1
    projectMap.set(row.projectId, project)

    const assigneeKey = row.assignedTo === null ? "null" : `id:${row.assignedTo}`
    const assignee = assigneeMap.get(assigneeKey) ?? {
      assignedTo: row.assignedTo,
      assigneeLabel: row.assigneeLabel,
      count: 0,
    }
    assignee.count += 1
    assigneeMap.set(assigneeKey, assignee)
  }

  const projectRecap = [...projectMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const nameDiff = (a.projectName ?? "").localeCompare(b.projectName ?? "", "id-ID")
    if (nameDiff !== 0) return nameDiff
    return a.projectId - b.projectId
  })
  const assigneeRecap = [...assigneeMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const nameDiff = a.assigneeLabel.localeCompare(b.assigneeLabel, "id-ID")
    if (nameDiff !== 0) return nameDiff
    return (a.assignedTo ?? -1) - (b.assignedTo ?? -1)
  })

  const safeLimit = Math.max(0, Math.floor(limit))

  return {
    rows: rows.slice(0, safeLimit),
    bucketCounts,
    statusCounts,
    unknownStatusCount,
    projectRecap,
    assigneeRecap,
    totalPopulation: rows.length,
    terpotong: rows.length > safeLimit,
    limit: safeLimit,
    noticeText: PROJECT_TASK_QUEUE_NOTICE_TEXT,
  }
}
