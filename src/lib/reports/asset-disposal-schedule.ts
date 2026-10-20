/**
 * Daftar disposisi aset tetap — aset yang dilepas pada satu periode, disusun
 * seperti disposal schedule yang menyertai catatan laporan keuangan: harga
 * perolehan, akumulasi penyusutan saat dilepas, nilai buku, hasil penjualan, dan
 * laba/rugi pelepasan.
 *
 * Dua angka yang TIDAK disimpan di database dihitung di sini, bukan dikarang:
 *   - akumulasi penyusutan saat pelepasan = jumlah riwayat penyusutan sampai
 *     tanggal pelepasan (`AssetHistory` hanya menyimpan beban per bulan);
 *   - nilai buku = harga perolehan − akumulasi; laba/rugi = hasil penjualan −
 *     nilai buku.
 * Karena `Asset.currentValue` sudah dinolkan saat pelepasan, memakainya akan
 * membuat setiap pelepasan tampak "rugi sebesar harga perolehan".
 *
 * Pure (tanpa Prisma/DOM) supaya perhitungan laba/rugi bisa diuji.
 */

import { formatAccounting, formatDate } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import {
  accumulatedDepreciationByAsset,
  DISPOSAL_TYPE,
  type AssetLedgerAsset,
  type AssetLedgerEntry,
} from "@/lib/reports/asset-ledger"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — A4 mendatar (area isi 267mm). */
const COLUMNS: TableColumn[] = [
  { header: "Kode", align: "left", width: 20 },
  { header: "Nama Aset", align: "left", width: 56 },
  { header: "Tgl Pelepasan", align: "center", width: 26 },
  { header: "Harga Perolehan", align: "right", width: 34 },
  { header: "Akum. Penyusutan", align: "right", width: 34 },
  { header: "Nilai Buku", align: "right", width: 32 },
  { header: "Hasil Penjualan", align: "right", width: 32 },
  { header: "Laba/(Rugi)", align: "right", width: 30 },
]

export interface AssetDisposalReportInput {
  assets: AssetLedgerAsset[]
  /** Seluruh riwayat aset (penyusutan + pelepasan). */
  entries: AssetLedgerEntry[]
  /** Awal periode (inklusif). */
  start: Date
  /** Akhir periode (inklusif). */
  end: Date
}

export interface AssetDisposalTotals {
  cost: number
  accumulated: number
  bookValue: number
  proceeds: number
  gainLoss: number
}

export interface AssetDisposalReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: AssetDisposalTotals
  count: number
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

/**
 * Baris pelepasan pada periode [start, end], diurutkan menurut tanggal pelepasan
 * (urutan alami sebuah jadwal pelepasan), lalu kode aset untuk tanggal yang sama.
 */
export function buildAssetDisposals(input: AssetDisposalReportInput): AssetDisposalReportResult {
  const { assets, entries, start, end } = input

  const assetById = new Map(assets.map((asset) => [asset.id, asset]))

  const disposals = entries
    .filter(
      (entry) =>
        entry.type === DISPOSAL_TYPE &&
        entry.date.getTime() >= start.getTime() &&
        entry.date.getTime() <= end.getTime(),
    )
    .map((entry) => ({ entry, asset: assetById.get(entry.assetId) }))
    .filter((item): item is { entry: AssetLedgerEntry; asset: AssetLedgerAsset } => Boolean(item.asset))

  const totals: AssetDisposalTotals = {
    cost: 0,
    accumulated: 0,
    bookValue: 0,
    proceeds: 0,
    gainLoss: 0,
  }

  const lines = disposals
    .map(({ entry, asset }) => {
      const cost = Number(asset.purchaseCost)
      // Akumulasi sampai TANGGAL PELEPASAN masing-masing aset, bukan sekali di
      // akhir periode: aset yang dilepas 10 Oktober tidak boleh memakai beban
      // penyusutan November.
      const accumulated = accumulatedDepreciationByAsset(entries, entry.date).get(asset.id) ?? 0
      const bookValue = safeSubtract(cost, accumulated, 2)
      const proceeds = Number(entry.amount ?? 0)
      return { asset, date: entry.date, cost, accumulated, bookValue, proceeds, gainLoss: safeSubtract(proceeds, bookValue, 2) }
    })
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      if (byDate !== 0) return byDate
      return a.asset.code.localeCompare(b.asset.code, "id-ID", { numeric: true })
    })

  const rows: TableRow[] = lines.map((line) => {
    totals.cost = safeAdd(totals.cost, line.cost, 2)
    totals.accumulated = safeAdd(totals.accumulated, line.accumulated, 2)
    totals.bookValue = safeAdd(totals.bookValue, line.bookValue, 2)
    totals.proceeds = safeAdd(totals.proceeds, line.proceeds, 2)
    totals.gainLoss = safeAdd(totals.gainLoss, line.gainLoss, 2)

    return {
      kind: "data",
      cells: [
        line.asset.code,
        line.asset.name,
        formatDate(line.date, { format: "numeric" }),
        amount(line.cost),
        amount(line.accumulated),
        amount(line.bookValue),
        amount(line.proceeds),
        amount(line.gainLoss),
      ],
    }
  })

  rows.push({
    kind: "total",
    grand: true,
    label: `TOTAL (${lines.length} aset)`,
    cells: [
      amount(totals.cost),
      amount(totals.accumulated),
      amount(totals.bookValue),
      amount(totals.proceeds),
      amount(totals.gainLoss),
    ],
  })

  if (lines.length === 0) {
    rows.unshift({
      kind: "notice",
      text: "Tidak ada aset yang dilepas pada periode ini.",
    })
  }

  return { table: { columns: COLUMNS, rows }, totals, count: lines.length }
}
