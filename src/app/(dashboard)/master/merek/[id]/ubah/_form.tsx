"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"

interface BrandEditFormProps {
  brand: { id: number; name: string; description: string | null }
}

export function BrandEditForm({ brand }: BrandEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await updateBrand(brand.id, formData)
        showSuccess("Brand berhasil diperbarui")
        router.push("/master/merek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Merek *</Label>
          <Input id="name" name="name" placeholder="Nama merek" defaultValue={brand.name} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi merek (opsional)" defaultValue={brand.description ?? ""} />
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
