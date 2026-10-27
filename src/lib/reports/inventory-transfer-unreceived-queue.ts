/**
 * F-2026-10-27-106-S (106-B+F) — antrean transfer inventaris belum
 * diterima penuh. Turunan baca-saja di atas daftar transfer dan
 * laporan Persediaan Terkirim Belum Diterima existing.
 *
 * Populasi (BR-ITQ-01): status PERSIS himpunan existing
 * `IN_TRANSIT_TRANSFER_STATUSES` dari `transfer-in-transit.ts`
 * (`processed`/`partially_received`) — diimpor, BUKAN himpunan kedua.
 * `draft`/`processing`/`receiving`/`received` keluar; status lain
 * masuk ember `Status Tidak Dikenal` tertanda: tampil apa adanya,
 * tidak dianggap di jalan, tidak dihitung ke rekap di jalan.
 *
 * PUTUSAN LEAD:
 * - Q-ITQ-1: `Mengendap` = umur di jalan >= 3 hari kalender WIB
 *   sejak `date` kirim. Peringatan >60 hari laporan in-transit
 *   adalah wilayah pemeriksaan nilai tersendiri, dinyatakan
 *   berdampingan di notice, tidak disamakan.
 * - Q-ITQ-2: kata apa adanya — ember `Belum Diterima`/
 *   `Diterima Sebagian`, tingkat `Mengendap`, kolom
 *   `Umur di Jalan`, progres `Baris Bersisa k dari n`. Satu
 *   konstanta label server di file ini; UI verbatim.
 * - Q-ITQ-4: TANPA nilai uang di payload (vonis 107-V).
 * - Q-ITQ-5: tanpa nama pemroses/penerima tahap 1 (BR-ITQ-11).
 *
 * Umur hanya dari `date` (BR-ITQ-02); `updatedAt` DILARANG sebagai
 * acuan (bergerak tiap terima sebagian) — builder tidak
 * menerimanya. Terima terakhir tampil sebagai info terlabel
 * terpisah, tidak mengganti acuan umur.
 *
 * Sisa per baris = `qty - receivedQty` terjepit 0 pola laporan
 * existing (BR-ITQ-05); payload hanya hitungan baris bersisa +
 * qty sisa per baris. Σ qty lintas baris/transfer DILARANG
 * (satuan beda) dan nilai uang DILARANG (BR-ITQ-05/08).
 *
 * Urutan (BR-ITQ-09): Mengendap dulu, lalu umur terbesar
 * (`date` tertua), seri -> `documentNo` naik. Rekap hitungan
 * transfer/baris dari populasi PENUH dalam scope sebelum
 * pemotongan batas (BR-ITQ-10: `terpotong` tertanda).
 *
 * Baca-saja (BR-ITQ-07): builder murni ini tidak memanggil aksi
 * tulis apa pun. Loader: `inventory-transfer-unreceived-queue-data.ts`.
 */

import { IN_TRANSIT_TRANSFER_STATUSES } from "@/lib/reports/transfer-in-transit"
import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Judul seksi verbatim Q-ITQ-2 — UI menempel apa adanya. */
export const INVENTORY_TRANSFER_UNRECEIVED_TITLE = "Transfer Belum Diterima Penuh"

/** Ambang Mengendap: umur di jalan >= 3 hari kalender WIB (Q-ITQ-1). */
export const INVENTORY_TRANSFER_UNRECEIVED_STALE_DAYS = 3

/** Batas ambil tampil eksplisit (BR-ITQ-10); rekap tetap populasi penuh. */
export const INVENTORY_TRANSFER_UNRECEIVED_QUEUE_LIMIT = 100

export type InventoryTransferUnreceivedBucket =
  (typeof IN_TRANSIT_TRANSFER_STATUSES)[number]

/** Label ember verbatim Q-ITQ-2 — satu konstanta server. */
export const INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS: Record<
  InventoryTransferUnreceivedBucket,
  string
> = {
  processed: "Belum Diterima",
  partially_received: "Diterima Sebagian",
}

