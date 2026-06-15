"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

interface VoidButtonProps {
  id: number
  action: (id: number) => Promise<{ success: boolean; error?: string }>
  label?: string
  title?: string
  body?: string
  onSuccess?: () => void
}

/**
 * Confirm + cancel (void) a posted document. Unlike delete, the record is kept
 * and marked cancelled; the action reverses its GL/stock side effects. Errors
 * (e.g. "remove payments first") are surfaced as toasts.
 */
export function VoidButton({ id, action, label = "Batalkan", title, body, onSuccess }: VoidButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  function handleVoid() {
    startTransition(async () => {
      const result = await action(id)
      if (result.success) {
        showSuccess("Dokumen berhasil dibatalkan")
        setIsOpen(false)
        onSuccess?.()
        router.refresh()
      } else {
        showError(result.error || "Gagal membatalkan dokumen")
        setIsOpen(false)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        variant="outline"
        size="sm"
        className="text-danger border-danger/40 hover:bg-danger/10"
      >
        <Ban size={15} className="mr-1.5" aria-hidden="true" />
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={title || "Batalkan dokumen ini?"}
        body={body || "Dokumen akan ditandai dibatalkan dan seluruh dampak jurnal serta stoknya dibalik. Tindakan ini tidak menghapus catatan."}
        confirmLabel="Batalkan Dokumen"
        cancelLabel="Kembali"
        variant="danger"
        isPending={isPending}
        onConfirm={handleVoid}
      />
    </>
  )
}
