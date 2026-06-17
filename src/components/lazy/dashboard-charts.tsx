"use client"
import nextDynamic from "next/dynamic"

// Lightweight a11y-friendly skeleton reused by the dashboard charts. Exported
// as a tiny component so it has a stable accessible name and aria-busy state
// (a bare <div> is announced as nothing useful).
function ChartSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded bg-muted"
      role="status"
      aria-label="Memuat grafik"
      aria-busy="true"
    />
  )
}

// Fix: recharts is a heavy lib — lazy-load client-side only
export const ProjectPipelineChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.ProjectPipelineChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
export const RevenueChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
export const SalesStatusChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.SalesStatusChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
export const TopCustomersChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.TopCustomersChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
