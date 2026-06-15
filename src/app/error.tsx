"use client"

import { useEffect } from "react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div
        className="max-w-md w-full bg-card rounded-xl border shadow-sm p-6 text-center"
        role="alert"
        aria-live="assertive"
      >
        <h2 className="text-xl font-bold mb-2">Terjadi Kesalahan</h2>
        <p className="text-muted-foreground mb-6">
          Sistem mengalami gangguan. Silakan coba lagi.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  )
}
