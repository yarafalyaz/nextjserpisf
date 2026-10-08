"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { MoreVertical, Eye, Pencil, Trash2, CheckCircle2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useSession } from "next-auth/react"
import { deleteQcChecklist, releaseQcChecklist } from "@/actions/qc.actions"
import type { QcChecklistRow } from "./qc-checklist-table"

/**
 * Row actions for a QC checklist: view, edit (draft only), release (draft only),
 * delete (draft + unused only). The server enforces the same guards.
 */
export function QcChecklistActions({ checklist }: { checklist: QcChecklistRow }) {
  const router = useRouter()
  const { data: session } = useSession()
  const userPerms = session?.user?.permissions ?? []
  const isSuperAdmin = (session?.user?.roles ?? []).includes("super_admin")
  const canManage = isSuperAdmin || userPerms.includes("manage_qc_checklists")

  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<null | "release" | "delete">(null)

  if (!canManage) return null

  const isDraft = checklist.status === "draft"

  function handleRelease() {
    startTransition(async () => {
      const res = await releaseQcChecklist(checklist.id)
      if (!res.success) showError(res.error || "Gagal merilis checklist")
      else showSuccess("Checklist QC dirilis")
      setDialog(null)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteQcChecklist(checklist.id)
      if (!res.success) showError(res.error || "Gagal menghapus checklist")
      else showSuccess("Checklist QC dihapus")
      setDialog(null)
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Buka menu aksi" variant="ghost" size="icon" disabled={isPending}>
            <MoreVertical className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => router.push(`/produksi/qc/checklist/${checklist.id}`)}>
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            Lihat Detail
          </DropdownMenuItem>
          {isDraft && (
            <>
              <DropdownMenuItem onSelect={() => router.push(`/produksi/qc/checklist/${checklist.id}/ubah`)}>
                <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                Ubah
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  setDialog("release")
                }}
              >
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                Rilis Checklist
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  setDialog("delete")
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
        isOpen={dialog === "release"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rilis checklist QC ini?"
        body="Setelah dirilis, checklist dibekukan dan menjadi acuan inspeksi. Perubahan berikutnya harus membuat versi baru."
        confirmLabel="Rilis"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleRelease}
      />

      <ConfirmDialog
        isOpen={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hapus checklist QC ini?"
        body="Checklist draft yang dihapus tidak dapat dikembalikan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
