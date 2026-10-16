"use client"

import nextDynamic from "next/dynamic"

function ChartSkeleton() {
  return (
    <div
      className="h-[280px] animate-pulse rounded bg-muted"
      role="status"
      aria-label="Memuat grafik umur"
      aria-busy="true"
    />
  )
}

/**
 * recharts itu pustaka berat, jadi grafik umur dimuat di klien saja — pola yang
 * sama dengan `components/lazy/dashboard-charts.tsx`. Tanpa ini, setiap halaman
 * laporan yang menampilkan grafik ikut membawa recharts ke bundel awalnya.
 */
export const AgingChart = nextDynamic(
  () => import("@/components/reports/aging-chart").then((m) => m.AgingChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
