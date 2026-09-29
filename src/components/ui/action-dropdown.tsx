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
import { useSession } from "next-auth/react"
import { resolveEditPerm, resolveDeletePerm } from "@/lib/auth/action-perms"

interface ActionDropdownProps {
  viewHref?: string
  editHref?: string
  printAction?: () => void
  deleteAction?: (id: number) => Promise<{ success: boolean }>
  deleteId?: number
  /** Permission required to show the edit action. Omit to always show. */
  editPermission?: string
  /** Permission required to show the delete action. Omit to always show. */
  deletePermission?: string
}

export function ActionDropdown({ viewHref, editHref, printAction, deleteAction, deleteId, editPermission, deletePermission }: ActionDropdownProps) {
  const { data: session } = useSession()
  const userRoles = session?.user?.roles ?? []
  const userPerms = session?.user?.permissions ?? []
  const isSuperAdmin = userRoles.includes("super_admin")

  // Resolve permissions from the resource path even when a row has no edit link.
  const permissionHref = editHref ?? viewHref
  const derivedEditPerm = editPermission ?? resolveEditPerm(permissionHref)
  const derivedDeletePerm = deletePermission ?? resolveDeletePerm(permissionHref)

  if (process.env.NODE_ENV !== "production") {
    if (editHref && derivedEditPerm === undefined) {
      console.warn(`[ActionDropdown] No ROUTE_PERMS entry for edit href "${permissionHref}". Edit button will show for all users. Add an entry to src/lib/auth/action-perms.ts.`)
    }
    if (deleteAction && permissionHref && derivedDeletePerm === undefined) {
      console.warn(`[ActionDropdown] No ROUTE_PERMS delete entry for resource href "${permissionHref}". Delete button will show for all users.`)
    }
  }

  const canEdit = isSuperAdmin || (derivedEditPerm !== undefined && userPerms.includes(derivedEditPerm))
  const canDelete = isSuperAdmin || (derivedDeletePerm !== undefined && userPerms.includes(derivedDeletePerm))
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

  const hasView = !!viewHref
  const hasEdit = !!editHref && canEdit
  const hasDelete = !!deleteAction && !!deleteId && canDelete
  const hasPrint = !!printAction
  const hasAnyAction = hasEdit || hasDelete || hasPrint

  if (!hasAnyAction) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Buka menu aksi" variant="ghost" size="icon" disabled={isPending}>
            <MoreVertical className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
          {viewHref && (
            <DropdownMenuItem onSelect={() => router.push(viewHref)}>
              <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
              Lihat Detail
            </DropdownMenuItem>
          )}
          {editHref && canEdit && (
            <DropdownMenuItem onSelect={() => router.push(editHref)}>
              <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
              Ubah
            </DropdownMenuItem>
          )}
          {printAction && (
            <DropdownMenuItem onSelect={() => printAction()}>
              <Printer className="size-4 text-muted-foreground" aria-hidden="true" />
              Cetak PDF
            </DropdownMenuItem>
          )}
          {deleteAction && deleteId && canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  setIsDeleteOpen(true)
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
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
