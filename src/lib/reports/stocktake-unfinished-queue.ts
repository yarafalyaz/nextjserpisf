/**
 * F-2026-10-27-090-S (090-B) — antrean sesi opname belum selesai per tahap.
 *
 * Turunan murni baca-saja dari `StocktakeSession` (BR-STQ-01..13):
 * populasi persis {draft, counting, recount, review, approved};
 * `posted` terminal dan keluar; status asing masuk ember
 * `Status Tidak Dikenal` tertanda (tidak dibuang, tidak ditebak
 * tahapnya, tidak masuk rekap tahap dikenal).
 *
 * PUTUSAN LEAD:
 * - Q-STQ-1: `Mengendap` = umur tahap >= 3 hari kalender WIB sejak
 *   acuan BR-STQ-03 (konstanta di bawah; == ambang termasuk).
 * - Q-STQ-2: kata verbatim di bawah — judul `Sesi Opname Belum
 *   Selesai`, label tahap, kolom `Umur Tahap`, progres
 *   `Baris Terhitung k dari n`. Satu konstanta label server; UI
 *   menempel apa adanya; status mentah tetap tertanda di baris.
 * - Q-STQ-5/6: payload TANPA nama pencacah/penyetuju dan TANPA
 *   kuantitas/nominal variance (BR-STQ-07/09).
 *
 * Acuan umur per tahap (BR-STQ-03): draft=`createdAt`,
 * counting/recount/review=`snapshotAt`, approved=`approvedAt`.
 * `updatedAt` DILARANG (bergerak tiap simpan hitungan) — builder
 * bahkan tidak menerimanya. Acuan primer null (warisan) jatuh ke
 * `createdAt` DAN tertanda `tanpaPenandaTahap` (BR-STQ-04).
 *
 * Progres baris (BR-STQ-08) mengikuti `finalizeCounts`: baris
 * `count1` non-null terhitung (0 sah "stok kosong"), null belum;
 * `needsRecount` = count2 null dan count1 != systemQty. Angka
 * kuantitas itu sendiri tidak pernah masuk payload baris.
 *
 * Urutan (BR-STQ-06): Mengendap dulu, lalu umur tahap terbesar,
 * seri -> id sesi naik. Status tidak dikenal sesudah baris dikenal.
 * Rekap dihitung atas populasi PENUH sebelum pemotongan batas
 * (BR-STQ-12: `terpotong` tertanda, bukan hilang diam-diam).
 *
 * Pure (tanpa Prisma/DOM). Loader: `stocktake-unfinished-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"
import { finalizeCounts } from "@/lib/inventory/stocktake-finalize"

/** Ambang Mengendap (hari kalender WIB sejak acuan tahap) — Q-STQ-1: 3. */
export const STOCKTAKE_UNFINISHED_STALE_DAYS = 3

/** Batas ambil eksplisit antrean (BR-STQ-12). */
export const STOCKTAKE_UNFINISHED_QUEUE_LIMIT = 200

export const STOCKTAKE_UNFINISHED_STATUSES = [
  "draft",
  "counting",
  "recount",
  "review",
  "approved",
] as const

export type StocktakeUnfinishedStage = (typeof STOCKTAKE_UNFINISHED_STATUSES)[number]

/** Judul seksi verbatim Q-STQ-2 — UI menempel apa adanya. */
export const STOCKTAKE_UNFINISHED_TITLE = "Sesi Opname Belum Selesai"

/** Label tahap verbatim Q-STQ-2 — satu konstanta server. */
export const STOCKTAKE_UNFINISHED_STAGE_LABELS: Record<StocktakeUnfinishedStage, string> = {
  draft: "Draft",
  counting: "Sedang Dihitung",
  recount: "Hitung Ulang",
  review: "Menunggu Persetujuan",
  approved: "Siap Diposting",
}

/** Label ember status asing verbatim BR-STQ-01. */
export const STOCKTAKE_UNFINISHED_UNKNOWN_STAGE_LABEL = "Status Tidak Dikenal"

export const STOCKTAKE_UNFINISHED_LEVELS = ["mengendap", "menunggu"] as const

export type StocktakeUnfinishedLevel = (typeof STOCKTAKE_UNFINISHED_LEVELS)[number]

/** Label tingkat verbatim Q-STQ-2. */
export const STOCKTAKE_UNFINISHED_LEVEL_LABELS: Record<StocktakeUnfinishedLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

