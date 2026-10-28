"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Undo2 } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ReasonField } from "@/components/ui/reason-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

/**
 * GL-BR-003 K2 (FIN-BR-008): pembalikan pembayaran posted beralasan.
 * Baris asal TIDAK dihapus — status jadi `reversed`, jurnal lawan dibukukan,
 * alasan tersimpan sebagai jejak audit. Penegakan tetap di server action
 * (fail-closed); UI hanya cermin (alasan wajib trim non-kosong).
 */
export function ReversePaymentButton({
  id,
  action,
  label = "Balikkan",
  title,
  body,
  onSuccess,
}: {
  id: number
  action: (id: number, reason: string) => Promise<{ success: boolean; error?: string }>
  label?: string
  title?: string
  body?: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")

  function handleReverse() {
    if (!reason.trim()) {
      showError("Alasan pembalikan wajib diisi")
      return
    }
    startTransition(async () => {
      const result = await action(id, reason.trim())
      if (result.success) {
        showSuccess("Pembayaran berhasil dibalik")
        setIsOpen(false)
        setReason("")
        onSuccess?.()
        router.refresh()
      } else {
        showError(result.error || "Gagal membalik pembayaran")
        setIsOpen(false)
      }
    })
  }

  function handleOpenChange(open: boolean) {
    if (!open) setReason("")
    setIsOpen(open)
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11 text-danger border-danger/40 hover:bg-danger/10"
        aria-label="Balikkan pembayaran"
      >
        <Undo2 size={15} className="mr-1.5" aria-hidden="true" />
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title={title || "Balikkan pembayaran ini?"}
        body={body || "Pembayaran ditandai dibalik dan jurnal kasnya dibalik. Baris asal tetap tersimpan sebagai histori — bukan dihapus."}
        confirmLabel="Balikkan Pembayaran"
        cancelLabel="Kembali"
        variant="danger"
        isPending={isPending}
        onConfirm={handleReverse}
      >
        <ReasonField
          id={`reverse-reason-${id}`}
          value={reason}
          onChange={setReason}
          disabled={isPending}
          label="Alasan pembalikan"
          placeholder="Tulis alasan pembalikan (wajib diisi)"
        />
      </ConfirmDialog>
    </>
  )
}
