/**
 * Stok nomor seri/batch per gudang — posisi setiap nomor seri dan batch yang
 * masih tercatat, dikelompokkan per gudang, beserta sisa umurnya.
 *
 * Dua hal yang dibuat terang-terangan supaya laporan tidak menyesatkan:
 *
 * - **Kuantitas tidak dijumlahkan.** Satu baris nomor seri = satu unit, satu
 *   baris batch = sekian unit dengan satuan barangnya masing-masing; menjumlah
 *   pcs + liter + set tidak berarti apa-apa. Yang dihitung adalah banyaknya
 *   baris, kedaluwarsa, dan yang segera kedaluwarsa.
 * - **Kosong itu bisa dua hal.** Tidak ada catatan bisa berarti pelacakan
 *   memang tidak dipakai, atau pelacakan aktif tetapi belum pernah ada nomor
 *   seri/batch yang dicatat. Keduanya dibedakan, bukan disamakan menjadi
 *   "aman/kosong".
 *
 * Sisa umur dihitung terhadap tanggal acuan (`asOf`) yang sama dengan yang
 * ditampilkan halaman, sehingga angkanya tidak berubah diam-diam karena jam.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatDate, formatQuantity } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Label status nomor seri yang belum ada di peta status umum. */
const SERIAL_STATUS_LABELS: Record<string, string> = {
  available: "Tersedia",
  reserved: "Ditahan",
  sold: "Terjual",
  damaged: "Rusak",
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Ambang "segera kedaluwarsa" — sama untuk laporan maupun KPI. */
const EXPIRING_SOON_DAYS = 30

/** Lebar kolom (mm) — jumlahnya 266mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Barang", align: "left", width: 78 },
  { header: "Tipe", align: "left", width: 26 },
  { header: "Nomor", align: "left", width: 52 },
  { header: "Status", align: "left", width: 30 },
  { header: "Jml", align: "right", width: 20 },
  { header: "Kedaluwarsa", align: "left", width: 32 },
  { header: "Sisa Umur (hari)", align: "right", width: 28 },
]

export interface SerialBatchInput {
  kind: "serial" | "batch"
  itemSku: string
  itemName: string
  /** Identitas gudang; nama BUKAN identitas unik (Warehouse.name tak unik). */
  warehouseId?: number | null
  warehouseName: string
  /** Nomor seri atau nomor batch. */
  code: string
  /** Status nomor seri; batch tidak punya status sendiri. */
  status: string | null
  /** 1 untuk nomor seri, kuantitas batch untuk batch. */
  qty: number
  manufacturingDate: Date | null
  expiryDate: Date | null
  /** `Item.cost` kini — hanya untuk estimasi nilai antrean FEFO. */
  unitCost?: number
}

export interface SerialBatchTotals {
  serials: number
  batches: number
  /** Sudah lewat tanggal kedaluwarsa pada tanggal acuan. */
  expired: number
  /** Kedaluwarsa dalam ≤30 hari ke depan. */
  expiringSoon: number
  /** Batch tanpa tanggal kedaluwarsa. */
  noExpiry: number
}

export interface SerialBatchResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: SerialBatchTotals
  /** Barang aktif yang mengaktifkan pelacakan seri/batch — pembeda arti kosong. */
  trackedItems: number
  verdict: string
}

function quantity(value: number): string {
  return formatQuantity(value)
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

function serialStatusLabel(status: string | null): string {
  if (!status) return "–"
  return SERIAL_STATUS_LABELS[status] ?? statusLabel(status)
}

/** Sisa hari sampai kedaluwarsa; negatif = sudah lewat. `null` bila tanpa tanggal. */
export function daysUntilExpiry(expiryDate: Date | null, asOf: Date): number | null {
  if (!expiryDate) return null
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()
  const end = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate(),
  ).getTime()
  return Math.round((end - start) / DAY_MS)
}

