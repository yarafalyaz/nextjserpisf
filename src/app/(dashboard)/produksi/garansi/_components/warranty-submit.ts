"use client"

import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"

import { showSuccess, showError } from "@/lib/utils/toast"

export type WarrantyAction = (
  fd: FormData,
) => Promise<{ success: boolean; error?: string; id?: number } | undefined>

/**
 * Rangka kirim klaim garansi (pola rangka dokumen pajak, module sendiri
 * supaya tidak mengimpor lintas modul).
 *
 * Galat service ditampilkan verbatim lewat toast; kunci idempotency diputar
 * sesudah sukses. Tidak ada logika garansi di sini — aksi server yang
 * menegakkan state machine dan izin.
 */
export function useWarrantySubmit(successText: string, fallbackText: string) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  function run(action: WarrantyAction, formData: FormData, navigateTo?: string) {
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result && !result.success) {
          showError(result.error || fallbackText)
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(successText)
        if (navigateTo) router.push(navigateTo)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : fallbackText)
      }
    })
  }

  return { isPending, idempotencyKeyRef, run }
}

/** Varian tanpa navigasi untuk aksi atas klaim yang sudah ada (detail). */
export function useWarrantyAction(fallbackText = "Gagal memproses klaim garansi") {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(action: WarrantyAction, formData: FormData, successText: string) {
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result && !result.success) {
          showError(result.error || fallbackText)
          return
        }
        showSuccess(successText)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : fallbackText)
      }
    })
  }

  return { isPending, run }
}
