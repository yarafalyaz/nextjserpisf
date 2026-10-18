"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { unmatchReconciliationLine } from "@/actions/finance.actions"

// Tombol pembatal kecocokan: satu-satunya UI yang memanggil
// unmatchReconciliationLine. Server hanya mengizinkan hapus bila rekonsiliasi
// masih draft dan item milik rekonsiliasi ini.
export function UnmatchButton({
  reconciliationId,
  itemId,
}: {
  reconciliationId: number
  itemId: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function doUnmatch() {
    startTransition(async () => {
      const res = await unmatchReconciliationLine(reconciliationId, itemId)
      if (!res.success) {
        showError(res.error || "Gagal membatalkan kecocokan")
        setOpen(false)
        return
      }
      showSuccess("Kecocokan dibatalkan")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={isPending}>
        <XCircle size={14} aria-hidden="true" /> Batalkan
      </Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Batalkan kecocokan baris ini?"
        body="Item kecocokan akan dihapus. Baris rekening koran kembali belum cocok."
        confirmLabel="Batalkan"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={doUnmatch}
      />
    </>
  )
}