/** Judul kolom verbatim Q-STQ-2. */
export const STOCKTAKE_UNFINISHED_COLUMN_LABELS = {
  document: "Dokumen",
  warehouse: "Gudang",
  stage: "Tahap",
  stageAge: "Umur Tahap",
  progress: "Progres Hitung",
} as const

/** Tanda baris verbatim BR-STQ-04/13. */
export const STOCKTAKE_UNFINISHED_NO_LINES_LABEL = "tanpa baris"
export const STOCKTAKE_UNFINISHED_NO_STAGE_MARKER_LABEL = "tanpa penanda tahap"
export const STOCKTAKE_UNFINISHED_TRUNCATED_LABEL = "terpotong"

/** Notice kepala — UI menempel apa adanya. */
export const STOCKTAKE_UNFINISHED_NOTICE_TEXT =
  "Daftar ini hanya sesi opname yang belum selesai, per tahap dan umur tahapnya. Sesi yang sudah diposting tidak tampil di sini; tindak lanjut sesi lewat detail sesi existing."

export interface StocktakeUnfinishedLineInput {
  systemQty: number
  count1: number | null
  count2: number | null
}

export interface StocktakeUnfinishedInput {
  sessionId: number
  slug: string | null
  documentNo: string
  /** Status tersimpan apa adanya; `posted` keluar, asing ke ember. */
  status: string
  warehouseId: number
  warehouseCode: string | null
  warehouseName: string | null
  date: Date
  createdAt: Date
  snapshotAt: Date | null
  approvedAt: Date | null
  /** Baris sesi teragregat massal loader; tidak masuk payload baris. */
  lines: StocktakeUnfinishedLineInput[]
}

export interface StocktakeUnfinishedRow {
  sessionId: number
  slug: string | null
  documentNo: string
  /** Status mentah tersimpan — tetap tertanda di samping label tahap. */
  status: string
  warehouseId: number
  warehouseCode: string | null
  warehouseName: string | null
  date: Date
  createdAt: Date
  /** Tahap dikenal; null hanya untuk status tidak dikenal. */
  tahap: StocktakeUnfinishedStage | null
  tahapLabel: string
  statusTidakDikenal: boolean
  /** Tanggal acuan umur tahap (BR-STQ-03/04); null untuk status asing. */
  acuanTahap: Date | null
  /** Acuan primer null dan umur memakai cadangan `createdAt`. */
  tanpaPenandaTahap: boolean
  /** Hari kalender WIB sejak acuan; null untuk status asing. */
  umurTahapHari: number | null
  umurDariMasaDepan: boolean
  tingkat: StocktakeUnfinishedLevel | null
  tingkatLabel: string | null
  totalBaris: number
  barisTerhitung: number
  barisPerluHitungUlang: number
  tanpaBaris: boolean
  /** Label progres verbatim Q-STQ-2: `Baris Terhitung k dari n`. */
  progresLabel: string
}

export interface StocktakeUnfinishedQueue {
  rows: StocktakeUnfinishedRow[]
  /** Σ sesi per tahap dikenal atas populasi penuh (sebelum potong). */
  stageCounts: Record<StocktakeUnfinishedStage, number>
  levelCounts: Record<StocktakeUnfinishedLevel, number>
  unknownCount: number
  /** Total populasi belum-selesai (dikenal + asing, tanpa posted). */
  totalSessions: number
  terpotong: boolean
  truncated: boolean
}

function isKnownStage(status: string): status is StocktakeUnfinishedStage {
  return (STOCKTAKE_UNFINISHED_STATUSES as readonly string[]).includes(status)
}

function stageReference(input: StocktakeUnfinishedInput): { acuan: Date; tanpaPenanda: boolean } {
  if (input.status === "approved") {
    return input.approvedAt != null
      ? { acuan: input.approvedAt, tanpaPenanda: false }
      : { acuan: input.createdAt, tanpaPenanda: true }
  }
  if (input.status === "draft") return { acuan: input.createdAt, tanpaPenanda: false }
  // counting / recount / review: snapshot dikunci sekali (BR-STQ-03).
  return input.snapshotAt != null
    ? { acuan: input.snapshotAt, tanpaPenanda: false }
    : { acuan: input.createdAt, tanpaPenanda: true }
}

