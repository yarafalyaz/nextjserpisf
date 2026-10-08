"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { updateExpenseCategory, deleteExpenseCategory } from "@/actions/expense-category.actions"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Switch } from "@/components/ui/shadcn/switch"
import { Button } from "@/components/ui/button"

interface Props {
  category: { id: number; name: string; label: string; sortOrder: number; isActive: boolean }
}

export function EditForm({ category }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function handleDelete() {
    if (!confirm("Hapus kategori ini?")) return
    startTransition(async () => {
      const result = await deleteExpenseCategory(category.id)
      if (result && !result.success) { showError(result.error || "Gagal menghapus"); return }
      showSuccess("Kategori berhasil dihapus")
      router.push("/master/kategori-pengeluaran")
      router.refresh()
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateExpenseCategory(category.id, formData)
      if (result && !result.success) { showError(result.error || "Gagal menyimpan"); return }
      showSuccess("Kategori berhasil diperbarui")
      router.push(`/master/kategori-pengeluaran/${category.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
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
      <div className="flex justify-between mt-6 pt-5 border-t border-default">
        <Button type="button" variant="danger" onPress={handleDelete} isDisabled={isPending}>
          Hapus
        </Button>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Perbarui"}
          </Button>
        </div>
      </div>
    </form>
  )
}
