"use client"

import { useRouter } from "next/navigation"

import { cancelTaxAssessment } from "@/actions/tax-dispute.actions"
import { ReasonField } from "@/components/ui/reason-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError } from "@/lib/utils/toast"
import { useConfirmReasonAction } from "@/components/ui/confirm-reason-action"
import { Button } from "@/components/ui/button"

/**
 * Batal ketetapan sengketa (AC-TXD-B6: hanya status BATAL, hapus fisik mustahil).
 * Alasan wajib — guard di pemanggil, aksi server pemilik validasi.
 */
export function CancelTaxAssessmentButton({ id }: { id: number }) {
  const router = useRouter()
  const { isPending, isOpen, setIsOpen, reason, setReason, submit, handleOpenChange } =
    useConfirmReasonAction({
      run: (trimmedReason: string) => {
        const formData = new FormData()
        formData.set("id", String(id))
        formData.set("reason", trimmedReason)
        return cancelTaxAssessment(formData)
      },
      successMessage: "Ketetapan berhasil dibatalkan",
      errorFallback: "Gagal membatalkan ketetapan",
      onSuccess: () => router.refresh(),
    })

  function handleCancel() {
    if (!reason.trim()) {
      showError("Alasan pembatalan wajib diisi")
      return
    }
    submit()
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        isDisabled={isPending}
        onClick={() => setIsOpen(true)}
        aria-label="Batalkan ketetapan pajak"
        className="relative text-danger border-danger/40 hover:bg-danger/10 before:absolute before:-inset-y-1.5 before:content-['']"
      >
        Batalkan
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title="Batalkan ketetapan pajak?"
        body="Ketetapan dibatalkan (status BATAL), bukan dihapus fisik. Upaya baru atas ketetapan ini ditolak."
        confirmLabel={isPending ? "Membatalkan…" : "Ya, Batalkan"}
        onConfirm={handleCancel}
      >
        <ReasonField
          id="cancel-tax-assessment-reason"
          label="Alasan pembatalan"
          value={reason}
          onChange={setReason}
          placeholder="Tulis alasan pembatalan (wajib diisi)"
        />
      </ConfirmDialog>
    </>
  )
}
