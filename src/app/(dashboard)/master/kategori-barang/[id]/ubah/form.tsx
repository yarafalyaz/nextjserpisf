"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateItemCategory } from "@/actions/master.actions"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"

interface ItemCategoryEditFormProps {
  category: { id: number; name: string; description: string | null; parentId: number | null }
}

export function ItemCategoryEditForm({ category }: ItemCategoryEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateItemCategory(category.id, formData)
      router.push("/master/kategori-barang")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label>Nama *</Label>
          <Input name="name" required defaultValue={category.name} placeholder="Nama kategori" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Deskripsi</Label>
          <Input name="description" defaultValue={category.description || ""} placeholder="Deskripsi kategori" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Perbarui"}
        </Button>
      </div>
    </form>
  )
}
