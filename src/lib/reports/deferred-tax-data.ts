/**
 * Pemuatan data untuk laporan **Perbedaan Temporer Pajak Tangguhan (tahap stok)**.
 *
 * Memakai dasar bersama `loadAssetJournalBookRows` (aset belum dilepas +
 * jurnal aset POSTED, nilai buku dari `journalBookValue`) supaya dasar
 * jurnal tidak menghitung ulang dengan cara berbeda. Aset legacy tanpa
 * jurnal perolehan POSTED dikecualikan builder lewat `hasPostedBooks`.
 *
 * F-2026-10-23-124-V transisi + inti F-109-V: dasar fiskal WAJIB baris
 * saldo terbekukan `closingBalance` tahun pajak `asOf` dari tabel baris
 * tahun. Aset tanpa baris tahun itu = `fiskal-belum-terbekukan` bernama
 * (alasan dari resolver F-109 bila fiskal memang belum-dihitung), BUKAN
 * hitung ulang garis lurus dari `purchaseCost`. Tarif: selama master
 * bertanggal efektif belum ada, tarif dari pemanggil adalah pasokan
 * operator (`rateSource: "operator"`, berlabel di hasil).
 * Tarif badan dan tanggal akhir tahun pajak dipasok pemanggil.
 */

import { resolveFiscalGroup } from "@/lib/finance/asset-fiscal-groups"
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
  const asOfYear = input.asOf.getFullYear()
  const inputs: DeferredTaxAssetInput[] = rows.map((row) => {
    const frozen = row.fiscalYearRows.find((r) => r.taxYear === asOfYear) ?? null
    let frozenRejectionReason: string | null = null
    if (!frozen) {
      const resolution = resolveFiscalGroup({
        taxGroupCode: row.taxGroupCode,
        taxTypeListed: row.taxTypeListed,
        taxDjpDetermination: row.taxDjpDetermination,
      })
      if (resolution.status !== "resolved") frozenRejectionReason = "kelompok-belum-ditentukan"
      else if (row.fiscalMethod == null || row.fiscalMethod.trim() === "") frozenRejectionReason = "metode-belum-dipilih"
      else if (row.fiscalMethod === "declining_balance" && resolution.group.isBuilding) frozenRejectionReason = "bangunan-saldo-menurun"
      else if (!row.purchaseDate) frozenRejectionReason = "tanpa-tanggal-perolehan"
    }
    return {
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
      // Baris terbekukan tahun asOf apa adanya; tanpa baris = belum-terbekukan.
      frozenClosingBalance: frozen ? frozen.closingBalance.toNumber() : null,
      frozenRejectionReason,
    }
  })
  const report = buildDeferredTaxTemporaryDifference({
    assets: inputs,
    taxRatePercent: input.taxRatePercent,
    rateSource: input.rateSource ?? "operator",
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