export function buildStocktakeUnfinishedQueue(
  inputs: StocktakeUnfinishedInput[],
  now: Date = new Date(),
  staleDays: number = STOCKTAKE_UNFINISHED_STALE_DAYS,
  limit: number = STOCKTAKE_UNFINISHED_QUEUE_LIMIT,
): StocktakeUnfinishedQueue {
  const todayNumber = wibDayNumber(now)
  const rows: StocktakeUnfinishedRow[] = []

  for (const input of inputs) {
    if (input.status === "posted") continue

    const finals = finalizeCounts(
      input.lines.map((l) => ({ itemId: 0, systemQty: l.systemQty, count1: l.count1, count2: l.count2 })),
    )
    const totalBaris = input.lines.length
    const barisTerhitung = input.lines.filter((l) => l.count1 != null).length
    const barisPerluHitungUlang = finals.filter((f) => f.needsRecount).length
    const progresLabel = `Baris Terhitung ${barisTerhitung} dari ${totalBaris}`

    if (!isKnownStage(input.status)) {
      rows.push({
        sessionId: input.sessionId,
        slug: input.slug,
        documentNo: input.documentNo,
        status: input.status,
        warehouseId: input.warehouseId,
        warehouseCode: input.warehouseCode,
        warehouseName: input.warehouseName,
        date: input.date,
        createdAt: input.createdAt,
        tahap: null,
        tahapLabel: STOCKTAKE_UNFINISHED_UNKNOWN_STAGE_LABEL,
        statusTidakDikenal: true,
        acuanTahap: null,
        tanpaPenandaTahap: false,
        umurTahapHari: null,
        umurDariMasaDepan: false,
        tingkat: null,
        tingkatLabel: null,
        totalBaris,
        barisTerhitung,
        barisPerluHitungUlang,
        tanpaBaris: totalBaris === 0,
        progresLabel,
      })
      continue
    }

    const { acuan, tanpaPenanda } = stageReference(input)
    const diff = todayNumber - wibDayNumber(acuan)
    const umurTahapHari = Math.max(0, diff)
    const tingkat: StocktakeUnfinishedLevel = umurTahapHari >= staleDays ? "mengendap" : "menunggu"
    rows.push({
      sessionId: input.sessionId,
      slug: input.slug,
      documentNo: input.documentNo,
      status: input.status,
      warehouseId: input.warehouseId,
      warehouseCode: input.warehouseCode,
      warehouseName: input.warehouseName,
      date: input.date,
      createdAt: input.createdAt,
      tahap: input.status,
      tahapLabel: STOCKTAKE_UNFINISHED_STAGE_LABELS[input.status],
      statusTidakDikenal: false,
      acuanTahap: acuan,
      tanpaPenandaTahap: tanpaPenanda,
      umurTahapHari,
      umurDariMasaDepan: diff < 0,
      tingkat,
      tingkatLabel: STOCKTAKE_UNFINISHED_LEVEL_LABELS[tingkat],
      totalBaris,
      barisTerhitung,
      barisPerluHitungUlang,
      tanpaBaris: totalBaris === 0,
      progresLabel,
    })
  }

  const LEVEL_ORDER: Record<StocktakeUnfinishedLevel, number> = { mengendap: 0, menunggu: 1 }
  rows.sort((a, b) => {
    const aOrder = a.tingkat == null ? 2 : LEVEL_ORDER[a.tingkat]
    const bOrder = b.tingkat == null ? 2 : LEVEL_ORDER[b.tingkat]
    if (aOrder !== bOrder) return aOrder - bOrder
    const ageDiff = (b.umurTahapHari ?? -1) - (a.umurTahapHari ?? -1)
    if (ageDiff !== 0) return ageDiff
    return a.sessionId - b.sessionId
  })

  const stageCounts: Record<StocktakeUnfinishedStage, number> = {
    draft: 0, counting: 0, recount: 0, review: 0, approved: 0,
  }
  const levelCounts: Record<StocktakeUnfinishedLevel, number> = { mengendap: 0, menunggu: 0 }
  let unknownCount = 0
  for (const row of rows) {
    if (row.tahap != null) stageCounts[row.tahap] += 1
    else unknownCount += 1
    if (row.tingkat != null) levelCounts[row.tingkat] += 1
  }

  const terpotong = rows.length > limit
  return {
    rows: terpotong ? rows.slice(0, limit) : rows,
    stageCounts,
    levelCounts,
    unknownCount,
    totalSessions: rows.length,
    terpotong,
    truncated: terpotong,
  }
}
