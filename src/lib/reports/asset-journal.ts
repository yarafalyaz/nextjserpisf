/**
 * Jurnal aset tetap — seluruh jurnal yang menyangkut aset tetap: perolehan,
 * penyusutan bulanan, dan pelepasan.
 *
 * Penyaringnya harus mengenali **awalan** `ASSET_DEPRECIATION_`, bukan kesamaan
 * `referenceType`. Alasannya ada di `api/cron/asset-depreciation`: jurnal unik
 * pada (referenceType, referenceId), sehingga periode disisipkan ke referenceType
 * (`ASSET_DEPRECIATION_202610`) supaya aset yang sama bisa disusutkan tiap bulan.
 * Menyaring dengan kesamaan akan membuat laporan ini diam-diam kosong sejak bulan
 * kedua — persis jenis kegagalan yang sudah pernah terjadi pada cron-nya.
 *
 * Penyusunan tabelnya memakai `journal-listing.ts` bersama laporan jurnal lain.
 */

import { buildJournalListing, shortJournalDate } from "@/lib/reports/journal-listing"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** referenceType jurnal aset — satu tempat, dipakai penyaring data & label. */
export const ASSET_ACQUISITION_TYPE = "ASSET_ACQUISITION"
export const ASSET_DISPOSAL_TYPE = "ASSET_DISPOSAL"
export const ASSET_DEPRECIATION_PREFIX = "ASSET_DEPRECIATION_"

/** Apakah jurnal ini milik modul aset tetap? */
export function isAssetJournalReference(referenceType: string): boolean {
  return (
    referenceType === ASSET_ACQUISITION_TYPE ||
    referenceType === ASSET_DISPOSAL_TYPE ||
    referenceType.startsWith(ASSET_DEPRECIATION_PREFIX)
  )
}

export type AssetJournalKind = "Perolehan" | "Penyusutan" | "Pelepasan"

/** Label jenis jurnal; `null` bila jurnalnya bukan jurnal aset. */
export function assetJournalKind(referenceType: string): AssetJournalKind | null {
  if (referenceType === ASSET_ACQUISITION_TYPE) return "Perolehan"
  if (referenceType === ASSET_DISPOSAL_TYPE) return "Pelepasan"
  if (referenceType.startsWith(ASSET_DEPRECIATION_PREFIX)) return "Penyusutan"
  return null
}

export interface AssetJournalLineInput {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface AssetJournalInput {
  id: number
  journalNumber: string
  date: Date
  referenceType: string
  /** id aset pada model `Asset` (semua referenceType aset memakainya). */
  referenceId: number | null
  description: string | null
  lines: AssetJournalLineInput[]
}

export interface AssetJournalTypeSummary {
  kind: AssetJournalKind
  count: number
  amount: number
}

export interface AssetJournalResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  /** Jumlah jurnal per jenis, dengan nilai sisi debitnya. */
  byKind: AssetJournalTypeSummary[]
  journalCount: number
  totalDebit: number
  totalCredit: number
  /** Debit = kredit untuk seluruh jurnal yang ditampilkan. */
  isBalanced: boolean
}

/**
 * Susun laporan jurnal aset: satu blok per jurnal (kepala = tanggal, nomor,
 * jenis, aset), lalu baris akun debit/kredit di bawahnya.
 *
 * @param assets peta id aset → kode & nama, untuk memberi judul blok.
 */
export function buildAssetJournal(input: {
  journals: AssetJournalInput[]
  assets: Map<number, { code: string; name: string }>
  start: Date
  end: Date
}): AssetJournalResult {
  const { journals, assets } = input

  const byKind = new Map<AssetJournalKind, AssetJournalTypeSummary>()
  for (const journal of journals) {
    const kind = assetJournalKind(journal.referenceType)
    if (!kind) continue
    const debit = journal.lines.reduce((sum, line) => safeAdd(sum, line.debit, 2), 0)
    const bucket = byKind.get(kind) ?? { kind, count: 0, amount: 0 }
    bucket.count += 1
    bucket.amount = safeAdd(bucket.amount, debit, 2)
    byKind.set(kind, bucket)
  }

  const listing = buildJournalListing({
    emptyNotice:
      "Tidak ada jurnal aset pada periode ini. Penyusutan diposting oleh cron `api/cron/asset-depreciation`; " +
      "perolehan dan pelepasan diposting saat aset dibuat/dilepas.",
    journals: journals.map((journal) => {
      const kind = assetJournalKind(journal.referenceType)
      const asset = journal.referenceId !== null ? assets.get(journal.referenceId) : undefined
      const assetLabel = asset ? `${asset.code} ${asset.name}` : "Tanpa aset"
      return {
        id: journal.id,
        journalNumber: journal.journalNumber,
        date: journal.date,
        title: [shortJournalDate(journal.date), journal.journalNumber, kind ?? "Jurnal aset", assetLabel]
          .filter(Boolean)
          .join(" · "),
        description: journal.description,
        lines: journal.lines,
      }
    }),
  })

  return {
    ...listing,
    byKind: [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind, "id-ID")),
  }
}