export const INVENTORY_TRANSFER_UNRECEIVED_TIERS = ["mengendap", "di_jalan"] as const

export type InventoryTransferUnreceivedTier =
  (typeof INVENTORY_TRANSFER_UNRECEIVED_TIERS)[number]

/** Label tingkat verbatim Q-ITQ-2. */
export const INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS: Record<
  InventoryTransferUnreceivedTier,
  string
> = {
  mengendap: "Mengendap",
  di_jalan: "Di Jalan",
}

/** Label kolom verbatim Q-ITQ-2 — satu konstanta server, UI verbatim. */
export const INVENTORY_TRANSFER_UNRECEIVED_COLUMN_LABELS = {
  documentNo: "No. Dokumen",
  route: "Asal → Tujuan",
  date: "Tanggal Kirim",
  bucket: "Status Penerimaan",
  umurDiJalan: "Umur di Jalan",
  barisBersisa: "Baris Bersisa",
  terimaTerakhir: "Terima Terakhir",
} as const

export const INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL = "Status Tidak Dikenal"
export const INVENTORY_TRANSFER_NO_REMAINING_LABEL = "tanpa baris bersisa"
export const INVENTORY_TRANSFER_TRUNCATED_LABEL = "terpotong"

export const INVENTORY_TRANSFER_UNRECEIVED_NOTICE_TEXT =
  "Daftar transfer yang sudah dikirim dari gudang asal dan menunggu diterima di gudang tujuan dalam scope Anda. Tingkat Mengendap memakai umur di jalan 3 hari atau lebih sejak tanggal kirim; peringatan 60 hari pada laporan Persediaan Terkirim Belum Diterima adalah pemeriksaan nilai tersendiri dan tidak disamakan. Daftar ini baca-saja; proses, terima, dan tutup selisih dilakukan di detail transfer."

export const INVENTORY_TRANSFER_UNRECEIVED_EMPTY_TEXT =
  "Tidak ada transfer yang menunggu diterima di gudang tujuan dalam scope Anda."

/** Status dikenal di luar populasi — keluar sepenuhnya (BR-ITQ-01). Diekspor agar loader menyaring di DB (notIn), tetap menangkap status asing. */
export const KNOWN_NON_TRANSIT_TRANSFER_STATUSES = [
  "draft",
  "processing",
  "receiving",
  "received",
] as const
const KNOWN_NON_TRANSIT_STATUSES = new Set<string>(KNOWN_NON_TRANSIT_TRANSFER_STATUSES)

const TIER_RANK: Record<InventoryTransferUnreceivedTier, number> = {
  mengendap: 0,
  di_jalan: 1,
}

export interface InventoryTransferUnreceivedLineInput {
  lineId: number
  itemId: number
  qty: number
  receivedQty: number
}

export interface InventoryTransferUnreceivedInput {
  transferId: number
  slug: string | null
  documentNo: string
  /** Status tersimpan apa adanya; dikenal-non-transit keluar, asing tertanda. */
  status: string
  /** Tanggal kirim — SATU-SATUNYA acuan umur (BR-ITQ-02). */
  date: Date
  sourceWarehouseId: number
  sourceWarehouseName: string | null
  destinationWarehouseId: number
  destinationWarehouseName: string | null
  /** Baris transfer teragregat massal loader (anti-N+1). */
  lines: InventoryTransferUnreceivedLineInput[]
  /** Kejadian terima terakhir (info konteks saja, BR-ITQ-02). */
  lastReceiptAt: Date | null
}

export interface InventoryTransferRemainingLine {
  lineId: number
  itemId: number
  /** Sisa baris ini saja: `qty - receivedQty` terjepit 0 (BR-ITQ-05). */
  sisaQty: number
}

