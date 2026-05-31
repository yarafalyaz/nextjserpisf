"use client"

import { useState, useTransition } from "react"
import { Button } from "@heroui/react"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface DeleteButtonProps {
  id: number
  action: (id: number) => Promise<{ success: boolean }>
  onSuccess?: () => void
}

export function DeleteButton({ id, action }: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      await action(id)
      setIsOpen(false)
    })
  }

  return (
    <>
      <Button
        onPress={() => setIsOpen(true)}
        isDisabled={isPending}
        variant="danger"
        size="sm"
        aria-label="Hapus"
      >
        <Trash2 size={15} />
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Hapus data ini?"
        body="Data yang dihapus tidak dapat dikembalikan. Pastikan Anda yakin sebelum melanjutkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
