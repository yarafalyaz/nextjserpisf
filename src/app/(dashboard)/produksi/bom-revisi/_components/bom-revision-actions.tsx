"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { MoreVertical, Eye, Pencil, Trash2, CheckCircle2, Send, XCircle, BadgeCheck } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Button } from "@/components/ui/shadcn/button"
import { Button as AppButton } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useSession } from "next-auth/react"
import {
  approveBomRevision,
  deleteBomRevision,
  rejectBomRevision,
  releaseBomRevision,
  submitBomRevisionForApproval,
} from "@/actions/manufacturing.actions"
import type { BomRevisionRow } from "./bom-revision-table"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

type DialogKind = null | "submit" | "approve" | "reject" | "release" | "delete"

/**
 * Row actions for a BOM revision (Accurate ACC-15901 approval flow):
 * draft/rejected → submit; pending_approval → approve/reject (perm
 * approve_bom_revisions); approved → release; draft only → delete.
 * Server enforces same guards + SoD; UI merely hides impossible actions.
 */
export function BomRevisionActions({ revision }: { revision: BomRevisionRow }) {
  const router = useRouter()
  const { data: session } = useSession()
  const userPerms = session?.user?.permissions ?? []
  const isSuperAdmin = (session?.user?.roles ?? []).includes("super_admin")
  const canManage = isSuperAdmin || userPerms.includes("manage_bom_revisions")
  const canApprove = isSuperAdmin || userPerms.includes("approve_bom_revisions")

  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [rejectReason, setRejectReason] = useState("")

  const editable = revision.status === "draft" || revision.status === "rejected"
  if (!canManage && !canApprove) return null

  function run(action: () => Promise<{ success: boolean; error?: string }>, fallback: string, success: string) {
    startTransition(async () => {
      const res = await action()
      if (!res.success) showError(res.error || fallback)
      else showSuccess(success)
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => router.push(entityHref("/produksi/bom-revisi", revision))}>
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            Lihat Detail
          </DropdownMenuItem>
          {canManage && editable && (
            <DropdownMenuItem onSelect={() => router.push(entityEditHref("/produksi/bom-revisi", revision))}>
              <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
              Ubah
            </DropdownMenuItem>
          )}
          {canManage && editable && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDialog("submit") }}>
              <Send className="size-4 text-blue-600" aria-hidden="true" />
              Ajukan Persetujuan
            </DropdownMenuItem>
          )}
          {canApprove && revision.status === "pending_approval" && (
            <>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDialog("approve") }}>
                <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                Setujui
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDialog("reject") }}>
                <XCircle className="size-4 text-red-600" aria-hidden="true" />
                Tolak
              </DropdownMenuItem>
            </>
          )}
          {canManage && revision.status === "approved" && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDialog("release") }}>
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              Rilis Revisi
            </DropdownMenuItem>
          )}
          {canManage && revision.status === "draft" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={(e) => { e.preventDefault(); setDialog("delete") }}>
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        isOpen={dialog === "submit"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Ajukan revisi BOM untuk persetujuan?"
        body="Revisi terkunci selama menunggu persetujuan. Penyetuju tidak boleh orang yang membuat revisi ini."
        confirmLabel="Ajukan"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={() => run(() => submitBomRevisionForApproval(revision.id), "Gagal mengajukan revisi", "Revisi diajukan untuk persetujuan")}
      />
      <ConfirmDialog
        isOpen={dialog === "approve"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Setujui revisi BOM ini?"
        body="Setelah disetujui, revisi dapat dirilis menjadi acuan order produksi baru."
        confirmLabel="Setujui"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={() => run(() => approveBomRevision(revision.id), "Gagal menyetujui revisi", "Revisi BOM disetujui")}
      />
      <ConfirmDialog
        isOpen={dialog === "release"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rilis revisi BOM ini?"
        body="Setelah dirilis, revisi menjadi acuan order produksi baru dan tidak dapat diubah. Revisi yang sedang berlaku akan ditandai sebagai digantikan."
        confirmLabel="Rilis"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={() => run(() => releaseBomRevision(revision.id), "Gagal merilis revisi", "Revisi BOM dirilis")}
      />
      <ConfirmDialog
        isOpen={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hapus revisi BOM ini?"
        body="Revisi draf yang dihapus tidak dapat dikembalikan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={() => run(() => deleteBomRevision(revision.id), "Gagal menghapus revisi", "Revisi BOM dihapus")}
      />

      {dialog === "reject" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Tolak revisi BOM">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Tolak revisi BOM ini?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Pembuat dapat mengubah lalu mengajukan ulang. Alasan wajib diisi.</p>
            <label className="mt-4 block text-sm font-medium" htmlFor="bom-reject-reason">Alasan penolakan</label>
            <textarea
              id="bom-reject-reason"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>Batal</Button>
              <AppButton
                variant="danger"
                isDisabled={isPending || !rejectReason.trim()}
                onClick={() => run(() => rejectBomRevision(revision.id, rejectReason), "Gagal menolak revisi", "Revisi BOM ditolak")}
              >
                Tolak
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
