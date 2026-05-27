"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/page-header"

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
      <div className="bg-surface rounded-xl border border-default shadow-sm p-12 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="m-0 mb-2 text-xl">Terjadi Kesalahan</h2>
        <p className="text-muted mb-6">
          {error.message || "Terjadi kesalahan saat memuat halaman. Silakan coba lagi."}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onPress={reset} >
            Coba Lagi
          </Button>
          <Link href="/" >
            Ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
