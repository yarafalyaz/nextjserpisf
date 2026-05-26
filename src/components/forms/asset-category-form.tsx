// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label } from "@heroui/react"

export function AssetCategoryForm({ category }: { category?: any } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetCategory } = await import("@/actions/asset.actions")
        category?.id ? await updateAssetCategory(category.id, formData) : await createAssetCategory(formData)
        showSuccess(category?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/assets/categories")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" placeholder="Contoh: AC-001" defaultValue={category?.code ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Kategori *</Label>
          <Input id="name" name="name" placeholder="Nama kategori aset" required defaultValue={category?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="depreciationRate">Tingkat Depresiasi (%)</Label>
          <Input id="depreciationRate" name="depreciationRate" type="number" step="0.01" placeholder="0" defaultValue={category?.depreciationRate ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usefulLife">Umur Manfaat (tahun)</Label>
          <Input id="usefulLife" name="usefulLife" type="number" placeholder="0" defaultValue={category?.usefulLife ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : category?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
