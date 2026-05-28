"use client"

import { useEffect } from "react"
import { Button } from "@heroui/react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error:", error)
  }, [error])

  return (
    <html>
      <body className="bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface rounded-xl border border-default shadow-sm p-6 text-center">
            <h2 className="text-xl font-bold mb-2">Terjadi Kesalahan</h2>
            <p className="text-muted mb-4">Sistem mengalami gangguan. Silakan coba lagi.</p>
            <Button variant="primary" onPress={reset}>Coba Lagi</Button>
          </div>
        </div>
      </body>
    </html>
  )
}
