"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/shadcn/button"
import { AlertTriangle } from "lucide-react"

export default function ModuleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex items-center justify-center p-12">
      <div
        className="max-w-md w-full bg-surface rounded-xl border border-default shadow-sm p-6 text-center"
        role="alert"
        aria-live="assertive"
      >
        <div className="mb-4 flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/15">
            <AlertTriangle className="size-6 text-amber-500" />
          </div>
        </div>
        <h2 className="text-lg font-bold mb-2 text-foreground">Terjadi Kesalahan</h2>
        <p className="text-sm text-muted-foreground mb-6">{error.message || "Silakan coba lagi"}</p>
        <div className="flex justify-center">
          <Button onClick={reset} variant="default">Coba Lagi</Button>
        </div>
      </div>
    </div>
  )
}
