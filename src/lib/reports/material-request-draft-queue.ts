/**
 * F-2026-10-26-071-S tahap 1 — antrean permintaan material draft
 * mengendap belum diajukan.
 *
 * Turunan murni baca-saja: populasi MaterialRequest `status = "draft"`
 * persis dalam scope gudang pembaca (BR-MRQ-01). Permintaan draft belum
 * diajukan = belum persetujuan, belum transfer, belum stok bergerak
 * (BR-MRQ-02); payload TANPA nilai uang — hanya hitungan baris + Σ qty
 * item tersimpan apa adanya (BR-MRQ-05, permintaan bukan dokumen nilai).
 *
 * PUTUSAN LEAD Q-MRQ-1/2/4 (backlog origin/main, 26 Okt 2026 19:10 WIB):
 * - Q-MRQ-1: ambang `mengendap` = umur >= 3 hari kalender WIB sejak
 *   `createdAt`; == ambang termasuk mengendap (konstanta di bawah).
 * - Q-MRQ-2: label/notice/kolom verbatim §1 spec — satu konstanta label
 *   server; UI menempel apa adanya. Penanda neededBy lampau memakai
 *   kata "Lewat Tanggal Dibutuhkan"; kata "Terlambat" DILARANG untuk
 *   dokumen belum diajukan (BR-MRQ-07).
 * - Q-MRQ-4: scope KEDUA sisi — baris masuk bila requesterWarehouseId
 *   ATAU sourceWarehouseId dalam `getWarehouseScope` pembaca; `none` →
 *   kosong fail-closed (ditegakkan loader sebelum query).
 * - Q-MRQ-5 tertanam: urutan mengendap dulu lalu umur tertua, seri
 *   documentNo asc; acuan umur `createdAt` (BR-MRQ-06).
 * - Q-MRQ-6 tertanam: neededByLampau penanda pendamping terpisah,
 *   BUKAN tingkat dan TIDAK memperluas `isOverdue` existing ke draft.
 *
 * Pure (tanpa Prisma/DOM). Loader: `material-request-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-MRQ-1: 3). */
export const MATERIAL_REQUEST_DRAFT_STALE_DAYS = 3

export const MATERIAL_REQUEST_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type MaterialRequestDraftLevel = (typeof MATERIAL_REQUEST_DRAFT_LEVELS)[number]

/** Label tingkat verbatim Q-MRQ-2 — UI menempel apa adanya. */
export const MATERIAL_REQUEST_DRAFT_LEVEL_LABELS: Record<MaterialRequestDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Diajukan",
}

/** Judul kolom verbatim Q-MRQ-2. */
export const MATERIAL_REQUEST_DRAFT_COLUMN_LABELS = {
  documentNo: "No. Dokumen",
  requesterWarehouse: "Gudang Tujuan",
  sourceWarehouse: "Gudang Sumber",
  workOrder: "Perintah Kerja",
  neededBy: "Dibutuhkan",
  age: "Menunggu",
  createdBy: "Dibuat Oleh",
} as const

/** Penanda neededBy lampau verbatim Q-MRQ-2 — BUKAN kata Terlambat (BR-MRQ-07). */
export const MATERIAL_REQUEST_DRAFT_OVERDUE_NEEDED_BY_LABEL = "Lewat Tanggal Dibutuhkan"

/** Notice verbatim Q-MRQ-2 — UI menempel apa adanya. */
export const MATERIAL_REQUEST_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya permintaan material yang masih draft dan belum diajukan. Permintaan draft belum disetujui dan belum memindahkan stok; ajukan, ubah, atau hapus lewat detail permintaan."

const MS_PER_DAY = 86_400_000

export interface MaterialRequestDraftInput {
  materialRequestId: number
  slug: string | null
  documentNo: string
  /** Status MaterialRequest apa adanya; builder hanya menerima persis "draft". */
  status: string
  requesterWarehouseId: number
  requesterWarehouseName: string
  sourceWarehouseId: number
  sourceWarehouseName: string
  /** WorkOrder tertaut; null tampil `—` (BR-MRQ-09). */
  workOrderId: number | null
  workOrderDocumentNo: string | null
  /** Tanggal dibutuhkan tersimpan; null = tidak tertanda (BR-MRQ-07). */
  neededBy: Date | null
  /** MaterialRequest.createdBy = User.id; nama diselesaikan loader massal. */
  createdByName: string | null
  createdAt: Date
  /** Jumlah baris item tersimpan (0 sah, EC-MRQ-6). */
  itemCount: number
  /** Σ qty item tersimpan apa adanya — BUKAN sisa kebutuhan (BR-MRQ-05). */
  totalQty: number
}

