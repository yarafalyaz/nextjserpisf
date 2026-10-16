/**
 * Rasio keuangan — likuiditas, solvabilitas, dan profitabilitas dari angka yang
 * sudah ada di Neraca & Laba Rugi.
 *
 * Aturan yang dijaga: **penyebut nol tidak menghasilkan angka**. Rasio dengan
 * kewajiban/ekuitas/aset/pendapatan nol dikembalikan `null` dan ditandai, bukan
 * ditampilkan sebagai 0 atau ∞ — rasio yang "terlihat bagus" padahal tak
 * terdefinisi adalah salah saji yang tidak akan terbaca sebagai kesalahan.
 *
 * Pure (tanpa Prisma/DOM).
 */

export type RatioUnit = "x" | "%"

export interface RatioInput {
  /** Aset lancar (kas/bank, piutang, persediaan, aset lancar lain). */
  currentAssets: number
  /** Persediaan saja — untuk rasio cepat. */
  inventory: number
  totalAssets: number
  /** Kewajiban jangka pendek (utang usaha + kewajiban jangka pendek lain). */
  currentLiabilities: number
  totalLiabilities: number
  totalEquity: number
  /** Pendapatan periode. */
  revenue: number
  grossProfit: number
  netProfit: number
}

export interface RatioRow {
  key: string
  label: string
  /**
   * `null` bila penyebut nol / tidak tersedia (lihat catatan). Untuk satuan "%"
   * nilainya sudah dalam persen (mis. 40 berarti 40%), bukan pecahan.
   */
  value: number | null
  unit: RatioUnit
  /** Rumus singkat, ditampilkan di laporan supaya angkanya bisa diperiksa. */
  formula: string
  /** Alasan bila `value` null. */
  note?: string
}

export interface FinancialRatiosResult {
  rows: RatioRow[]
  groups: { label: string; rows: RatioRow[] }[]
}

const DENOMINATOR_ZERO = "Penyebut nol — rasio tidak dapat dihitung."

function ratio(
  key: string,
  label: string,
  formula: string,
  numerator: number,
  denominator: number,
  unit: RatioUnit,
): RatioRow {
  if (denominator === 0) {
    return { key, label, value: null, unit, formula, note: DENOMINATOR_ZERO }
  }
  const raw = numerator / denominator
  // Satuan "%" disimpan sudah dikali 100 supaya format tampilnya langsung benar.
  return { key, label, value: unit === "%" ? raw * 100 : raw, unit, formula }
}

export function computeFinancialRatios(input: RatioInput): FinancialRatiosResult {
  const quickAssets = input.currentAssets - input.inventory

  const liquidity: RatioRow[] = [
    ratio("current-ratio", "Rasio Lancar", "Aset lancar ÷ kewajiban lancar", input.currentAssets, input.currentLiabilities, "x"),
    ratio("quick-ratio", "Rasio Cepat", "(Aset lancar − persediaan) ÷ kewajiban lancar", quickAssets, input.currentLiabilities, "x"),
  ]

  const solvency: RatioRow[] = [
    ratio("debt-to-equity", "Utang terhadap Ekuitas", "Total kewajiban ÷ total ekuitas", input.totalLiabilities, input.totalEquity, "x"),
    ratio("debt-to-asset", "Utang terhadap Aset", "Total kewajiban ÷ total aset", input.totalLiabilities, input.totalAssets, "%"),
  ]

  const profitability: RatioRow[] = [
    ratio("gross-margin", "Margin Laba Kotor", "Laba kotor ÷ pendapatan", input.grossProfit, input.revenue, "%"),
    ratio("net-margin", "Margin Laba Bersih", "Laba bersih ÷ pendapatan", input.netProfit, input.revenue, "%"),
    ratio("roa", "Pengembalian Aset (ROA)", "Laba bersih ÷ total aset", input.netProfit, input.totalAssets, "%"),
    ratio("roe", "Pengembalian Ekuitas (ROE)", "Laba bersih ÷ total ekuitas", input.netProfit, input.totalEquity, "%"),
  ]

  return {
    rows: [...liquidity, ...solvency, ...profitability],
    groups: [
      { label: "Likuiditas", rows: liquidity },
      { label: "Solvabilitas", rows: solvency },
      { label: "Profitabilitas", rows: profitability },
    ],
  }
}

/** Format tampil satu rasio: "2,15×", "12,3%", atau "n/a". */
export function formatRatio(row: RatioRow): string {
  if (row.value === null) return "n/a"
  const rounded = row.unit === "x" ? row.value.toFixed(2) : row.value.toFixed(1)
  return `${rounded.replace(".", ",")}${row.unit === "x" ? "×" : "%"}`
}
