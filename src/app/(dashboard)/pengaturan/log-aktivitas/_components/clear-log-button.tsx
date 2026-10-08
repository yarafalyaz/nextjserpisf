"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import { clearActivityLog } from "@/actions/activity-log.actions"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function ClearLogButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    // The action returns the deleted count, but `startTransition` requires a
    // void callback — discard it explicitly.
    startTransition(async () => {
      await clearActivityLog()
    })
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="gap-2 text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" />
        {isPending ? "Menghapus..." : "Kosongkan Log"}
      </Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Kosongkan Log Aktivitas"
        body="Yakin ingin menghapus riwayat log aktivitas? Catatan siapa yang mengosongkan log (dan kapan) akan tetap tersimpan permanen dan tidak bisa dihapus."
        confirmLabel="Ya, Kosongkan"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirm}
      />
    </>
  )
}
