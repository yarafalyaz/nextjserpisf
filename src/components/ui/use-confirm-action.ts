"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { showSuccess, showError } from "@/lib/utils/toast"

/**
 * Mesin konfirmasi beralasan bersama (VoidButton, ReversePaymentButton).
 * Satu sumber: toast sukses/gagal, tutup dialog + reset alasan, refresh.
 * Pengecekan alasan tetap di pemanggil (pesan tiap tombol beda).
 */
export function useConfirmAction({
  onSuccess,
  successMessage,
  errorMessage,
}: {
  onSuccess?: () => void
  successMessage: string
  errorMessage: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")

  function handleOpenChange(open: boolean) {
    if (!open) setReason("")
    setIsOpen(open)
  }

  function runConfirm(run: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await run()
      if (result.success) {
        showSuccess(successMessage)
        setIsOpen(false)
        setReason("")
        onSuccess?.()
        router.refresh()
      } else {
        showError(result.error || errorMessage)
        setIsOpen(false)
      }
    })
  }

  return { isPending, isOpen, setIsOpen, reason, setReason, handleOpenChange, runConfirm }
}
