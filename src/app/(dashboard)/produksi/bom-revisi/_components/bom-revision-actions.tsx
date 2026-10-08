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
import { deleteBomRevision, releaseBomRevision } from "@/actions/manufacturing.actions"
import type { BomRevisionRow } from "./bom-revision-table"

/**
 * Row actions for a BOM revision: view detail, edit (draft only), release
 * (draft only), delete (draft only). The server enforces the same status
 * guards; the UI merely hides actions that would certainly fail.
 */
export function BomRevisionActions({ revision }: { revision: BomRevisionRow }) {
  const router = useRouter()
  const { data: session } = useSession()
  const userPerms = session?.user?.permissions ?? []
  const isSuperAdmin = (session?.user?.roles ?? []).includes("super_admin")
  const canManage = isSuperAdmin || userPerms.includes("manage_bom_revisions")

  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<null | "release" | "delete">(null)

  if (!canManage) return null

  const isDraft = revision.status === "draft"

  function handleRelease() {
    startTransition(async () => {
      const res = await releaseBomRevision(revision.id)
      if (!res.success) {
        showError(res.error || "Gagal merilis revisi")
      } else {
        showSuccess("Revisi BOM dirilis")
      }
      setDialog(null)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteBomRevision(revision.id)
      if (!res.success) {
        showError(res.error || "Gagal menghapus revisi")
      } else {
        showSuccess("Revisi BOM dihapus")
      }
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
          <DropdownMenuItem onSelect={() => router.push(`/produksi/bom-revisi/${revision.id}`)}>
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            Lihat Detail
          </DropdownMenuItem>
          {isDraft && (
            <>
              <DropdownMenuItem onSelect={() => router.push(`/produksi/bom-revisi/${revision.id}/ubah`)}>
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
                Rilis Revisi
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
        title="Rilis revisi BOM ini?"
        body="Setelah dirilis, revisi menjadi acuan order produksi baru dan tidak dapat diubah. Revisi yang sedang berlaku akan ditandai superseded."
        confirmLabel="Rilis"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleRelease}
      />

      <ConfirmDialog
        isOpen={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hapus revisi BOM ini?"
        body="Revisi draft yang dihapus tidak dapat dikembalikan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
