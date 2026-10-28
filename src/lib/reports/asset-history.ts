/**
 * Histori aset tetap — satu garis waktu per aset: perolehan, penyusutan,
 * pelepasan, dan perpindahan lokasi/penanggung jawab.
 *
 * Menyatukan dua sumber yang sudah ada tetapi belum pernah dibaca bersama:
 * `AssetHistory` (penyusutan & pelepasan) dan `AssetTransfer` (lokasi/karyawan).
 * Accurate memisahkannya menjadi tiga laporan (Histori Aset, Histori Perubahan
 * Aset, Histori Lokasi Aset); di sini satu halaman dengan blok per aset, karena
 * memisahkannya justru menyembunyikan hubungan sebab-akibat — aset berpindah
 * lokasi pada hari yang sama saat disusutkan/disposal adalah satu kejadian.
 *
 * Perolehan tidak punya baris di `AssetHistory` (tidak ada kode yang menulisnya),
 * jadi barisnya dibentuk dari `Asset.purchaseDate` + `purchaseCost` — bukan
 * dikarang, tetapi memang satu-satunya tempat datanya tersimpan.
 *
 * Pure (tanpa Prisma/DOM) supaya penggabungan dan penyusunan periode bisa diuji.
 */

import { formatAccounting, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 30 },
  { header: "Jenis", align: "left", width: 28 },
  { header: "Keterangan", align: "left", width: 152 },
  { header: "Nilai", align: "right", width: 57 },
]

/** Sel kosong untuk baris yang tidak membawa nilai (mis. perpindahan). */
const EMPTY = "–"

export const ASSET_HISTORY_TYPES = {
  DEPRECIATION: "depreciation",
  DISPOSAL: "disposal",
} as const

export interface AssetHistoryAssetInput {
  id: number
  code: string
  name: string
  categoryName: string | null
  location: string | null
  purchaseDate: Date | null
  purchaseCost: number
}

export interface AssetHistoryEventInput {
  assetId: number
  /** Nilai `AssetHistory.type`: "depreciation" | "disposal". */
  type: string
  description: string | null
  amount: number
  date: Date
}

export interface AssetTransferEventInput {
  assetId: number
  fromLocation: string | null
  toLocation: string
  fromEmployeeName: string | null
  toEmployeeName: string | null
  date: Date
}

export interface AssetHistoryTotals {
  acquisition: number
  depreciation: number
  disposal: number
  transfers: number
}

export interface AssetHistoryResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: AssetHistoryTotals
  /** Jumlah aset yang punya pergerakan pada periode ini. */
  assetCount: number
  eventCount: number
}

interface TimelineEvent {
  date: Date
  kind: string
  description: string
  amount: number | null
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

function kindOfHistoryType(type: string): string {
  if (type === ASSET_HISTORY_TYPES.DISPOSAL) return "Pelepasan"
  if (type === ASSET_HISTORY_TYPES.DEPRECIATION) return "Penyusutan"
  // Jenis lain ditampilkan apa adanya (mis. "revaluation" bila ditambah kelak) —
  // lebih baik muncul dengan label jujur daripada diberi label yang salah.
  return type
}

/**
 * Garis waktu aset untuk periode [start, end]. Aset tanpa pergerakan pada periode
 * itu tidak ditampilkan, supaya laporan tetap terbaca pada perusahaan dengan
 * ratusan aset diam.
 */
export function buildAssetHistory(input: {
  assets: AssetHistoryAssetInput[]
  history: AssetHistoryEventInput[]
  transfers: AssetTransferEventInput[]
  start: Date
  end: Date
}): AssetHistoryResult {
  const { assets, history, transfers, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const byAsset = new Map<number, TimelineEvent[]>()

  for (const asset of assets) {
    const events: TimelineEvent[] = []

    if (asset.purchaseDate && inPeriod(asset.purchaseDate)) {
      events.push({
        date: asset.purchaseDate,
        kind: "Perolehan",
        description: `Perolehan aset${asset.location ? ` — lokasi ${asset.location}` : ""}`,
        amount: asset.purchaseCost,
      })
    }

    byAsset.set(asset.id, events)
  }

  for (const event of history) {
    if (!inPeriod(event.date)) continue
    const events = byAsset.get(event.assetId)
    if (!events) continue
    const kind = kindOfHistoryType(event.type)
    // Penyusutan dan pelepasan mengurangi nilai buku, jadi ditampilkan negatif.
    const signed = kind === "Perolehan" ? event.amount : -Math.abs(event.amount)
    events.push({
      date: event.date,
      kind,
      description: event.description ?? `${kind} aset`,
      amount: signed,
    })
  }

  for (const transfer of transfers) {
    if (!inPeriod(transfer.date)) continue
    const events = byAsset.get(transfer.assetId)
    if (!events) continue
    const route = transfer.fromLocation
      ? `${transfer.fromLocation} → ${transfer.toLocation}`
      : `→ ${transfer.toLocation}`
    const employee =
      transfer.fromEmployeeName || transfer.toEmployeeName
        ? ` · penanggung jawab ${transfer.fromEmployeeName ?? "–"} → ${transfer.toEmployeeName ?? "–"}`
        : ""
    events.push({
      date: transfer.date,
      kind: "Pindah Lokasi",
      description: `${route}${employee}`,
      amount: null,
    })
  }

  const rows: TableRow[] = []
  const totals: AssetHistoryTotals = { acquisition: 0, depreciation: 0, disposal: 0, transfers: 0 }
  let eventCount = 0
  let assetCount = 0

  const sortedAssets = [...assets].sort((a, b) => a.code.localeCompare(b.code, "id-ID", { numeric: true }))

  for (const asset of sortedAssets) {
    const events = byAsset.get(asset.id) ?? []
    if (events.length === 0) continue

    assetCount += 1
    eventCount += events.length

    rows.push({
      kind: "group",
      label: `${asset.code} ${asset.name}${asset.categoryName ? ` · ${asset.categoryName}` : ""}`,
    })

    // Terbaru di atas: riwayat aset dibaca untuk menjawab "apa yang terakhir terjadi".
    for (const event of [...events].sort((a, b) => b.date.getTime() - a.date.getTime())) {
      if (event.kind === "Perolehan") totals.acquisition = safeAdd(totals.acquisition, event.amount ?? 0, 2)
      if (event.kind === "Penyusutan") totals.depreciation = safeAdd(totals.depreciation, Math.abs(event.amount ?? 0), 2)
      if (event.kind === "Pelepasan") totals.disposal = safeAdd(totals.disposal, Math.abs(event.amount ?? 0), 2)
      if (event.kind === "Pindah Lokasi") totals.transfers += 1

      rows.push({
        kind: "data",
        cells: [
          shortDate(event.date),
          event.kind,
          event.description,
          event.amount === null ? EMPTY : amount(event.amount),
        ],
      })
    }
  }

  if (assetCount === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada perolehan, penyusutan, pelepasan, atau perpindahan aset pada periode ini.",
    })
  }

  return {
    table: { columns: COLUMNS, rows },
    totals,
    assetCount,
    eventCount,
  }
}
