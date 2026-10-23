/**
 * Pemuatan data untuk laporan **Perbedaan Temporer Pajak Tangguhan (tahap stok)**.
 *
 * Memakai dasar bersama `loadAssetJournalBookRows` (aset belum dilepas +
 * jurnal aset POSTED, nilai buku dari `journalBookValue`) supaya dasar
 * jurnal tidak menghitung ulang dengan cara berbeda. Aset legacy tanpa
 * jurnal perolehan POSTED dikecualikan builder lewat `hasPostedBooks`.
 *
 * F-2026-10-23-124-V transisi: dasar fiskal WAJIB baris saldo terbekukan
 * `closingBalance` inti F-109 — tabel/loader itu belum dibangun, jadi loader
 * meneruskan `frozenClosingBalance: null` (belum-terbekukan bernama), BUKAN
 * hitung ulang garis lurus dari `purchaseCost`. Tarif: selama master
 * bertanggal efektif belum ada, tarif dari pemanggil adalah pasokan
 * operator (`rateSource: "operator"`, berlabel di hasil).
 * Tarif badan dan tanggal akhir tahun pajak dipasok pemanggil.
 */

import { loadAssetJournalBookRows } from "@/lib/reports/depreciation-difference-data"
import {
  buildDeferredTaxTemporaryDifference,
  DEFERRED_TAX_NOTICE,
  type DeferredTaxAssetInput,
  type DeferredTaxRateSource,
  type DeferredTaxResult,
} from "@/lib/reports/deferred-tax"

export { DEFERRED_TAX_NOTICE }

export interface DeferredTaxReport {
  report: DeferredTaxResult
  notice: string
}

export async function loadDeferredTax(input: {
  /** Tarif badan persen; master bertanggal efektif kelak, transisi pasokan operator. */
  taxRatePercent: number | null
  /** Asal tarif; default `operator` selama master belum ada. */
  rateSource?: DeferredTaxRateSource
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
    // Inti F-109 (tabel baris tahun terbekukan) belum dibangun: tidak ada
    // closingBalance terbekukan untuk dibaca. Jangan karang dari master.
    frozenClosingBalance: null,
    frozenRejectionReason: null,
  }))
  const report = buildDeferredTaxTemporaryDifference({
    assets: inputs,
    taxRatePercent: input.taxRatePercent,
    rateSource: input.rateSource ?? "operator",
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
