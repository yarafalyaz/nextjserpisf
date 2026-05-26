"use client"

import { useState, useTransition } from "react"
import { Button, AlertDialog } from "@heroui/react"
import { Trash2 } from "lucide-react"

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
      <button
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost"
        style={{ color: "var(--color-danger)" }}
        title="Hapus"
      >
        <Trash2 size={15} />
      </button>

      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Hapus data ini?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>Data yang dihapus tidak dapat dikembalikan. Pastikan Anda yakin sebelum melanjutkan.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Batal
              </Button>
              <Button variant="danger" isPending={isPending} onPress={handleDelete}>
                Hapus
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  )
}
