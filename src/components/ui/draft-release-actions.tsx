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
import { entityHref, entityEditHref, type SluggedEntity } from "@/lib/utils/entity-url"

type ServerActionResult = { success: boolean; error?: string }

export interface DraftReleaseActionsProps {
  entity: SluggedEntity & { status: string }
  basePath: string
  permission: string
  releaseAction: (id: number) => Promise<ServerActionResult>
  deleteAction: (id: number) => Promise<ServerActionResult>
  releaseErrorFallback: string
  releaseSuccess: string
  deleteErrorFallback: string
  deleteSuccess: string
  releaseMenuLabel: string
  releaseDialogTitle: string
  releaseDialogBody: string
  deleteDialogTitle: string
  deleteDialogBody: string
}

export function DraftReleaseActions({
  entity,
  basePath,
  permission,
  releaseAction,
  deleteAction,
  releaseErrorFallback,
  releaseSuccess,
  deleteErrorFallback,
  deleteSuccess,
  releaseMenuLabel,
  releaseDialogTitle,
  releaseDialogBody,
  deleteDialogTitle,
  deleteDialogBody,
}: DraftReleaseActionsProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const userPerms = session?.user?.permissions ?? []
  const isSuperAdmin = (session?.user?.roles ?? []).includes("super_admin")
  const canManage = isSuperAdmin || userPerms.includes(permission)

  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<null | "release" | "delete">(null)

  if (!canManage) return null

  const isDraft = entity.status === "draft"

  function handleRelease() {
    startTransition(async () => {
      const res = await releaseAction(entity.id)
      if (!res.success) {
        showError(res.error || releaseErrorFallback)
      } else {
        showSuccess(releaseSuccess)
      }
      setDialog(null)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteAction(entity.id)
      if (!res.success) {
        showError(res.error || deleteErrorFallback)
      } else {
        showSuccess(deleteSuccess)
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
          <DropdownMenuItem onSelect={() => router.push(entityHref(basePath, entity))}>
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            Lihat Detail
          </DropdownMenuItem>
          {isDraft && (
            <>
              <DropdownMenuItem onSelect={() => router.push(entityEditHref(basePath, entity))}>
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
                {releaseMenuLabel}
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
        title={releaseDialogTitle}
        body={releaseDialogBody}
        confirmLabel="Rilis"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleRelease}
      />

      <ConfirmDialog
        isOpen={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={deleteDialogTitle}
        body={deleteDialogBody}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