export interface InventoryTransferUnreceivedRow {
  transferId: number
  slug: string | null
  documentNo: string
  /** Status mentah tersimpan — tetap tertanda di samping label ember. */
  status: string
  bucket: InventoryTransferUnreceivedBucket
  bucketLabel: string
  date: Date
  sourceWarehouseId: number
  sourceWarehouseName: string | null
  destinationWarehouseId: number
  destinationWarehouseName: string | null
  /** Hari kalender WIB sejak `date`; masa depan dijepit 0 tertanda. */
  umurDiJalanHari: number
  umurLabel: string
  umurDariMasaDepan: boolean
  tingkat: InventoryTransferUnreceivedTier
  tingkatLabel: string
  totalBaris: number
  barisBersisa: number
  /** Label progres verbatim Q-ITQ-2: `Baris Bersisa k dari n`. */
  barisBersisaLabel: string
  /** BR-ITQ-12: status di jalan tetapi semua baris lunas. */
  tanpaBarisBersisa: boolean
  /** Qty sisa PER BARIS saja — tidak pernah dijumlah lintas baris. */
  sisaPerBaris: InventoryTransferRemainingLine[]
  /** Info konteks terlabel terpisah; bukan acuan umur. */
  terimaTerakhirAt: Date | null
  flags: string[]
}

export interface InventoryTransferUnknownStatusRow {
  transferId: number
  slug: string | null
  documentNo: string
  /** Status tersimpan apa adanya. */
  status: string
  statusLabel: string
  date: Date
  sourceWarehouseName: string | null
  destinationWarehouseName: string | null
}

export interface InventoryTransferUnreceivedRecapCell {
  transferCount: number
  barisBersisa: number
}

export type InventoryTransferUnreceivedRecap = Record<
  InventoryTransferUnreceivedBucket,
  Record<InventoryTransferUnreceivedTier, InventoryTransferUnreceivedRecapCell>
>

export interface InventoryTransferUnreceivedQueue {
  /** Baris di jalan terurut BR-ITQ-09, dipotong pada `limit`. */
  rows: InventoryTransferUnreceivedRow[]
  /** Baris status asing tertanda; tidak masuk rekap di jalan. */
  unknownStatusRows: InventoryTransferUnknownStatusRow[]
  /** Rekap populasi PENUH per ember x tingkat (sebelum potong). */
  recap: InventoryTransferUnreceivedRecap
  /** Jumlah populasi di jalan penuh sebelum potongan tampil. */
  totalTransfers: number
  /** Σ hitungan baris bersisa populasi penuh (bukan Σ qty). */
  totalBarisBersisa: number
  unknownStatusCount: number
  /** True bila baris status asing melebihi batas tampil. */
  unknownTerpotong: boolean
  /** True bila populasi penuh melebihi batas tampil (BR-ITQ-10). */
  terpotong: boolean
  limit: number
  noticeText: string
}

function emptyRecapCell(): InventoryTransferUnreceivedRecapCell {
  return { transferCount: 0, barisBersisa: 0 }
}

function emptyRecap(): InventoryTransferUnreceivedRecap {
  return {
    processed: { mengendap: emptyRecapCell(), di_jalan: emptyRecapCell() },
    partially_received: { mengendap: emptyRecapCell(), di_jalan: emptyRecapCell() },
  }
}

function isInTransitStatus(
  status: string,
): status is InventoryTransferUnreceivedBucket {
  return (IN_TRANSIT_TRANSFER_STATUSES as readonly string[]).includes(status)
}

