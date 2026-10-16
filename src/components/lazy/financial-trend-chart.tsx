"use client"

import nextDynamic from "next/dynamic"

function ChartSkeleton() {
  return (
    <div
      className="h-[320px] animate-pulse rounded bg-muted"
      role="status"
      aria-label="Memuat grafik keuangan"
      aria-busy="true"
    />
  )
}

/**
 * recharts itu pustaka berat, jadi grafik keuangan dimuat di klien saja — pola
 * yang sama dengan `components/lazy/aging-chart.tsx`. Tanpa ini, setiap halaman
 * laporan yang menampilkan grafik ikut membawa recharts ke bundel awalnya.
 */
export const FinancialTrendChart = nextDynamic(
  () => import("@/components/reports/financial-trend-chart").then((m) => m.FinancialTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
