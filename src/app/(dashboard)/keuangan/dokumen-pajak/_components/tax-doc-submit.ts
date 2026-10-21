"use client"

import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"

import { showSuccess, showError } from "@/lib/utils/toast"

export interface TaxOption {
  value: string
  label: string
}

export type TaxDocAction = (
  fd: FormData,
) => Promise<{ success: boolean; error?: string } | undefined>

/**
 * Rangka kirim dokumen pajak bersama (faktur + bupot).
 *
 * Satu jalur untuk semua aksi `tax-documents.actions.ts`: kunci idempotency
 * diputar sesudah sukses, galat service tampil verbatim lewat toast, lalu
 * router didorong ke tujuan. Disimpan sekali di sini — dua form pajak dulu
 * menyalin blok ini mentah-mentah sampai Sonar menandainya duplikasi.
 */
export function useTaxDocSubmit(successText: string, fallbackText: string, navigateTo: string) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  function run(action: TaxDocAction, formData: FormData) {
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result && !result.success) {
          showError(result.error || fallbackText)
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(successText)
        router.push(navigateTo)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : fallbackText)
      }
    })
  }

  return { isPending, idempotencyKeyRef, run }
}

/** Varian tanpa navigasi: untuk aksi atas dokumen yang sudah terbit. */
export function useTaxDocAction(fallbackText = "Gagal memproses dokumen pajak") {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(action: TaxDocAction, formData: FormData, successText: string) {
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