export function buildInventoryTransferUnreceivedQueue(
  inputs: readonly InventoryTransferUnreceivedInput[],
  now: Date = new Date(),
  staleDays: number = INVENTORY_TRANSFER_UNRECEIVED_STALE_DAYS,
  limit: number = INVENTORY_TRANSFER_UNRECEIVED_QUEUE_LIMIT,
): InventoryTransferUnreceivedQueue {
  const todayNumber = wibDayNumber(now)
  const fullRows: InventoryTransferUnreceivedRow[] = []
  const unknownStatusRows: InventoryTransferUnknownStatusRow[] = []

  for (const input of inputs) {
    if (KNOWN_NON_TRANSIT_STATUSES.has(input.status)) continue

    if (!isInTransitStatus(input.status)) {
      unknownStatusRows.push({
        transferId: input.transferId,
        slug: input.slug,
        documentNo: input.documentNo,
        status: input.status,
        statusLabel: INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL,
        date: input.date,
        sourceWarehouseName: input.sourceWarehouseName,
        destinationWarehouseName: input.destinationWarehouseName,
      })
      continue
    }

    // Sisa per baris terjepit 0 (BR-ITQ-05); baris lunas keluar rincian.
    const sisaPerBaris: InventoryTransferRemainingLine[] = []
    for (const line of input.lines) {
      const sisaQty = Math.max(0, Math.round((line.qty - line.receivedQty) * 100) / 100)
      if (sisaQty <= 0) continue
      sisaPerBaris.push({ lineId: line.lineId, itemId: line.itemId, sisaQty })
    }

    const diff = todayNumber - wibDayNumber(input.date)
    const umurDiJalanHari = Math.max(0, diff)
    const tingkat: InventoryTransferUnreceivedTier =
      umurDiJalanHari >= staleDays ? "mengendap" : "di_jalan"
    const totalBaris = input.lines.length
    const barisBersisa = sisaPerBaris.length
    const tanpaBarisBersisa = barisBersisa === 0
    const flags: string[] = []
    if (tanpaBarisBersisa) flags.push(INVENTORY_TRANSFER_NO_REMAINING_LABEL)

    fullRows.push({
      transferId: input.transferId,
      slug: input.slug,
      documentNo: input.documentNo,
      status: input.status,
      bucket: input.status,
      bucketLabel: INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS[input.status],
      date: input.date,
      sourceWarehouseId: input.sourceWarehouseId,
      sourceWarehouseName: input.sourceWarehouseName,
      destinationWarehouseId: input.destinationWarehouseId,
      destinationWarehouseName: input.destinationWarehouseName,
      umurDiJalanHari,
      umurLabel: `${umurDiJalanHari} hari`,
      umurDariMasaDepan: diff < 0,
      tingkat,
      tingkatLabel: INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS[tingkat],
      totalBaris,
      barisBersisa,
      barisBersisaLabel: `Baris Bersisa ${barisBersisa} dari ${totalBaris}`,
      tanpaBarisBersisa,
      sisaPerBaris,
      terimaTerakhirAt: input.lastReceiptAt,
      flags,
    })
  }

  // BR-ITQ-09: Mengendap dulu, lalu umur terbesar (date tertua),
  // seri date sama -> documentNo naik, lalu id naik (deterministik).
  fullRows.sort((a, b) => {
    const tierDiff = TIER_RANK[a.tingkat] - TIER_RANK[b.tingkat]
    if (tierDiff !== 0) return tierDiff
    const dateDiff = a.date.getTime() - b.date.getTime()
    if (dateDiff !== 0) return dateDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo, "id-ID")
    if (docDiff !== 0) return docDiff
    return a.transferId - b.transferId
  })
  unknownStatusRows.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime()
    if (dateDiff !== 0) return dateDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo, "id-ID")
    if (docDiff !== 0) return docDiff
    return a.transferId - b.transferId
  })

  // Rekap dari POPULASI PENUH per ember x tingkat (BR-ITQ-09).
  const recap = emptyRecap()
  let totalBarisBersisa = 0
  for (const row of fullRows) {
    const cell = recap[row.bucket][row.tingkat]
    cell.transferCount += 1
    cell.barisBersisa += row.barisBersisa
    totalBarisBersisa += row.barisBersisa
  }

  const safeLimit = Math.max(0, Math.floor(limit))

  return {
    rows: fullRows.slice(0, safeLimit),
    unknownStatusRows: unknownStatusRows.slice(0, safeLimit),
    recap,
    totalTransfers: fullRows.length,
    totalBarisBersisa,
    unknownStatusCount: unknownStatusRows.length,
    unknownTerpotong: unknownStatusRows.length > safeLimit,
    terpotong: fullRows.length > safeLimit,
    limit: safeLimit,
    noticeText: INVENTORY_TRANSFER_UNRECEIVED_NOTICE_TEXT,
  }
}
