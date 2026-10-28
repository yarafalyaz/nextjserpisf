"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

interface VoidButtonProps {
  id: number
  action: (id: number, reason?: string) => Promise<{ success: boolean; error?: string }>
  label?: string
  title?: string
  body?: string
  onSuccess?: () => void
  /** BR-F139-01: wajibkan alasan trim non-kosong di sisi klien sebelum
      memanggil aksi. Aksi server tetap pemilik validasi (nol mutasi bila
      kosong); UI hanya cermin agar operator tidak menunggu round-trip. */
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
}

/**
 * Confirm + cancel (void) a posted document while keeping the record for audit.
 * Unlike delete, the record is kept and marked cancelled; the action reverses
 * its GL/stock side effects. Errors (e.g. "remove payments first") are
 * surfaced as toasts.
 */
export function VoidButton({
  id,
  action,
  label = "Batalkan",
  title,
  body,
  onSuccess,
  requireReason = false,
  reasonLabel = "Alasan pembatalan",
  reasonPlaceholder = "Tulis alasan pembatalan (wajib diisi)",
}: VoidButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")

  function handleVoid() {
    if (requireReason && !reason.trim()) {
      showError(`${reasonLabel} wajib diisi`)
      return
    }
    startTransition(async () => {
      const result = await action(id, reason.trim())
      if (result.success) {
        showSuccess("Dokumen berhasil dibatalkan")
        setIsOpen(false)
        setReason("")
        onSuccess?.()
        router.refresh()
      } else {
        showError(result.error || "Gagal membatalkan dokumen")
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
        className="text-danger border-danger/40 hover:bg-danger/10"
      >
        <Ban size={15} className="mr-1.5" aria-hidden="true" />
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title={title || "Batalkan dokumen ini?"}
        body={body || "Dokumen akan ditandai dibatalkan dan seluruh dampak jurnal serta stoknya dibalik. Tindakan ini tidak menghapus catatan."}
        confirmLabel="Batalkan Dokumen"
        cancelLabel="Kembali"
        variant="danger"
        isPending={isPending}
        onConfirm={handleVoid}
      >
        {requireReason ? (
          <div className="mt-3 flex flex-col gap-1.5">
            <label htmlFor={`void-reason-${id}`} className="text-sm font-medium">
              {reasonLabel} <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <Textarea
              id={`void-reason-${id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              aria-label={reasonLabel}
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Alasan wajib diisi dan tersimpan sebagai jejak audit pembatalan.
            </p>
          </div>
        ) : undefined}
      </ConfirmDialog>
    </>
  )
}
