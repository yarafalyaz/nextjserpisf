/**
 * Builder murni antrean rekod disiplin belum terbit (F-2026-10-27-095-S,
 * putusan Lead Q-DQ-1..5,7 — kartu TASK-040).
 *
 * Populasi persis BR-DQ-01: `workflowStatus ∈ {draft, pending_approval}`
 * + `voidedAt`/`deletedAt` null + bukan rekod pembatal (`voidOfId` null).
 * Status di luar kosakata DISCIPLINARY_WORKFLOW_STATUSES keluar populasi.
 * Dua tahap terpisah terhitung (BR-DQ-02): `draft` = "Belum Diajukan",
 * `pending_approval` = "Menunggu Persetujuan" — satu konstanta label
 * server di file ini, UI menempel verbatim.
 *
 * Umur menunggu = hari kalender WIB sejak `createdAt` (BR-DQ-07, reuse
 * `wibDayNumber`); `updatedAt` SENGAJA tidak ada di tipe input builder
 * supaya tidak bisa menjadi acuan. Tingkat `Mengendap` (Q-DQ-1) = umur
 * >= 3 hari kalender WIB; urutan tertua dulu (`createdAt` naik), seri
 * `id` naik (BR-DQ-08) — BUKAN ranking keparahan.
 *
 * SENSITIF (BR-DQ-04): tipe input & baris keluaran TIDAK membawa isi
 * kasus (`description`/`regulationReference`/`employeeResponse`/
 * `rejectionReason`/`voidReason`) sama sekali. Nol nominal/status
 * potongan (BR-DQ-09) dan nol simpulan langkah persetujuan (BR-DQ-03):
 * `approvedBy`/`secondApprovedBy` dibawa verbatim sebagai fakta
 * null-ness apa adanya, tanpa field turunan "kurang persetujuan".
 * Level `verbal` ikut populasi apa adanya (Q-DQ-5/EC-DQ-6); level dan
 * kategori tak dikenal tampil verbatim (pola `disciplinaryLevelLabel`).
 * Status karyawan tidak menyaring baris (BR-DQ-12). Baca-saja murni:
 * tanpa Prisma/aksi/izin (BR-DQ-10) — loader di
 * `disciplinary-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"
import { disciplinaryLevelLabel } from "@/lib/reports/disciplinary"

/** Judul antrean verbatim Q-DQ-2. */
export const DISCIPLINARY_QUEUE_TITLE = "Rekod Disiplin Belum Terbit"

export const DISCIPLINARY_QUEUE_STAGE_STATUSES = [
  "draft",
  "pending_approval",
] as const

export type DisciplinaryQueueStage =
  (typeof DISCIPLINARY_QUEUE_STAGE_STATUSES)[number]

/** Label tahap verbatim Q-DQ-2 — satu konstanta server, UI verbatim. */
export const DISCIPLINARY_QUEUE_STAGE_LABELS: Record<
  DisciplinaryQueueStage,
  string
> = {
  draft: "Belum Diajukan",
  pending_approval: "Menunggu Persetujuan",
}

export const DISCIPLINARY_QUEUE_TIERS = ["mengendap", "menunggu"] as const

export type DisciplinaryQueueTier =
  (typeof DISCIPLINARY_QUEUE_TIERS)[number]

/** Label tingkat verbatim keluarga antrean mengendap (Q-DQ-1). */
export const DISCIPLINARY_QUEUE_TIER_LABELS: Record<
  DisciplinaryQueueTier,
  string
> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

/** Kolom tampil yang diizinkan BR-DQ-05, verbatim. */
export const DISCIPLINARY_QUEUE_COLUMN_LABELS = {
  karyawan: "Karyawan",
  departemen: "Departemen",
  jenjang: "Jenjang",
  kategori: "Kategori",
  tanggalKejadian: "Tanggal Kejadian",
  tahap: "Tahap",
  menunggu: "Menunggu",
  tingkat: "Tingkat",
  pengaju: "Pengaju",
  persetujuan: "Persetujuan",
  dokumen: "Dokumen",
  rincian: "Rincian",
} as const

export const DISCIPLINARY_QUEUE_NOTICE_TEXT =
  "Daftar ini hanya rekod disiplin yang belum terbit. Isi kasus dan tindak lanjut tetap dari halaman rincian rekod; daftar ini tidak menampilkan isi kasus dan tidak memicu persetujuan atau penerbitan."

export const DISCIPLINARY_QUEUE_EMPTY_TEXT =
  "Tidak ada rekod disiplin yang belum terbit."

export const DISCIPLINARY_QUEUE_STAGE_EMPTY_TEXT: Record<
  DisciplinaryQueueStage,
  string
> = {
  draft: "Tidak ada rekod pada tahap ini.",
  pending_approval: "Tidak ada rekod pada tahap ini.",
}

/**
 * Ambang mengendap Q-DQ-1: satu-satunya tempat angka 3 hidup.
 * Mengendap = umur hari kalender WIB sejak `createdAt` >= angka ini.
 */
export const DISCIPLINARY_QUEUE_STALE_DAYS = 3

/**
 * Input murni satu rekod. SENGAJA tanpa isi kasus, tanpa `updatedAt`,
 * tanpa nominal/potongan apa pun (BR-DQ-04/07/09).
 */