export function buildSerialBatchStock(input: {
  records: SerialBatchInput[]
  asOf: Date
  trackedItems: number
}): SerialBatchResult {
  const { records, asOf, trackedItems } = input

  const totals: SerialBatchTotals = {
    serials: records.filter((record) => record.kind === "serial").length,
    batches: records.filter((record) => record.kind === "batch").length,
    expired: 0,
    expiringSoon: 0,
    noExpiry: 0,
  }

  for (const record of records) {
    const days = daysUntilExpiry(record.expiryDate, asOf)
    if (days === null) {
      if (record.kind === "batch") totals.noExpiry += 1
      continue
    }
    if (days < 0) totals.expired += 1
    else if (days <= EXPIRING_SOON_DAYS) totals.expiringSoon += 1
  }

  // Kelompokkan per gudang (identitas id; fallback nama untuk input tanpa
  // id); di dalamnya urut nama barang lalu nomor. Dua gudang berbeda
  // bernama sama tidak boleh tergabung (putaran 52).
  const byWarehouse = new Map<string, { name: string; records: SerialBatchInput[] }>()
  for (const record of records) {
    const key = record.warehouseId != null ? `id:${record.warehouseId}` : `name:${record.warehouseName}`
    const bucket = byWarehouse.get(key) ?? { name: record.warehouseName, records: [] }
    bucket.records.push(record)
    byWarehouse.set(key, bucket)
  }

  const rows: TableRow[] = []

  for (const group of [...byWarehouse.values()].sort((a, b) => a.name.localeCompare(b.name, "id-ID"))) {
    const warehouseName = group.name
    const items = group.records.sort((a, b) => {
      const byItem = `${a.itemSku} ${a.itemName}`.localeCompare(`${b.itemSku} ${b.itemName}`, "id-ID")
      return byItem !== 0 ? byItem : a.code.localeCompare(b.code, "id-ID")
    })

    rows.push({ kind: "group", label: `Gudang: ${warehouseName} (${items.length})` })

    for (const record of items) {
      const days = daysUntilExpiry(record.expiryDate, asOf)

      const expiryText =
        record.expiryDate === null
          ? "–"
          : record.kind === "batch" && days !== null && days < 0
            ? `${shortDate(record.expiryDate)} (lewat)`
            : shortDate(record.expiryDate)

      rows.push({
        kind: "data",
        cells: [
          `${record.itemSku} ${record.itemName}`,
          record.kind === "serial" ? "Nomor Seri" : "Batch",
          record.code,
          record.kind === "serial" ? serialStatusLabel(record.status) : "–",
          quantity(record.qty),
          expiryText,
          days === null ? "–" : quantity(days),
        ],
      })
    }
  }

  if (records.length === 0) {
    rows.push({
      kind: "notice",
      text:
        trackedItems > 0
          ? `Ada ${trackedItems} barang yang mengaktifkan pelacakan nomor seri/batch, tetapi belum ada ` +
            "nomor seri atau batch yang tercatat. Kosong di sini berarti belum ada catatan, bukan berarti " +
            "pelacakan tidak dipakai."
          : "Belum ada barang yang mengaktifkan pelacakan nomor seri/batch (centang \"Lacak Nomor Seri\" " +
            "atau \"Lacak Batch\" pada master barang), jadi laporan ini belum bisa menilai apa pun.",
    })
  } else {
    if (totals.expired > 0 || totals.expiringSoon > 0) {
      rows.push({
        kind: "notice",
        text:
          `${totals.expired} baris sudah lewat tanggal kedaluwarsanya` +
          `${totals.expiringSoon > 0 ? ` dan ${totals.expiringSoon} baris kedaluwarsa dalam ${EXPIRING_SOON_DAYS} hari ke depan` : ""}` +
          `. Tanggal acuan: ${shortDate(asOf)}.`,
      })
    }
    if (totals.noExpiry > 0) {
      rows.push({
        kind: "notice",
        text: `${totals.noExpiry} batch tidak punya tanggal kedaluwarsa, sehingga tidak masuk hitungan sisa umur.`,
      })
    }
    rows.push({
      kind: "notice",
      text:
        "Kuantitas TIDAK dijumlahkan lintas barang/satuan — kolom Jml hanya menyatakan isi tiap baris. " +
        "Nomor seri bernilai 1 unit per baris.",
    })
  }

  const verdict =
    records.length === 0
      ? trackedItems > 0
        ? "Pelacakan aktif, tetapi belum ada catatan"
        : "Belum ada barang yang melacak nomor seri/batch"
      : `${totals.serials} nomor seri · ${totals.batches} batch · ${totals.expired} kedaluwarsa · ` +
        `${totals.expiringSoon} segera kedaluwarsa`

  return { table: { columns: COLUMNS, rows }, totals, trackedItems, verdict }
}

