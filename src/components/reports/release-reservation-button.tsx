"use client"

import { Button } from "@/components/ui/button"
import { ReasonField } from "@/components/ui/reason-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError } from "@/lib/utils/toast"
import { useConfirmReasonAction } from "@/components/ui/confirm-reason-action"
import { releaseStockReservation } from "@/actions/manufacturing.actions"

/**
 * BR-RES-09 / AC-RES-6: lepas manual SATU reservasi aktif, dengan alasan
 * wajib. Jejak siapa/kapan/alasan tersimpan di baris reservasi + ActivityLog.
 *
 * Sebelum ini action-nya hanya terjangkau dari kode: reservasi aktif yang
 * sudah tidak dibutuhkan tetap mengunci stok sampai lazy-expire 14 hari
 * (`STOCK_RESERVATION_EXPIRY_DAYS`), dan tidak ada tombol untuk melepasnya
 * lebih awal. Reservasi yang lewat tenggat memang kedaluwarsa sendiri, jadi
 * ini bukan jalan buntu — tetapi operator tidak punya kendali atas stok yang
 * masih ditahan padahal job-nya sudah tidak butuh.
 *
 * Gerbang izin milik pemanggil (`canRelease`), sama seperti VoidButton:
 * halaman hanya menuntut view_work_orders, sedangkan action menuntut
 * complete_work_orders.
 */
export function ReleaseReservationButton({
  reservationId,
  label = "Lepas",
  canRelease = true,
}: {
  reservationId: number
  label?: string
  canRelease?: boolean
}) {
  const { isPending, isOpen, setIsOpen, reason, setReason, submit, handleOpenChange } =
    useConfirmReasonAction({
      run: (trimmed) => releaseStockReservation(reservationId, trimmed),
      successMessage: "Reservasi stok dilepas",
      errorFallback: "Gagal melepas reservasi",
    })

  if (!canRelease) return null

  function handleRelease() {
    if (!reason.trim()) {
      showError("Alasan pelepasan reservasi wajib diisi")
      return
    }
    submit()
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        isDisabled={isPending}
        onPress={() => setIsOpen(true)}
        className="min-h-11"
      >
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title="Lepas reservasi stok ini?"
        body="Stok yang ditahan reservasi ini kembali tersedia untuk pesanan lain. Baris reservasi tetap tersimpan sebagai histori pelepasan."
        confirmLabel="Lepas Reservasi"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleRelease}
      >
        <ReasonField
          id={`release-reason-${reservationId}`}
          value={reason}
          onChange={setReason}
          disabled={isPending}
          label="Alasan pelepasan"
          placeholder="Tulis alasan pelepasan reservasi (wajib diisi)"
        />
      </ConfirmDialog>
    </>
  )
}
