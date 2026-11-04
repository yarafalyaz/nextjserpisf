/**
 * Registry aset tetap — "posisi aset" per tanggal, disusun seperti daftar aset
 * standar (SAP Asset History Sheet / Odoo / Accurate "Daftar Aset Tetap"):
 * dikelompokkan per kategori, dengan harga perolehan, akumulasi penyusutan, dan
 * nilai buku, ditutup subtotal per kategori + total keseluruhan.
 *
 * Akumulasi penyusutan diambil dari riwayat penyusutan per aset sampai tanggal
 * laporan (lihat `asset-ledger.ts`), bukan dari snapshot `Asset.currentValue`
 * yang selalu mencerminkan keadaan hari ini.
 *
 * Pure (tanpa Prisma/DOM) supaya aturan pengelompokan dan penjumlahan bisa diuji.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { formatAccountingExact, formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import {
  accumulatedDepreciationByAsset,
  categoryLabelOf,
  deltasOf,
  disposalDateByAsset,
  eventDeltasByAsset,
  UNCATEGORISED_LABEL,
  type AssetLedgerAsset,
  type AssetLedgerEntry,
  type AssetLedgerJournal,
} from "@/lib/reports/asset-ledger"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export { UNCATEGORISED_LABEL }

/** Label status khusus aset yang tidak ada di STATUS_LABELS bersama. */
const ASSET_STATUS_LABELS: Record<string, string> = { disposed: "Dilepas" }

/** Lebar kolom (mm) — A4 mendatar (area isi 267mm). */
const COLUMNS: TableColumn[] = [
  { header: "Kode", align: "left", width: 20 },
  { header: "Nama Aset", align: "left", width: 75 },
  { header: "Status", align: "left", width: 24 },
  { header: "Tgl Perolehan", align: "center", width: 26 },
  { header: "Harga Perolehan", align: "right", width: 40 },
  { header: "Akum. Penyusutan", align: "right", width: 40 },
  { header: "Nilai Buku", align: "right", width: 38 },
]

export type AssetRegisterAsset = AssetLedgerAsset

export interface AssetRegisterInput {
  assets: AssetLedgerAsset[]
  /** Seluruh riwayat aset; entri non-penyusutan diabaikan. */
  entries: AssetLedgerEntry[]
  /**
   * Jurnal peristiwa POSTED (`ASSET_CHANGE_EVENT`) per aset; loader
   * menghitung delta bruto/akumulasi/impairment dari baris jurnal.
   * Tanpa ini (pemanggil lama) angka persis seperti sebelum field ada.
   */
  journals?: readonly AssetLedgerJournal[]
  /** Tanggal posisi laporan (inklusif, sampai akhir hari). */
  asOf: Date
  /** Sertakan aset yang sudah dilepas (nilai buku 0) — bawaan: tidak. */
  includeDisposed?: boolean
}

export interface AssetRegisterResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totalCost: number
  totalAccumulatedDepreciation: number
  totalBookValue: number
  /** Jumlah aset yang masuk laporan. */
  assetCount: number
  /** Jumlah aset yang tidak masuk karena sudah dilepas. */
  disposedCount: number
}

export function assetStatusLabel(status: string): string {
  return ASSET_STATUS_LABELS[status] ?? statusLabel(status)
}

/**
 * Nominal dicetak hingga sen bila memang bersen; rupiah penuh bila bulat.
 * Dengan 0 desimal, total tidak cocok dengan penjumlahan baris yang tercetak.
 */
function amount(value: number): string {
  return formatAccountingExact(value)
}

/**
 * Baris registry aset per tanggal. Aset yang diperoleh setelah tanggal laporan
 * belum ada di buku, jadi tidak ditampilkan; aset yang sudah dilepas hanya muncul
 * bila diminta (bawaan: disembunyikan, seperti daftar aset "yang masih di buku").
 */
