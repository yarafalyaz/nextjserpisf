"use client"
import nextDynamic from "next/dynamic"

// Fix: recharts is a heavy lib — lazy-load client-side only
export const ProjectPipelineChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.ProjectPipelineChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-muted" /> },
)
export const RevenueChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-muted" /> },
)
export const SalesStatusChart = nextDynamic(
  () => import("@/components/dashboard/charts").then((m) => m.SalesStatusChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-muted" /> },
)
