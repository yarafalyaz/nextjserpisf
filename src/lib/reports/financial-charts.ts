/**
 * Grafik keuangan — seri bulanan untuk enam tampilan:
 * perbandingan nilai akun, pendapatan vs biaya, rasio likuiditas, ROA, ROE,
 * dan harta bersih.
 *
 * Prinsip yang dijaga:
 *
 * - **Rasio/penyebut nol menghasilkan `null`**, bukan 0. Grafik menampilkannya
 *   sebagai celah (bukan garis yang menyentuh nol, yang terbaca "rasio jelek"
 *   padahal sebenarnya tidak terdefinisi).
 * - **Angka posisi (aset/kewajiban/ekuitas/harta bersih) tidak dijumlahkan** antar
 *   bulan — menjumlahkan saldo posisi tidak berarti. Baris "Jumlah" hanya muncul
 *   untuk arus (pendapatan vs biaya).
 * - Pendapatan vs biaya sengaja didefinisikan supaya **selisihnya persis laba
 *   bersih**: pendapatan = pendapatan + pendapatan lain; biaya = HPP + beban
 *   operasional + beban lain.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const FINANCIAL_CHARTS = [
  "perbandingan-nilai-akun",
  "pendapatan-vs-biaya",
  "rasio-likuiditas",
  "roa",
  "roe",
  "harta-bersih",
] as const
export type FinancialChart = (typeof FINANCIAL_CHARTS)[number]

export const FINANCIAL_CHART_LABEL: Record<FinancialChart, string> = {
  "perbandingan-nilai-akun": "Perbandingan Nilai Akun",
  "pendapatan-vs-biaya": "Pendapatan vs Biaya",
  "rasio-likuiditas": "Rasio Likuiditas",
  roa: "Pengembalian Aset (ROA)",
  roe: "Pengembalian Ekuitas (ROE)",
  "harta-bersih": "Harta Bersih",
}

export interface MonthlyMetric {
  label: string
  revenue: number
  expense: number
  netProfit: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  currentAssets: number
  currentLiabilities: number
}

export interface TrendSeries {
  key: string
  label: string
  color: string
}

export interface TrendDatum {
  label: string
  [key: string]: number | null | string
}

export type TrendUnit = "currency" | "percent" | "ratio"

export interface FinancialTrend {
  data: TrendDatum[]
  series: TrendSeries[]
  unit: TrendUnit
  kind: "bar" | "line"
  /** Seri arus boleh dijumlahkan; seri posisi/rasio tidak. */
  summable: boolean
  verdict: string
}

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

/**
 * Bucket bulanan yang menutup [start, end] tanpa saling tumpang tindih.
 *
 * Bulan pertama dimulai tepat di `period.start` (bukan awal bulan) agar entri
 * yang lebih awal dari periode tidak dihitung dua kali oleh "saldo awal" dan
 * bucket pertama.
 */
export function monthBuckets(
  period: { start: Date; end: Date },
  maxMonths = 36,
): { start: Date; end: Date; label: string }[] {
  const out: { start: Date; end: Date; label: string }[] = []
  let y = period.start.getFullYear()
  let m = period.start.getMonth()
  while (out.length < maxMonths) {
    const start = out.length === 0 ? new Date(period.start) : new Date(y, m, 1)
    if (start > period.end) break
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999)
    out.push({
      start,
      end: monthEnd > period.end ? new Date(period.end) : monthEnd,
      label: `${MONTHS_ID[m]} ${String(y).slice(2)}`,
    })
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return out
}

