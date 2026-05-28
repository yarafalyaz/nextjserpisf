"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface BrandEditFormProps {
  brand: { id: number; name: string }
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
        router.push("/master/brands")
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
          <Label htmlFor="name">Nama Brand *</Label>
          <Input id="name" name="name" placeholder="Nama brand" defaultValue={brand.name} required />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Update"}
        </Button>
      </div>
    </form>
  )
}
