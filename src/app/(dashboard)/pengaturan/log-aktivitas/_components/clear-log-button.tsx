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
    startTransition(() => clearActivityLog())
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
        body="Yakin ingin menghapus semua log aktivitas? Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Ya, Kosongkan"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirm}
      />
    </>
  )
}
