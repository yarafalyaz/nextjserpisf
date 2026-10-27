import { Skeleton } from "@/components/ui/shadcn/skeleton"

/**
 * Boundary loading akar: fallback untuk rute di luar grup yang punya
 * `loading.tsx` sendiri — saat ini hanya `/setup` dan dua halaman statis
 * di grup `(auth)` (`kebijakan-privasi`, `ketentuan-layanan`).
 * Rute dalam `(dashboard)` dan `(auth)/login` tidak terpengaruh:
 * boundary terdekat dari segmen itu yang menang.
 */
export default function RootLoading() {
  return (
    <div
      role="status"
      aria-label="Memuat halaman"
      aria-busy="true"
      className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
    >
      <div className="flex w-full max-w-2xl flex-col gap-6 animate-pulse">
        <Skeleton className="h-6 w-40" />
        <div className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
      </div>
    </div>
  )
}
