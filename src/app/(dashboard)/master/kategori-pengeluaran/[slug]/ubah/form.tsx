"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"
import { updateExpenseCategory, deleteExpenseCategory } from "@/actions/expense-category.actions"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Switch } from "@/components/ui/shadcn/switch"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Props {
  category: { id: number; slug: string | null; name: string; label: string; sortOrder: number; isActive: boolean }
}

export function EditForm({ category }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete() {
    setConfirmDelete(true)
  }

  function doDelete() {
    setConfirmDelete(false)
    startTransition(async () => {
      await runUiAction(async () => {
        const result = await deleteExpenseCategory(category.id)
        if (result && !result.success) { showError(result.error || "Gagal menghapus"); return }
        showSuccess("Kategori berhasil dihapus")
        router.push("/master/kategori-pengeluaran")
        router.refresh()
      }, "Gagal menghapus")
    })
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await runUiAction(async () => {
        const result = await updateExpenseCategory(category.id, formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan"); return }
        showSuccess("Kategori berhasil diperbarui")
        router.push(`/master/kategori-pengeluaran/${category.slug ?? category.id}`)
        router.refresh()
      }, "Gagal menyimpan")
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama (slug)</Label>
          <Input id="name" name="name" required defaultValue={category.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" required defaultValue={category.label} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sortOrder">Urutan</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={category.sortOrder} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="isActive">Aktif</Label>
          <div className="pt-2">
            <Switch id="isActive" name="isActive" defaultChecked={category.isActive} />
          </div>
        </div>
      </div>
      <FormActions>
        <Button
          type="button"
          variant="danger"
          className="w-full md:w-auto md:mr-auto min-h-11 md:min-h-9"
          onPress={handleDelete}
          isDisabled={isPending}
        >
          Hapus
        </Button>
        <Button
          type="button"
          className="w-full md:w-auto min-h-11 md:min-h-9"
          onPress={() => router.back()}
        >
          Batal
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="w-full md:w-auto min-h-11 md:min-h-9"
          isDisabled={isPending}
        >
          {isPending ? "Menyimpan..." : "Perbarui"}
        </Button>
      </FormActions>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(false) }}
        title={`Hapus kategori "${category.label}"?`}
        body="Kategori yang dihapus tidak dapat dikembalikan. Data pengeluaran yang memakai kategori ini akan kehilangan tautannya."
        confirmLabel="Hapus"
        variant="danger"
        isPending={isPending}
        onConfirm={doDelete}
      />
    </form>
  )
}
