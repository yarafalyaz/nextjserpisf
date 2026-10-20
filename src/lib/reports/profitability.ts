/**
 * Profitabilitas & HPP — pendapatan dibanding harga pokok penjualan (HPP) per
 * faktur, barang, atau pelanggan.
 *
 * Dua keputusan yang dijaga:
 *
 * - **Pendapatan memakai nilai baris SEBELUM pajak** (`SalesInvoiceItem.total`),
 *   bukan `grandTotal` (yang memuat PPN). Memakai grandTotal akan menggelembungkan
 *   laba sebesar pajak yang bukan milik perusahaan.
 * - **Baris berpendapatan tetapi tanpa HPP dibedakan** antara jasa (memang tak
 *   punya HPP) dan barang stok yang HPP-nya hilang — yang kedua bisa berarti
 *   pengeluaran stok belum diposting, jadi tidak boleh diam-diam terbaca sebagai
 *   margin 100%.
 *
 * Margin dihitung dari pendapatan setelah HPP; bila pendapatan nol, margin `null`
 * (bukan 0) supaya tidak terbaca "impas".
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const PROFITABILITY_DIMENSIONS = ["faktur", "barang", "pelanggan"] as const
export type ProfitabilityDimension = (typeof PROFITABILITY_DIMENSIONS)[number]

export const DIMENSION_LABEL: Record<ProfitabilityDimension, string> = {
  faktur: "Faktur",
  barang: "Barang",
  pelanggan: "Pelanggan",
}

export interface ProfitLineInput {
  /** Kunci pengelompokan (id faktur/barang/pelanggan) untuk pengurutan yang stabil. */
  key: string
  /** Label tampil, mis. nomor faktur atau "SKU — Nama". */
  label: string
  revenue: number
  cogs: number
  /** Baris pendapatan tanpa HPP pada kelompok ini. */
  revenueLinesWithoutCogs: number
  /** Di antaranya yang memang jasa (HPP-nya emang tidak ada). */
  serviceLinesWithoutCogs: number
  /**
   * Σ pendapatan baris STOK tanpa HPP pada kelompok ini (jasa dikecualikan).
   * Opsional supaya pemanggil lama tanpa rincian per-baris tetap jalan
   * (fallback: seluruh pendapatan kelompok bila ada baris stok tanpa HPP).
   */
  stockRevenueWithoutCogs?: number
}

export interface ProfitabilityTotals {
  revenue: number
  cogs: number
  grossProfit: number
  /** Σ pendapatan pada baris yang HPP-nya hilang (indikasi stok belum diposting). */
  revenueMissingCogs: number
  missingCogsLines: number
}

export interface ProfitabilityResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: ProfitabilityTotals
  verdict: string
}

/** Lebar kolom (mm) — jumlahnya 262mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Kelompok", align: "left", width: 92 },
  { header: "Pendapatan", align: "right", width: 44 },
  { header: "HPP", align: "right", width: 44 },
  { header: "Laba Kotor", align: "right", width: 44 },
  { header: "Margin", align: "right", width: 38 },
]

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

/** Margin dalam persen, atau null bila pendapatan nol. */
export function grossMarginPercent(revenue: number, cogs: number): number | null {
  if (revenue === 0) return null
  return ((revenue - cogs) / revenue) * 100
}

function marginCell(revenue: number, cogs: number): string {
  const margin = grossMarginPercent(revenue, cogs)
  return margin === null ? "n/a" : `${margin.toFixed(1).replace(".", ",")}%`
}

export function buildProfitability(input: {
  lines: ProfitLineInput[]
  dimension: ProfitabilityDimension
}): ProfitabilityResult {
  const sorted = [...input.lines].sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue
    return a.label.localeCompare(b.label, "id-ID")
  })

  const totals: ProfitabilityTotals = {
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    revenueMissingCogs: 0,
    missingCogsLines: 0,
  }

  // Baris kosong (tanpa pendapatan dan tanpa HPP) tidak informatif.
  const visible = sorted.filter((line) => line.revenue !== 0 || line.cogs !== 0)

  const rows: TableRow[] = visible.map((line) => {
    totals.revenue = safeAdd(totals.revenue, line.revenue, 2)
    totals.cogs = safeAdd(totals.cogs, line.cogs, 2)
    // Hanya baris yang bukan jasa dianggap "HPP hilang" (jasa memang tanpa HPP).
    // revenueMissingCogs akumulasi per-BARIS stok tanpa HPP, bukan se-bucket:
    // bucket berisi campuran baris ber-HPP + tanpa-HPP tidak boleh menyeret
    // seluruh pendapatan bucket. Pemanggil yang tak kirim rincian per-baris
    // (stockRevenueWithoutCogs undefined) pakai fallback lama = line.revenue.
    const stockableWithoutCogs = line.revenueLinesWithoutCogs - line.serviceLinesWithoutCogs
    if (stockableWithoutCogs > 0) {
      totals.revenueMissingCogs = safeAdd(totals.revenueMissingCogs, line.stockRevenueWithoutCogs ?? line.revenue, 2)
      totals.missingCogsLines += stockableWithoutCogs
    }
    return {
      kind: "data",
      cells: [line.label, amount(line.revenue), amount(line.cogs), amount(safeSubtract(line.revenue, line.cogs, 2)), marginCell(line.revenue, line.cogs)],
    }
  })

  totals.grossProfit = safeSubtract(totals.revenue, totals.cogs, 2)

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada penjualan pada periode ini, jadi profitabilitas belum bisa dinilai. " +
        "Pastikan faktur sudah diposting dan tanggalnya masuk periode yang dipilih.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [amount(totals.revenue), amount(totals.cogs), amount(totals.grossProfit), marginCell(totals.revenue, totals.cogs)],
    })
  }

  if (totals.missingCogsLines > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.missingCogsLines} baris barang berpendapatan (senilai ${formatCurrency(totals.revenueMissingCogs)}) ` +
        "tidak punya HPP. Untuk barang stok ini bisa berarti pengeluaran stok belum diposting, jadi " +
        "marginnya jangan dianggap nyata sebelum diperiksa. Baris jasa memang tidak punya HPP.",
    })
  }

  rows.push({
    kind: "notice",
    text:
      `Pendapatan memakai nilai baris sebelum pajak (PPN tidak dihitung sebagai pendapatan). ` +
      `HPP diambil dari pengeluaran stok yang diposting untuk faktur (qty × biaya FIFO). ` +
      `Dimensi: per ${DIMENSION_LABEL[input.dimension]}.`,
  })

  const verdict =
    visible.length === 0
      ? "Tidak ada penjualan pada periode ini"
      : `Laba kotor ${formatCurrency(totals.grossProfit)} dari pendapatan ${formatCurrency(totals.revenue)}` +
        (totals.missingCogsLines > 0 ? ` · ${totals.missingCogsLines} baris tanpa HPP` : "")

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function profitabilitySummary(result: ProfitabilityResult): string {
  if (result.totals.revenue === 0 && result.totals.cogs === 0) return "Tidak ada penjualan pada periode ini"
  const margin = grossMarginPercent(result.totals.revenue, result.totals.cogs)
  return (
    `Pendapatan ${formatCurrency(result.totals.revenue)} · HPP ${formatCurrency(result.totals.cogs)} · ` +
    `laba kotor ${formatCurrency(result.totals.grossProfit)}` +
    (margin === null ? "" : ` (${margin.toFixed(1).replace(".", ",")}%)`) +
    (result.totals.missingCogsLines > 0 ? ` · ${result.totals.missingCogsLines} baris tanpa HPP` : "")
  )
}
