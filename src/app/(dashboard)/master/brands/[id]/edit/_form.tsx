"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

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
          <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Brand *</label>
          <input id="name" name="name" className="form-input" placeholder="Nama brand" defaultValue={brand.name} required />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          {isPending ? "Menyimpan..." : "Update"}
        </button>
      </div>
    </form>
  )
}
