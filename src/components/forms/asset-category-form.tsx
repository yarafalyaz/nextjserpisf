"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

export function AssetCategoryForm({ category }: { category?: { id: number; name: string; code?: string | null; depreciationRate?: number | null; usefulLife?: number | null } } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetCategory, updateAssetCategory } = await import("@/actions/asset.actions")
        const result = category?.id ? await updateAssetCategory(category.id, formData) : await createAssetCategory(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(category?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
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
            <Input id="depreciationRate" name="depreciationRate" type="number" step="0.01" min="0" placeholder="0" defaultValue={category?.depreciationRate ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usefulLife">Umur Manfaat (tahun)</Label>
            <Input id="usefulLife" name="usefulLife" type="number" min="0" placeholder="0" defaultValue={category?.usefulLife ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : category?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