export interface MaterialRequestDraftRow extends MaterialRequestDraftInput {
  tingkat: MaterialRequestDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 (EC-MRQ-4). */
  umurDraftHari: number
  /** createdAt sesudah hari laporan (jam server) — umur ditahan 0. */
  umurDariMasaDepan: boolean
  /** neededBy lampau = fakta tanggal; TIDAK mengubah tingkat (BR-MRQ-07). */
  neededByLampau: boolean
  /** Label penanda bila neededByLampau, selain itu null. */
  neededByLampauLabel: string | null
}

export interface MaterialRequestDraftWarehouseCount {
  warehouseId: number
  warehouseName: string
  levelCounts: Record<MaterialRequestDraftLevel, number>
  total: number
}

export interface MaterialRequestDraftQueue {
  rows: MaterialRequestDraftRow[]
  /** Hitungan per tingkat atas baris tampil. */
  levelCounts: Record<MaterialRequestDraftLevel, number>
  /** Hitungan permintaan per gudang tujuan atas baris tampil yang sama. */
  requesterWarehouseCounts: MaterialRequestDraftWarehouseCount[]
  /** Hitungan permintaan per gudang sumber atas baris tampil yang sama. */
  sourceWarehouseCounts: MaterialRequestDraftWarehouseCount[]
  totalDocuments: number
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function deriveMaterialRequestDraftAge(
  createdAt: Date,
  todayUtcMidnight: Date,
): { umurDraftHari: number; umurDariMasaDepan: boolean } {
  const createdDay = wibCalendarDay(createdAt)
  const diff = Math.round((todayUtcMidnight.getTime() - createdDay.getTime()) / MS_PER_DAY)
  return { umurDraftHari: Math.max(0, diff), umurDariMasaDepan: diff < 0 }
}

/** neededBy lampau = hari kalender WIB hari ini sesudah hari neededBy. */
export function deriveMaterialRequestNeededByLampau(
  neededBy: Date | null,
  todayUtcMidnight: Date,
): boolean {
  if (neededBy === null) return false
  return wibCalendarDay(neededBy).getTime() < todayUtcMidnight.getTime()
}

function addWarehouseCount(
  map: Map<number, MaterialRequestDraftWarehouseCount>,
  warehouseId: number,
  warehouseName: string,
  tingkat: MaterialRequestDraftLevel,
): void {
  let entry = map.get(warehouseId)
  if (!entry) {
    entry = {
      warehouseId,
      warehouseName,
      levelCounts: { mengendap: 0, menunggu: 0 },
      total: 0,
    }
    map.set(warehouseId, entry)
  }
  entry.levelCounts[tingkat] += 1
  entry.total += 1
}

export function buildMaterialRequestDraftQueue(
  inputs: MaterialRequestDraftInput[],
  now: Date = new Date(),
  staleDays: number = MATERIAL_REQUEST_DRAFT_STALE_DAYS,
): MaterialRequestDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: MaterialRequestDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    const { umurDraftHari, umurDariMasaDepan } = deriveMaterialRequestDraftAge(
      input.createdAt,
      today,
    )
    const tingkat: MaterialRequestDraftLevel =
      umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    const neededByLampau = deriveMaterialRequestNeededByLampau(input.neededBy, today)
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: MATERIAL_REQUEST_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan,
      neededByLampau,
      neededByLampauLabel: neededByLampau
        ? MATERIAL_REQUEST_DRAFT_OVERDUE_NEEDED_BY_LABEL
        : null,
    })
  }

  const LEVEL_ORDER: Record<MaterialRequestDraftLevel, number> = {
    mengendap: 0,
    menunggu: 1,
  }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    // Dalam tingkat: umur tertua dulu = createdAt menaik.
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.materialRequestId - b.materialRequestId
  })

  const levelCounts: Record<MaterialRequestDraftLevel, number> = {
    mengendap: 0,
    menunggu: 0,
  }
  const requesterMap = new Map<number, MaterialRequestDraftWarehouseCount>()
  const sourceMap = new Map<number, MaterialRequestDraftWarehouseCount>()
  for (const row of rows) {
    levelCounts[row.tingkat] += 1
    addWarehouseCount(
      requesterMap,
      row.requesterWarehouseId,
      row.requesterWarehouseName,
      row.tingkat,
    )
    addWarehouseCount(sourceMap, row.sourceWarehouseId, row.sourceWarehouseName, row.tingkat)
  }

  const byWarehouse = (
    a: MaterialRequestDraftWarehouseCount,
    b: MaterialRequestDraftWarehouseCount,
  ) => a.warehouseName.localeCompare(b.warehouseName) || a.warehouseId - b.warehouseId

  return {
    rows,
    levelCounts,
    requesterWarehouseCounts: [...requesterMap.values()].sort(byWarehouse),
    sourceWarehouseCounts: [...sourceMap.values()].sort(byWarehouse),
    totalDocuments: rows.length,
  }
}
