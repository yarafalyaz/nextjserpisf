"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { MoreVertical, Eye, Pencil, Trash2, Printer, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Button } from "@/components/ui/shadcn/button"
import { showSuccess, showError, showProcessResult } from "@/lib/utils/toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ReasonField } from "@/components/ui/reason-field"
import { useSession } from "next-auth/react"
import { resolveEditPerm, resolveDeletePerm } from "@/lib/auth/action-perms"

interface ActionDropdownProps {
  viewHref?: string
  editHref?: string
  printAction?: () => void
  deleteAction?: (id: number, reason?: string) => Promise<{ success: boolean }>
  deleteId?: number
  /**
   * Bila diisi, dialog hapus wajib mengoleksi alasan (ReasonField) dan
   * mengirimnya sebagai argumen kedua deleteAction. Wajib untuk aksi void
   * finansial yang menolak alasan kosong (uang muka, transfer bank, setor
   * pajak) — tanpa ini menu Hapus selalu gagal senyap dari UI.
   */
  deleteReasonLabel?: string
  /** Overrides the delete confirmation title (default generic). */
  deleteConfirmTitle?: string
  /** Overrides the delete confirmation body (default generic). */
  deleteConfirmBody?: string
  /** Explicit permission required to show the edit action. If omitted, derived from ROUTE_PERMS. */
  editPermission?: string
  /** Explicit permission required to show the delete action. If omitted, derived from ROUTE_PERMS. */
  deletePermission?: string
  /** Optional extra server action rendered as a menu item (e.g. verify/post). */
  processAction?: (id: number) => Promise<{ success: boolean; error?: string; warning?: string } | void>
  processLabel?: string
  processConfirmTitle?: string
  processConfirmBody?: string
  processSuccessMessage?: string
  /** Permission required to show the process action. No entry = visible to all (still guarded server-side). */
  processPermission?: string
}

export function ActionDropdown({ viewHref, editHref, printAction, deleteAction, deleteId, deleteReasonLabel, deleteConfirmTitle, deleteConfirmBody, editPermission, deletePermission, processAction, processLabel = "Proses", processConfirmTitle, processConfirmBody, processSuccessMessage, processPermission }: ActionDropdownProps) {
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
      console.warn(`[ActionDropdown] No ROUTE_PERMS entry for edit href "${permissionHref}". Edit button will be hidden for non-super_admin users. Add an entry to src/lib/auth/action-perms.ts.`)
    }
    if (deleteAction && permissionHref && derivedDeletePerm === undefined) {
      console.warn(`[ActionDropdown] No ROUTE_PERMS delete entry for resource href "${permissionHref}". Delete button will be hidden for non-super_admin users. Add an entry to src/lib/auth/action-perms.ts.`)
    }
  }

  const canEdit = isSuperAdmin || (derivedEditPerm !== undefined && userPerms.includes(derivedEditPerm))
  const canDelete = isSuperAdmin || (derivedDeletePerm !== undefined && userPerms.includes(derivedDeletePerm))
  const canProcess = !processPermission || isSuperAdmin || userPerms.includes(processPermission)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isProcessOpen, setIsProcessOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState("")

  function handleProcess() {
    if (!processAction || !deleteId) return
    startTransition(async () => {
      try {
        const result = await processAction(deleteId)
        if (result && result.success === false) {
          throw new Error(result.error || "Gagal memproses data")
        }
        // F-2026-10-28-157-V: warning server tampil apa adanya.
        showProcessResult(result, processSuccessMessage || "Data berhasil diproses")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal memproses data")
      }
      setIsProcessOpen(false)
    })
  }

  function handleDelete() {
    if (!deleteAction || !deleteId) return
    if (deleteReasonLabel && !deleteReason.trim()) {
      showError("Alasan pembatalan wajib diisi")
      return
    }
    startTransition(async () => {
      try {
        const result = await deleteAction(deleteId, deleteReasonLabel ? deleteReason.trim() : undefined)
        if (!result?.success) {
          throw new Error((result as { error?: string } | undefined)?.error || "Gagal menghapus data")
        }
        showSuccess("Data berhasil dihapus")
        // Tanpa refresh, payload RSC daftar tetap memuat baris yang barusan
        // terhapus — list "sudah dihapus" tapi masih tampil sampai reload.
        // HandleProcess + DeleteButton sudah memanggil router.refresh().
        router.refresh()
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
  const hasProcess = !!processAction && !!deleteId && canProcess
  const hasAnyAction = hasView || hasEdit || hasDelete || hasPrint || hasProcess

  if (!hasAnyAction) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Buka menu aksi" variant="ghost" size="icon" className="size-11" disabled={isPending}>
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
          {hasProcess && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setIsProcessOpen(true)
              }}
            >
              <Check className="size-4 text-muted-foreground" aria-hidden="true" />
              {processLabel}
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
        isOpen={isProcessOpen}
        onOpenChange={setIsProcessOpen}
        title={processConfirmTitle || `${processLabel} data ini?`}
        body={
          processConfirmBody ||
          "Proses ini akan memperbarui stok dan jurnal keuangan terkait. Pastikan data sudah benar."
        }
        confirmLabel={processLabel}
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={handleProcess}
      />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onOpenChange={(open) => {
          setIsDeleteOpen(open)
          if (!open) setDeleteReason("")
        }}
        title={deleteConfirmTitle || "Hapus data ini?"}
        body={deleteConfirmBody || "Data yang dihapus tidak dapat dikembalikan. Pastikan Anda yakin sebelum melanjutkan."}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleDelete}
      >
        {deleteReasonLabel ? (
          <ReasonField
            id={`delete-reason-${deleteId ?? "row"}`}
            label={deleteReasonLabel}
            value={deleteReason}
            onChange={setDeleteReason}
            placeholder="Tulis alasan pembatalan (wajib diisi)"
            disabled={isPending}
          />
        ) : undefined}
      </ConfirmDialog>
    </>
  )
}
