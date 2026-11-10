import { Skeleton } from "@/components/ui/shadcn/skeleton"

export function TableSkeleton({ columns = 5, rows = 8 }: { columns?: number; rows?: number } = {}) {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Memuat data tabel"
      aria-busy="true"
    >
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48" />

      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 p-4 border-b border-default">
          {[...Array(columns)].map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(columns)].map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 6 }: { fields?: number } = {}) {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Memuat formulir"
      aria-busy="true"
    >
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48" />

      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Form skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(fields)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Memuat detail data"
      aria-busy="true"
    >
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48" />

      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Detail card skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-36" />
            </div>
          ))}
        </div>
      </div>

      {/* Secondary section skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 border-b border-default">
          <Skeleton className="h-5 w-32" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(4)].map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Memuat dasbor"
      aria-busy="true"
    >
      {/* Header skeleton */}
      <Skeleton className="h-8 w-48" />

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface rounded-xl border border-default shadow-sm p-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function ReportSkeleton({ wide = false }: { wide?: boolean } = {}) {
  return (
    <div
      className={`report-page-shell flex flex-col gap-4${wide ? " report-page-shell-wide" : ""}`}
      role="status"
      aria-label="Memuat laporan"
      aria-busy="true"
    >
      {/* Top command bar: breadcrumb on left, actions on right */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Filter panel */}
      <div className="rounded-xl border border-default bg-surface p-4 flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Skeleton className="h-10 w-full sm:w-[180px] rounded-lg" />
          <Skeleton className="h-10 w-full sm:w-[180px] rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Report Canvas & Paper Document */}
      <div className="report-canvas">
        <div className={`report-sheet${wide ? " report-sheet-wide" : ""} flex flex-col gap-5`}>
          {/* Letterhead */}
          <div className="flex flex-col items-center gap-2 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-3.5 w-48" />
            <div className="w-full border-b border-default my-2" />
          </div>

          {/* Metric KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="report-kpi-card flex flex-col gap-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>

          {/* Table rows */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex justify-between border-b border-default pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-default/40">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SimplePageSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Memuat halaman"
      aria-busy="true"
    >
      {/* Header skeleton */}
      <Skeleton className="h-8 w-48" />

      {/* Content skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${80 - i * 10}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
