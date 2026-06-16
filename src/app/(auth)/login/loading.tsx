export default function LoginLoading() {
  return (
    <div
      role="status"
      aria-label="Memuat halaman masuk"
      aria-busy="true"
      className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 animate-pulse">
        <div className="flex items-center gap-2 self-center">
          <div className="size-6 rounded-md bg-default/20" />
          <div className="h-4 w-28 bg-default/20 rounded" />
        </div>
        <div className="rounded-xl border border-default bg-surface shadow-sm">
          <div className="flex flex-col items-center gap-2 p-6 border-b border-default">
            <div className="h-6 w-44 bg-default/20 rounded" />
            <div className="h-4 w-56 bg-default/15 rounded" />
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-12 bg-default/20 rounded" />
              <div className="h-10 w-full bg-default/15 rounded-lg" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-4 w-16 bg-default/20 rounded" />
              <div className="h-10 w-full bg-default/15 rounded-lg" />
            </div>
            <div className="h-9 w-full bg-default/20 rounded-lg" />
          </div>
        </div>
        <div className="h-4 w-72 bg-default/10 rounded mx-auto" />
      </div>
    </div>
  )
}
