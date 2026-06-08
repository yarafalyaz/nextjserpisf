"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { MoreVertical, Eye, Pencil, Trash2, Printer } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Button } from "@/components/ui/shadcn/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ActionDropdownProps {
  viewHref?: string
  editHref?: string
  printAction?: () => void
  deleteAction?: (id: number) => Promise<{ success: boolean }>
  deleteId?: number
}

export function ActionDropdown({ viewHref, editHref, printAction, deleteAction, deleteId }: ActionDropdownProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  function handleDelete() {
    if (!deleteAction || !deleteId) return
    startTransition(async () => {
      try {
        const result = await deleteAction(deleteId)
        if (!result?.success) {
          throw new Error((result as { error?: string } | undefined)?.error || "Gagal menghapus data")
        }
        showSuccess("Data berhasil dihapus")
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menghapus data")
      }
      setIsDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Menu" variant="ghost" size="icon" disabled={isPending}>
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
          {viewHref && (
            <DropdownMenuItem onSelect={() => router.push(viewHref)}>
              <Eye className="size-4 text-muted-foreground" />
              Lihat Detail
            </DropdownMenuItem>
          )}
          {editHref && (
            <DropdownMenuItem onSelect={() => router.push(editHref)}>
              <Pencil className="size-4 text-muted-foreground" />
              Ubah
            </DropdownMenuItem>
          )}
          {printAction && (
            <DropdownMenuItem onSelect={() => printAction()}>
              <Printer className="size-4 text-muted-foreground" />
              Cetak PDF
            </DropdownMenuItem>
          )}
          {deleteAction && deleteId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  setIsDeleteOpen(true)
                }}
              >
                <Trash2 className="size-4" />
                Hapus
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
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
