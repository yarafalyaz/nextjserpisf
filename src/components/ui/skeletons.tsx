export function TableSkeleton({ columns = 5, rows = 8 }: { columns?: number; rows?: number } = {}) {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-default/20 rounded" />

      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 bg-default/20 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-default/20 rounded-lg" />
          <div className="h-10 w-28 bg-default/20 rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 p-4 border-b border-default">
          {[...Array(columns)].map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-default/20 rounded" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(columns)].map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-default/15 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 6 }: { fields?: number } = {}) {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-default/20 rounded" />

      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 bg-default/20 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-default/20 rounded-lg" />
          <div className="h-10 w-24 bg-default/20 rounded-lg" />
        </div>
      </div>

      {/* Form skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(fields)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-4 w-24 bg-default/20 rounded" />
              <div className="h-10 w-full bg-default/15 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-default/20 rounded" />

      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-56 bg-default/20 rounded" />
          <div className="h-6 w-20 bg-default/20 rounded-full" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-default/20 rounded-lg" />
          <div className="h-10 w-24 bg-default/20 rounded-lg" />
        </div>
      </div>

      {/* Detail card skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-3 w-20 bg-default/20 rounded" />
              <div className="h-5 w-36 bg-default/15 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Secondary section skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 border-b border-default">
          <div className="h-5 w-32 bg-default/20 rounded" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-default/15 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 w-48 bg-default/20 rounded" />

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface rounded-xl border border-default shadow-sm p-4">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-20 bg-default/20 rounded" />
              <div className="h-7 w-28 bg-default/15 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="h-5 w-32 bg-default/20 rounded mb-4" />
        <div className="h-64 w-full bg-default/10 rounded-lg" />
      </div>
    </div>
  )
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-default/20 rounded" />

      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 bg-default/20 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-32 bg-default/20 rounded-lg" />
          <div className="h-10 w-24 bg-default/20 rounded-lg" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-40 bg-default/15 rounded-lg" />
        ))}
      </div>

      {/* Report table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex gap-4 p-4 border-b border-default">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-default/20 rounded" />
          ))}
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(6)].map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-default/15 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SimplePageSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 w-48 bg-default/20 rounded" />

      {/* Content skeleton */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="flex flex-col gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-default/15 rounded" style={{ width: `${80 - i * 10}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
