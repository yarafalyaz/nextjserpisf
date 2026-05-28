"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button, Dropdown, Label, Description, Header, Separator, Tooltip } from "@heroui/react"
import { MoreVertical, Eye, Pencil, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ActionDropdownProps {
  viewHref?: string
  editHref?: string
  deleteAction?: (id: number) => Promise<{ success: boolean }>
  deleteId?: number
}

export function ActionDropdown({ viewHref, editHref, deleteAction, deleteId }: ActionDropdownProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  function handleAction(key: React.Key) {
    if (key === "view" && viewHref) {
      router.push(viewHref)
    } else if (key === "edit" && editHref) {
      router.push(editHref)
    } else if (key === "delete" && deleteAction && deleteId) {
      setIsDeleteOpen(true)
    }
  }

  function handleDelete() {
    if (!deleteAction || !deleteId) return
    startTransition(async () => {
      try {
        await deleteAction(deleteId)
        showSuccess("Data berhasil dihapus")
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menghapus data")
      }
      setIsDeleteOpen(false)
    })
  }

  return (
    <>
      <Tooltip delay={0}>
        <Dropdown>
          <Button isIconOnly aria-label="Menu" variant="ghost" size="sm" isDisabled={isPending}>
            <MoreVertical className="size-4" />
          </Button>
        <Dropdown.Popover>
          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Section>
              <Header>Aksi</Header>
              {viewHref && (
                <Dropdown.Item id="view" textValue="Lihat Detail">
                  <div className="flex h-8 items-start justify-center pt-px">
                    <Eye className="size-4 shrink-0 text-muted" />
                  </div>
                  <div className="flex flex-col">
                    <Label>Lihat Detail</Label>
                    <Description>Buka halaman detail</Description>
                  </div>
                </Dropdown.Item>
              )}
              {editHref && (
                <Dropdown.Item id="edit" textValue="Edit">
                  <div className="flex h-8 items-start justify-center pt-px">
                    <Pencil className="size-4 shrink-0 text-muted" />
                  </div>
                  <div className="flex flex-col">
                    <Label>Edit</Label>
                    <Description>Ubah data</Description>
                  </div>
                </Dropdown.Item>
              )}
            </Dropdown.Section>
            {deleteAction && deleteId && (
              <>
                <Separator />
                <Dropdown.Section>
                  <Dropdown.Item id="delete" textValue="Hapus" variant="danger">
                    <div className="flex h-8 items-start justify-center pt-px">
                      <Trash2 className="size-4 shrink-0 text-danger" />
                    </div>
                    <div className="flex flex-col">
                      <Label>Hapus</Label>
                      <Description>Hapus data permanen</Description>
                    </div>
                  </Dropdown.Item>
                </Dropdown.Section>
              </>
            )}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
        <Tooltip.Content>
          <p>Menu aksi</p>
        </Tooltip.Content>
      </Tooltip>

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
