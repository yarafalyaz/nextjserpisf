"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

interface DeleteButtonProps {
  id: number
  action: (id: number) => Promise<{ success: boolean; error?: string } | void>
  onSuccess?: () => void
}

export function DeleteButton({ id, action, onSuccess }: DeleteButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await action(id)
        // Actions that redirect() return void (navigation handles feedback).
        if (result && result.success === false) {
          showError(result.error || "Gagal menghapus data")
          setIsOpen(false)
          return
        }
        showSuccess("Data berhasil dihapus")
        setIsOpen(false)
        onSuccess?.()
        router.refresh()
      } catch (e) {
        // A server action that redirect()s surfaces a NEXT_REDIRECT error; let the
        // framework handle the navigation instead of showing a false error toast.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e
        }
        showError(e instanceof Error ? e.message : "Gagal menghapus data")
        setIsOpen(false)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        variant="destructive"
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