export interface ExpiryActionLine {
  itemSku: string
  itemName: string
  warehouseName: string
  code: string
  qty: number
  expiryDate: Date
  daysToExpiry: number
  bucket: "kedaluwarsa" | "segera_kedaluwarsa"
  /** qty × Item.cost kini — estimasi, bukan nilai buku FIFO. */
  estimatedValue: number
}

export interface ExpiryActionQueue {
  lines: ExpiryActionLine[]
  totals: {
    expiredLines: number
    expiringSoonLines: number
    expiredEstimatedValue: number
    expiringSoonEstimatedValue: number
  }
}

/**
 * Antrean aksi FEFO: batch yang sudah kedaluwarsa atau kedaluwarsa dalam
 * ≤30 hari, diurutkan kedaluwarsa paling awal dulu (yang harus keluar /
 * ditindak lebih dulu). Hanya batch — nomor seri tidak punya tanggal
 * kedaluwarsa di schema. Nilai per baris = qty × `Item.cost` saat ini dan
 * WAJIB dilabeli estimasi di tampilan: itu bukan nilai buku lapisan FIFO.
 */
export function buildExpiryActionQueue(
  records: readonly SerialBatchInput[],
  asOf: Date,
): ExpiryActionQueue {
  const lines: ExpiryActionLine[] = []
  for (const record of records) {
    if (record.kind !== "batch" || record.expiryDate === null) continue
    const days = daysUntilExpiry(record.expiryDate, asOf)
    if (days === null || days > EXPIRING_SOON_DAYS) continue
    lines.push({
      itemSku: record.itemSku,
      itemName: record.itemName,
      warehouseName: record.warehouseName,
      code: record.code,
      qty: record.qty,
      expiryDate: record.expiryDate,
      daysToExpiry: days,
      bucket: days < 0 ? "kedaluwarsa" : "segera_kedaluwarsa",
      estimatedValue: record.qty * (record.unitCost ?? 0),
    })
  }
  lines.sort(
    (a, b) =>
      a.daysToExpiry - b.daysToExpiry ||
      `${a.itemSku} ${a.itemName}`.localeCompare(`${b.itemSku} ${b.itemName}`, "id-ID"),
  )
  return {
    lines,
    totals: {
      expiredLines: lines.filter((line) => line.bucket === "kedaluwarsa").length,
      expiringSoonLines: lines.filter((line) => line.bucket === "segera_kedaluwarsa").length,
      expiredEstimatedValue: lines
        .filter((line) => line.bucket === "kedaluwarsa")
        .reduce((sum, line) => sum + line.estimatedValue, 0),
      expiringSoonEstimatedValue: lines
        .filter((line) => line.bucket === "segera_kedaluwarsa")
        .reduce((sum, line) => sum + line.estimatedValue, 0),
    },
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function serialBatchSummary(result: SerialBatchResult): string {
  if (result.totals.serials === 0 && result.totals.batches === 0) {
    return result.trackedItems > 0
      ? "Pelacakan aktif, belum ada nomor seri/batch tercatat"
      : "Belum ada barang yang melacak nomor seri/batch"
  }
  const parts = [`${result.totals.serials} nomor seri`, `${result.totals.batches} batch`]
  if (result.totals.expired > 0) parts.push(`${result.totals.expired} kedaluwarsa`)
  if (result.totals.expiringSoon > 0) parts.push(`${result.totals.expiringSoon} segera kedaluwarsa`)
  return parts.join(" · ")
}
