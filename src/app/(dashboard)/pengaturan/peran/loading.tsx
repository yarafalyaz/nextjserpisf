export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-5 w-48 bg-default rounded" />
      <div className="h-8 w-64 bg-default rounded" />
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-default rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}