export interface DisciplinaryQueueRecordInput {
  id: number
  employeeId: number
  employeeName: string
  departmentName: string | null
  /** Jenjang verbatim; di luar kosakata tampil apa adanya (BR-DQ-05). */
  level: string
  /** Kategori verbatim apa adanya (BR-DQ-05). */
  violationCategory: string
  violationDate: Date
  /** Status tersimpan apa adanya; hanya dua tahap populasi yang lolos. */
  workflowStatus: string
  requestedBy: number
  requesterName: string | null
  /** Fakta verbatim BR-DQ-03: terisi-atau-null apa adanya. */
  approvedBy: number | null
  /** Fakta verbatim BR-DQ-03: terisi-atau-null apa adanya. */
  secondApprovedBy: number | null
  /** Nomor dokumen verbatim bila ada (EC-DQ-8); bukan bukti terbit. */
  documentNo: string | null
  /** Rekod pembatal BR-DISC-10: terisi = bukan baris antrean. */
  voidOfId: number | null
  voidedAt: Date | null
  deletedAt: Date | null
  /** Satu-satunya acuan umur antrean (BR-DQ-07). */
  createdAt: Date
}

export interface DisciplinaryQueueRow {
  id: number
  employeeId: number
  employeeName: string
  departmentName: string | null
  level: string
  levelLabel: string | null
  violationCategory: string
  violationDate: Date
  workflowStatus: DisciplinaryQueueStage
  stageBucket: DisciplinaryQueueStage
  stageLabel: string
  tier: DisciplinaryQueueTier
  tierLabel: string
  /** Hari kalender WIB sejak `createdAt`; tidak pernah negatif. */
  umurMenungguHari: number
  requestedBy: number
  requesterName: string | null
  approvedBy: number | null
  secondApprovedBy: number | null
  documentNo: string | null
  createdAt: Date
}

export interface DisciplinaryQueue {
  rows: DisciplinaryQueueRow[]
  /** Ember tahap `draft` ("Belum Diajukan"), terpisah terhitung. */
  draft: DisciplinaryQueueRow[]
  /** Ember tahap `pending_approval` ("Menunggu Persetujuan"). */
  pendingApproval: DisciplinaryQueueRow[]
  summary: {
    draft: number
    pending_approval: number
    mengendap: number
    menunggu: number
    total: number
  }
  staleDays: number
}

export interface DisciplinaryQueueOptions {
  now?: Date
}

function isQueueStage(value: string): value is DisciplinaryQueueStage {
  return (DISCIPLINARY_QUEUE_STAGE_STATUSES as readonly string[]).includes(
    value,
  )
}

export function buildDisciplinaryQueue(
  records: readonly DisciplinaryQueueRecordInput[],
  options: DisciplinaryQueueOptions | Date = {},
): DisciplinaryQueue {
  const now = options instanceof Date ? options : (options.now ?? new Date())
  const todayDay = wibDayNumber(now)

  const rows: DisciplinaryQueueRow[] = []
  for (const record of records) {
    // BR-DQ-01: populasi persis dua tahap + tidak void/deleted/pembatal.
    if (!isQueueStage(record.workflowStatus)) continue
    if (record.voidedAt != null || record.deletedAt != null) continue
    if (record.voidOfId != null) continue

    const stage = record.workflowStatus
    // BR-DQ-07: umur dari createdAt hari kalender WIB, bukan updatedAt.
    const umurMenungguHari = Math.max(
      0,
      todayDay - wibDayNumber(record.createdAt),
    )
    // Q-DQ-1: mengendap >= 3 hari kalender WIB.
    const tier: DisciplinaryQueueTier =
      umurMenungguHari >= DISCIPLINARY_QUEUE_STALE_DAYS
        ? "mengendap"
        : "menunggu"

    rows.push({
      id: record.id,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      departmentName: record.departmentName,
      level: record.level,
      levelLabel: disciplinaryLevelLabel(record.level),
      violationCategory: record.violationCategory,
      violationDate: record.violationDate,
      workflowStatus: stage,
      stageBucket: stage,
      stageLabel: DISCIPLINARY_QUEUE_STAGE_LABELS[stage],
      tier,
      tierLabel: DISCIPLINARY_QUEUE_TIER_LABELS[tier],
      umurMenungguHari,
      requestedBy: record.requestedBy,
      requesterName: record.requesterName,
      approvedBy: record.approvedBy,
      secondApprovedBy: record.secondApprovedBy,
      documentNo: record.documentNo,
      createdAt: record.createdAt,
    })
  }

  // BR-DQ-08/Q-DQ-1: tertua dulu (createdAt naik), seri id naik.
  rows.sort((a, b) => {
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime()
    return byCreated !== 0 ? byCreated : a.id - b.id
  })

  const draft = rows.filter((r) => r.stageBucket === "draft")
  const pendingApproval = rows.filter(
    (r) => r.stageBucket === "pending_approval",
  )

  return {
    rows,
    draft,
    pendingApproval,
    summary: {
      draft: draft.length,
      pending_approval: pendingApproval.length,
      mengendap: rows.filter((r) => r.tier === "mengendap").length,
      menunggu: rows.filter((r) => r.tier === "menunggu").length,
      total: rows.length,
    },
    staleDays: DISCIPLINARY_QUEUE_STALE_DAYS,
  }
}
