"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { completeReconciliation } from "@/actions/finance.actions"

/** Complete-reconciliation button. Server enforces all-matched + |difference|<0.01. */
export function CompleteReconciliationButton({ reconciliationId }: { reconciliationId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function doComplete() {
    startTransition(async () => {
      const res = await completeReconciliation(reconciliationId)
      if (!res.success) {
        showError(res.error || "Gagal menyelesaikan rekonsiliasi")
        setOpen(false)
        return
      }
      showSuccess("Rekonsiliasi diselesaikan")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <CheckCircle2 size={14} aria-hidden="true" /> Selesaikan
      </Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Selesaikan rekonsiliasi?"
        body="Semua baris harus tercocok dan selisih harus nol. Saldo akhir akan dikunci."
        confirmLabel="Selesaikan"
        cancelLabel="Batal"
        variant="accent"
        isPending={isPending}
        onConfirm={doComplete}
      />
    </>
  )
}
