"use client"

import { useEffect } from "react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6" style={{ textAlign: "center", padding: "48px" }}>
        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⚠️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Terjadi Kesalahan</h2>
        <p className="text-muted" style={{ marginBottom: "24px" }}>
          {error.message || "Terjadi kesalahan saat memuat halaman. Silakan coba lagi."}
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={reset} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            Coba Lagi
          </button>
          <a href="/" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">
            Ke Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
