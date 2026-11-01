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

/**
 * Delta jurnal peristiwa POSTED (`ASSET_CHANGE_EVENT`) satu aset, dihitung
 * loader dari baris jurnal POSTED pada akun kategori aset itu — pola
 * `journalBookValue` (`sumEventNetOnAccount`). Revaluasi/impairment/
 * reklasifikasi TIDAK menulis `AssetHistory`, jadi tanpa delta ini register,
 * mutasi, dan jadwal pelepasan membeku di angka pra-peristiwa sementara
 * rekonsiliasi/depreciation-difference/detail aset sudah memakai jurnal.
 */
export interface AssetLedgerJournal {
  assetId: number
  referenceType: string
  date: Date
  /** Neto (debit − kredit) akun Aset Tetap pada jurnal peristiwa. */
  grossDelta: number
  /**
   * Penyesuaian akumulasi bertanda terhadap akumulasi history: negatif
   * mengurangi akumulasi (revaluasi menutup akumulasi lewat debit).
   */
  accumulatedDelta: number
  /** Kontra impairment neto kredit (mengurangi nilai buku, bukan bruto). */
  impairmentDelta: number
}

export interface AssetEventDeltas {
  gross: number
  accumulated: number
  impairment: number
}

/** Total delta peristiwa per aset sampai `cutoff` (inklusif). */
export function eventDeltasByAsset(
  journals: readonly AssetLedgerJournal[] | undefined,
  cutoff: Date,
): Map<number, AssetEventDeltas> {
  const totals = new Map<number, AssetEventDeltas>()
  if (!journals) return totals
  const cutoffTime = cutoff.getTime()
  for (const journal of journals) {
    if (journal.referenceType !== "ASSET_CHANGE_EVENT") continue
    if (journal.date.getTime() > cutoffTime) continue
    const current = totals.get(journal.assetId) ?? { gross: 0, accumulated: 0, impairment: 0 }
    current.gross = safeAdd(current.gross, journal.grossDelta, 2)
    current.accumulated = safeAdd(current.accumulated, journal.accumulatedDelta, 2)
    current.impairment = safeAdd(current.impairment, journal.impairmentDelta, 2)
    totals.set(journal.assetId, current)
  }
  return totals
}

const ZERO_DELTAS: AssetEventDeltas = { gross: 0, accumulated: 0, impairment: 0 }

export function deltasOf(map: Map<number, AssetEventDeltas>, assetId: number): AssetEventDeltas {
  return map.get(assetId) ?? ZERO_DELTAS
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