/** Rasio aman: `null` bila penyebut ≤ 0, bukan 0 atau Infinity. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

export function buildFinancialTrend(metrics: MonthlyMetric[], chart: FinancialChart): FinancialTrend {
  switch (chart) {
    case "perbandingan-nilai-akun":
      return {
        data: metrics.map((m) => ({
          label: m.label,
          aset: m.totalAssets,
          kewajiban: m.totalLiabilities,
          ekuitas: m.totalEquity,
        })),
        series: [
          { key: "aset", label: "Aset", color: "var(--chart-1)" },
          { key: "kewajiban", label: "Kewajiban", color: "var(--chart-2)" },
          { key: "ekuitas", label: "Ekuitas", color: "var(--chart-3)" },
        ],
        unit: "currency",
        kind: "bar",
        summable: false,
        verdict: metrics.length
          ? `Posisi akhir periode: aset ${formatCurrency(metrics[metrics.length - 1].totalAssets)}, kewajiban ${formatCurrency(metrics[metrics.length - 1].totalLiabilities)}`
          : "Tidak ada data pada periode ini",
      }

    case "pendapatan-vs-biaya":
      return {
        data: metrics.map((m) => ({ label: m.label, pendapatan: m.revenue, biaya: m.expense })),
        series: [
          { key: "pendapatan", label: "Pendapatan", color: "var(--chart-1)" },
          { key: "biaya", label: "Biaya", color: "var(--chart-4)" },
        ],
        unit: "currency",
        kind: "bar",
        summable: true,
        verdict: (() => {
          const revenue = metrics.reduce((s, m) => s + m.revenue, 0)
          const expense = metrics.reduce((s, m) => s + m.expense, 0)
          return metrics.length
            ? `Pendapatan ${formatCurrency(revenue)} − biaya ${formatCurrency(expense)} = laba ${formatCurrency(revenue - expense)}`
            : "Tidak ada data pada periode ini"
        })(),
      }

    case "rasio-likuiditas":
      return {
        data: metrics.map((m) => ({ label: m.label, rasio: safeRatio(m.currentAssets, m.currentLiabilities) })),
        series: [{ key: "rasio", label: "Rasio Lancar", color: "var(--chart-2)" }],
        unit: "ratio",
        kind: "line",
        summable: false,
        verdict: (() => {
          const last = [...metrics].reverse().find((m) => safeRatio(m.currentAssets, m.currentLiabilities) !== null)
          if (!last) return "Rasio lancar tidak dapat dihitung (kewajiban lancar nol pada semua bulan)"
          return `Rasio lancar terakhir ${safeRatio(last.currentAssets, last.currentLiabilities)!.toFixed(2).replace(".", ",")}× (${last.label})`
        })(),
      }

    case "roa":
      return {
        data: metrics.map((m) => ({
          label: m.label,
          persen: safeRatio(m.netProfit, m.totalAssets) === null ? null : safeRatio(m.netProfit, m.totalAssets)! * 100,
        })),
        series: [{ key: "persen", label: "ROA", color: "var(--chart-3)" }],
        unit: "percent",
        kind: "line",
        summable: false,
        verdict: metrics.length ? `ROA rata-rata ${averagePercent(metrics, (m) => safeRatio(m.netProfit, m.totalAssets))}` : "Tidak ada data pada periode ini",
      }

    case "roe":
      return {
        data: metrics.map((m) => ({
          label: m.label,
          persen: safeRatio(m.netProfit, m.totalEquity) === null ? null : safeRatio(m.netProfit, m.totalEquity)! * 100,
        })),
        series: [{ key: "persen", label: "ROE", color: "var(--chart-5)" }],
        unit: "percent",
        kind: "line",
        summable: false,
        verdict: metrics.length ? `ROE rata-rata ${averagePercent(metrics, (m) => safeRatio(m.netProfit, m.totalEquity))}` : "Tidak ada data pada periode ini",
      }

    case "harta-bersih":
      return {
        data: metrics.map((m) => ({ label: m.label, bersih: m.totalAssets - m.totalLiabilities })),
        series: [{ key: "bersih", label: "Harta Bersih", color: "var(--chart-1)" }],
        unit: "currency",
        kind: "line",
        summable: false,
        verdict: metrics.length
          ? `Harta bersih akhir periode ${formatCurrency(metrics[metrics.length - 1].totalAssets - metrics[metrics.length - 1].totalLiabilities)}`
          : "Tidak ada data pada periode ini",
      }
  }
}

function averagePercent(metrics: MonthlyMetric[], pick: (m: MonthlyMetric) => number | null): string {
  const values = metrics.map(pick).filter((v): v is number => v !== null)
  if (values.length === 0) return "n/a"
  const avg = (values.reduce((s, v) => s + v, 0) / values.length) * 100
  return `${avg.toFixed(1).replace(".", ",")}%`
}

export function formatTrendValue(value: number | null, unit: TrendUnit): string {
  if (value === null) return "n/a"
  if (unit === "currency") return formatAccounting(value, { zeroDash: false })
  if (unit === "percent") return `${value.toFixed(1).replace(".", ",")}%`
  return `${value.toFixed(2).replace(".", ",")}×`
}

/** Tabel pendamping grafik: satu baris per bulan, satu kolom per seri. */
export function buildFinancialTrendTable(trend: FinancialTrend): { columns: TableColumn[]; rows: TableRow[] } {
  const width = Math.max(30, Math.floor(180 / Math.max(1, trend.series.length)))
  const columns: TableColumn[] = [
    { header: "Bulan", align: "left", width: 40 },
    ...trend.series.map((s) => ({ header: s.label, align: "right" as const, width })),
  ]

  const rows: TableRow[] = trend.data.map((datum) => ({
    kind: "data" as const,
    cells: [String(datum.label), ...trend.series.map((s) => formatTrendValue(datum[s.key] as number | null, trend.unit))],
  }))

  if (trend.data.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada bulan dalam periode ini." })
    return { columns, rows }
  }

  if (trend.summable) {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: trend.series.map((s) =>
        formatTrendValue(
          trend.data.reduce((sum, datum) => sum + ((datum[s.key] as number | null) ?? 0), 0),
          trend.unit,
        ),
      ),
    })
    rows.push({
      kind: "notice",
      text: "Baris Jumlah hanya ada untuk laporan arus (pendapatan vs biaya). Angka posisi dan rasio tidak dijumlahkan karena menjumlahkan saldo/rasio antar bulan tidak berarti.",
    })
  } else {
    rows.push({
      kind: "notice",
      text: "Angka posisi dan rasio ditampilkan per bulan apa adanya — tidak ada baris Jumlah, karena menjumlahkan saldo/rasio antar bulan akan menyesatkan.",
    })
  }

  return { columns, rows }
}

export function financialTrendSummary(trend: FinancialTrend): string {
  return trend.verdict
}
