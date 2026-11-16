"use client"

import { AlertTriangle, RotateCcw } from "@/components/ui/fontawesome-icons"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-12 text-center">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-2xs flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold text-foreground text-balance">
            Koneksi Internet Terputus
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Periksa jaringan seluler atau Wi-Fi Anda, lalu muat ulang untuk melanjutkan transaksi ERP.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-full min-h-11"
          onPress={() => window.location.reload()}
        >
          <RotateCcw className="size-4 mr-1.5" aria-hidden="true" />
          Muat Ulang
        </Button>
      </div>
    </main>
  )
}
