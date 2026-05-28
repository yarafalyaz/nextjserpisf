export default function Loading() {
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
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-default/20 rounded" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-default last:border-0">
            {[...Array(5)].map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-default/15 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
