export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-5 w-48 bg-default rounded" />
      <div className="h-8 w-64 bg-default rounded" />
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="h-12 bg-default rounded" />
          <div className="h-12 bg-default rounded" />
          <div className="h-12 bg-default rounded" />
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <div className="h-6 w-40 bg-default rounded mb-4" />
        <div className="h-32 bg-default rounded" />
      </div>
    </div>
  )
}
