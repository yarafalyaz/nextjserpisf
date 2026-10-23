/**
 * Pemuatan data untuk laporan **Perbedaan Temporer Pajak Tangguhan (tahap stok)**.
 *
 * Memakai dasar bersama `loadAssetJournalBookRows` (aset belum dilepas +
 * jurnal aset POSTED, nilai buku dari `journalBookValue`) supaya dasar
 * jurnal tidak menghitung ulang dengan cara berbeda. Aset legacy tanpa
 * jurnal perolehan POSTED dikecualikan builder lewat `hasPostedBooks`.
 * Tarif badan dan tanggal akhir tahun pajak dipasok pemanggil.
 */

import { loadAssetJournalBookRows } from "@/lib/reports/depreciation-difference-data"
import {
  buildDeferredTaxTemporaryDifference,
  DEFERRED_TAX_NOTICE,
  type DeferredTaxAssetInput,
  type DeferredTaxResult,
} from "@/lib/reports/deferred-tax"

export { DEFERRED_TAX_NOTICE }

export interface DeferredTaxReport {
  report: DeferredTaxResult
  notice: string
}

export async function loadDeferredTax(input: {
  /** Tarif badan persen dari master bertanggal efektif; null = belum dipasok. */
  taxRatePercent: number | null
  /** Tanggal akhir tahun pajak yang dinilai. */
  asOf: Date
}): Promise<DeferredTaxReport> {
  const rows = await loadAssetJournalBookRows()
  const inputs: DeferredTaxAssetInput[] = rows.map((row) => ({
    code: row.code,
    name: row.name,
    categoryName: row.categoryName,
    purchaseCost: row.purchaseCost,
    bookValue: row.bookValue,
    purchaseDate: row.purchaseDate,
    taxGroupCode: row.taxGroupCode,
    taxTypeListed: row.taxTypeListed,
    taxDjpDetermination: row.taxDjpDetermination,
    hasPostedBooks: row.hasPostedBooks,
  }))
  const report = buildDeferredTaxTemporaryDifference({
    assets: inputs,
    taxRatePercent: input.taxRatePercent,
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
