"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { showSuccess, showError } from "@/lib/utils/toast"

/**
 * Plumbing bersama tombol konfirmasi beralasan (VoidButton,
 * ReversePaymentButton): state dialog + alasan + submit.
 * Dipisah agar Sonar tidak menghitung rangka submit identik sebagai
 * duplikasi; teks sukses/gagal + validasi alasan tetap milik pemanggil.
 *
 * Guard alasan kosong milik pemanggil (mis. VoidButton requireReason):
 * pemanggil TANPA alasan (run tanpa argumen) tidak boleh ditolak hook —
 * hook hanya menjalankan run apa adanya.
 */
export function useConfirmReasonAction({
  run,
  successMessage,
  errorFallback,
  onSuccess,
}: {
  run: (reason: string) => Promise<{ success: boolean; error?: string }>
  successMessage: string
  errorFallback: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")

  function submit() {
    startTransition(async () => {
      const result = await run(reason.trim())
      if (result.success) {
        showSuccess(successMessage)
        setIsOpen(false)
        setReason("")
        onSuccess?.()
        router.refresh()
      } else {
        showError(result.error || errorFallback)
        setIsOpen(false)
      }
    })
  }

  function handleOpenChange(open: boolean) {
    if (!open) setReason("")
    setIsOpen(open)
  }

  return { isPending, isOpen, setIsOpen, reason, setReason, submit, handleOpenChange }
}
