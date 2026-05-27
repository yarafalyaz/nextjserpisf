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
      <Button
        onPress={() => setIsOpen(true)}
        isDisabled={isPending}
        variant="danger"
        size="sm"
      >
        <Trash2 size={15} />
      </Button>

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
