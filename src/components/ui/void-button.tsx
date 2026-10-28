"use client"

import { Ban } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ReasonField } from "@/components/ui/reason-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError } from "@/lib/utils/toast"
import { useConfirmReasonAction } from "@/components/ui/confirm-reason-action"

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
  const { isPending, isOpen, setIsOpen, reason, setReason, submit, handleOpenChange } =
    useConfirmReasonAction({
      run: (trimmed: string) => action(id, requireReason ? trimmed : undefined),
      successMessage: "Dokumen berhasil dibatalkan",
      errorFallback: "Gagal membatalkan dokumen",
      onSuccess,
    })

  function handleVoid() {
    if (requireReason && !reason.trim()) {
      showError(`${reasonLabel} wajib diisi`)
      return
    }
    submit()
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
          <ReasonField
            id={`void-reason-${id}`}
            value={reason}
            onChange={setReason}
            disabled={isPending}
            label={reasonLabel}
            placeholder={reasonPlaceholder}
          />
        ) : undefined}
      </ConfirmDialog>
    </>
  )
}