export function buildAssetRegister(input: AssetRegisterInput): AssetRegisterResult {
  const asOfTime = input.asOf.getTime()
  const includeDisposed = Boolean(input.includeDisposed)

  const accumulatedByAsset = accumulatedDepreciationByAsset(input.entries, input.asOf)
  const eventDeltas = eventDeltasByAsset(input.journals, input.asOf)
  const disposalDates = disposalDateByAsset(input.entries)

  let disposedCount = 0
  let hasNegativeBookValue = false

  interface Line {
    asset: AssetRegisterAsset
    cost: number
    accumulated: number
    bookValue: number
  }

  const byCategory = new Map<string, Line[]>()

  for (const asset of input.assets) {
    if (asset.purchaseDate && asset.purchaseDate.getTime() > asOfTime) continue

    // Posisi per tanggal dinilai dari TANGGAL pelepasan, bukan status
    // snapshot hari ini: aset dilepas sesudah `asOf` masih di buku pada
    // `asOf`; aset yang history-nya sudah dilepas sebelum `asOf` sudah
    // keluar walau kolom status belum berubah.
    const disposalDate = disposalDates.get(asset.id)
    const isDisposedAt = disposalDate != null && disposalDate.getTime() <= asOfTime
    if (isDisposedAt && !includeDisposed) {
      disposedCount += 1
      continue
    }

    const deltas = deltasOf(eventDeltas, asset.id)
    const cost = safeAdd(Number(asset.purchaseCost), deltas.gross, 2)
    // Akumulasi = riwayat penyusutan + penyesuaian peristiwa (revaluasi
    // menutup akumulasi lewat debit → delta negatif); impairment kontra
    // terpisah mengurangi nilai buku tanpa mengubah bruto/akumulasi.
    const accumulated = safeAdd(accumulatedByAsset.get(asset.id) ?? 0, deltas.accumulated, 2)
    const bookValue = safeSubtract(safeSubtract(cost, accumulated, 2), deltas.impairment, 2)
    const category = categoryLabelOf(asset)
    const line: Line = { asset, cost, accumulated, bookValue }
    if (line.bookValue < -0.005) hasNegativeBookValue = true

    byCategory.set(category, [...(byCategory.get(category) ?? []), line])
  }

  const rows: TableRow[] = []
  let totalCost = 0
  let totalAccumulatedDepreciation = 0
  let totalBookValue = 0
  let assetCount = 0

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b, "id-ID"))

  for (const category of categories) {
    const lines = (byCategory.get(category) ?? []).sort((a, b) =>
      a.asset.code.localeCompare(b.asset.code, "id-ID", { numeric: true }),
    )

    let categoryCost = 0
    let categoryAccumulated = 0
    let categoryBookValue = 0

    rows.push({ kind: "group", label: category })

    for (const line of lines) {
      const cost = line.cost
      categoryCost = safeAdd(categoryCost, cost, 2)
      categoryAccumulated = safeAdd(categoryAccumulated, line.accumulated, 2)
      categoryBookValue = safeAdd(categoryBookValue, line.bookValue, 2)
      assetCount += 1

      rows.push({
        kind: "data",
        cells: [
          line.asset.code,
          line.asset.name,
          assetStatusLabel(line.asset.status),
          line.asset.purchaseDate ? formatDate(line.asset.purchaseDate, { format: "numeric" }) : "–",
          amount(cost),
          amount(line.accumulated),
          amount(line.bookValue),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Subtotal ${category}`,
      cells: [amount(categoryCost), amount(categoryAccumulated), amount(categoryBookValue)],
    })

    totalCost = safeAdd(totalCost, categoryCost, 2)
    totalAccumulatedDepreciation = safeAdd(totalAccumulatedDepreciation, categoryAccumulated, 2)
    totalBookValue = safeAdd(totalBookValue, categoryBookValue, 2)
  }

  rows.push({
    kind: "total",
    grand: true,
    label: "TOTAL",
    cells: [amount(totalCost), amount(totalAccumulatedDepreciation), amount(totalBookValue)],
  })

  if (hasNegativeBookValue) {
    rows.push({
      kind: "notice",
      text:
        "Perhatian: ada aset dengan nilai buku negatif. Akumulasi penyusutan melebihi harga " +
        "perolehan — periksa nilai residu dan tarif penyusutan kategorinya.",
    })
  }

  return {
    table: { columns: COLUMNS, rows },
    totalCost,
    totalAccumulatedDepreciation,
    totalBookValue,
    assetCount,
    disposedCount,
  }
}
