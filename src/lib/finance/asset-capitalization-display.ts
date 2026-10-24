/**
 * Label tampil konsumen UI kapitalisasi perbaikan aset — vonis BOT 4
 * F-2026-10-23-108-V (PR #612 MERGED), builder BOT 3 PR #624 MERGED
 * (`src/lib/finance/asset-capitalization.ts`).
 *
 * Lapisan ini HANYA memberi label Indonesia atas keputusan + hasil builder.
 * UI tidak menghitung ulang amortisasi/penyusutan, tidak memilih metode,
 * tidak menentukan kapitalisasi-vs-beban, dan tidak menyediakan jurnal.
 * Kode akun TIDAK hidup di sini: kapitalisasi F-108 memakai akun Aset Tetap
 * kategori existing (F-128-V: nol akun baru) — label akun, bila kelak
 * ditampilkan inti peristiwa, wajib verbatim dari builder/loader.
 */

import type {
  CapitalizationClassification,
  FiscalCapitalizationResult,
} from "./asset-capitalization"

/** Label keputusan gerbang Putusan 1 (capitalize vs expense). */
export const CAPITALIZATION_DECISION_LABELS: Record<
  CapitalizationClassification["decision"],
  string
> = {
  capitalize: "Dikapitalisasi",
  expense: "Dibebankan sebagai beban periode",
}

/** Label syarat Putusan 1 yang gugur pada keputusan `expense`, urut (a)-(d). */
export const CAPITALIZATION_FAILED_CONDITION_LABELS: Record<
  "a" | "b" | "c" | "d",
  string
> = {
  a: "Aset tidak aktif / tidak lagi dimiliki dan digunakan",
  b: "Masa manfaat pengeluaran tidak lebih dari 1 tahun",
  c: "Manfaat masa depan terukur belum terbukti",
  d: "Jumlah belum dapat diukur andal dari dokumen sumber",
}

/** Label masa manfaat baru sesudah kapitalisasi (bulan dari builder). */
export function capitalizationRemainingLifeLabel(
  result: FiscalCapitalizationResult,
): string {
  return `Sisa masa manfaat fiskal sesudah kapitalisasi: ${result.remainingFiscalLifeMonthsAfter} bulan`
}

/** Label tambahan masa manfaat yang dipakai builder sesudah gerbang penilai (E108-9). */
export function capitalizationAppliedExtensionLabel(
  result: FiscalCapitalizationResult,
): string {
  return result.appliedLifeExtensionMonths > 0
    ? `Tambahan masa manfaat terpakai: ${result.appliedLifeExtensionMonths} bulan`
    : "Tambahan masa manfaat: tidak menambah (tanpa penilai/dasar terstruktur atau klaim 0 bulan)"
}

/** Label plafon kelompok (E108-3) bila builder memotong sisa terhitung. */
export const CAPITALIZATION_CAPPED_LABEL =
  "Sisa masa manfaat dipotong plafon masa manfaat kelompok fiskal"

/** Label tarif/beban fiskal bulanan atas basis baru; null builder = metode tidak sah. */
export function capitalizationMonthlyDepreciationLabel(
  result: FiscalCapitalizationResult,
  formattedAmount: string | null,
): string {
  return result.monthlyFiscalDepreciation == null || formattedAmount == null
    ? "Beban fiskal bulanan: belum dapat dihitung untuk metode/kelompok ini"
    : `Beban fiskal bulanan atas basis baru: ${formattedAmount}`
}

/** Label bulan mulai penyusutan atas hasil penjumlahan (E108-6), format builder YYYY-MM. */
export function capitalizationStartMonthLabel(
  result: FiscalCapitalizationResult,
): string {
  return `Penyusutan atas basis baru mulai bulan ${result.depreciationStartMonth}`
}
