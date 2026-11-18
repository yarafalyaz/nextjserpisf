"use client"

import { useEffect, useState } from "react"
import { Download, X } from "@/components/ui/fontawesome-icons"
import { showError } from "@/lib/utils/toast"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "yaraerp_pwa_install_dismissed"

export function PwaRegistrar() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch((err) => {
          console.warn("[PWA] Service worker registration skipped:", err)
        })
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      try {
        if (window.localStorage.getItem(DISMISS_KEY) === "1") {
          setDismissed(true)
          return
        }
      } catch (err) {
        console.warn("[PWA] Storage read unavailable:", err)
        setDismissed(false)
      }
      setInstallEvent(e as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
  }, [])

  if (!installEvent || dismissed) return null

  async function handleInstall() {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstallEvent(null)
      }
    } catch (err) {
      showError(err instanceof Error && err.message ? err.message : "Gagal memasang aplikasi")
    }
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
      setDismissed(true)
    } catch (err) {
      console.warn("[PWA] Storage write unavailable:", err)
      setDismissed(true)
    }
  }

  return (
    <div
      role="region"
      aria-label="Pasang aplikasi"
      className="no-print fixed inset-x-3 bottom-16 z-40 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-sm md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">Pasang YaraERP</p>
        <p className="text-[11px] text-muted-foreground truncate">
          Akses lebih cepat layar penuh seperti aplikasi native
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 min-h-11 text-xs font-medium text-primary-foreground active:scale-[0.98]"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Pasang
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Tutup ajakan pasang aplikasi"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
