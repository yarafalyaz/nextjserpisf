/**
 * Aturan bersama laporan aset tetap (registry, mutasi, dan disposisi).
 *
 * Ketiganya membaca data yang sama — daftar aset + riwayatnya — dan ketiganya
 * perlu jawaban yang sama untuk dua pertanyaan:
 *
 *   1. Berapa akumulasi penyusutan sebuah aset sampai tanggal tertentu?
 *      Jawabannya HANYA dari riwayat penyusutan (`AssetHistory` type
 *      "depreciation"). `Asset.currentValue` adalah snapshot nilai buku HARI INI,
 *      jadi memakainya untuk laporan per tanggal akan menampilkan angka hari ini
 *      pada laporan periode lama — persis kesalahan yang paling sering terjadi di
 *      registry aset.
 *   2. Apakah sebuah aset masih ada di buku pada tanggal tertentu? (sudah
 *      diperoleh, belum dilepas)
 *
 * Ditulis sekali di sini supaya registry, mutasi, dan disposisi tidak menjawabnya
 * dengan cara yang sedikit berbeda.
 *
 * Pure (tanpa Prisma/DOM) supaya bisa diuji.
 */
import { safeAdd } from "@/lib/utils/math"

export const UNCATEGORISED_LABEL = "Tanpa Kategori"

/** Nilai `AssetHistory.type` yang dikenal. */
export const DEPRECIATION_TYPE = "depreciation"
export const DISPOSAL_TYPE = "disposal"

export interface AssetLedgerAsset {
  id: number
  code: string
  name: string
  categoryName: string | null
  purchaseDate: Date | null
  purchaseCost: number
  status: string
}

export interface AssetLedgerEntry {
  assetId: number
  type: string
  /** Penyusutan: beban bulan itu. Disposisi: hasil penjualan. */
  amount: number
  date: Date
}

export function categoryLabelOf(asset: Pick<AssetLedgerAsset, "categoryName">): string {
  return asset.categoryName?.trim() || UNCATEGORISED_LABEL
}

/** Akumulasi penyusutan per aset sampai `cutoff` (inklusif). */
export function accumulatedDepreciationByAsset(
  entries: AssetLedgerEntry[],
  cutoff: Date,
): Map<number, number> {
  const cutoffTime = cutoff.getTime()
  const totals = new Map<number, number>()

  for (const entry of entries) {
    if (entry.type !== DEPRECIATION_TYPE) continue
    if (entry.date.getTime() > cutoffTime) continue
    totals.set(entry.assetId, safeAdd(totals.get(entry.assetId) ?? 0, Number(entry.amount), 2))
  }

  return totals
}

/** Tanggal pelepasan paling awal per aset (sebuah aset hanya dilepas sekali). */
export function disposalDateByAsset(entries: AssetLedgerEntry[]): Map<number, Date> {
  const dates = new Map<number, Date>()

  for (const entry of entries) {
    if (entry.type !== DISPOSAL_TYPE) continue
    const current = dates.get(entry.assetId)
    if (!current || entry.date.getTime() < current.getTime()) dates.set(entry.assetId, entry.date)
  }

  return dates
}

/**
 * Aset masih di buku pada `at` bila sudah diperoleh dan belum dilepas. Aset tanpa
 * tanggal perolehan dianggap sudah ada sejak awal (data lama), bukan diabaikan.
 */
export function isOnBookAt(
  asset: AssetLedgerAsset,
  disposalDate: Date | undefined,
  at: Date,
): boolean {
  const atTime = at.getTime()
  if (asset.purchaseDate && asset.purchaseDate.getTime() > atTime) return false
  if (disposalDate && disposalDate.getTime() <= atTime) return false
  return true
}
