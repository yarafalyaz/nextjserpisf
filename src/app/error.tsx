"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

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
        <Button
          type="button"
          onClick={reset}
          variant="primary"
          size="sm"
        >
          Coba Lagi
        </Button>
      </div>
    </div>
  )
}
