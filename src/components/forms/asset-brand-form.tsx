"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

export function AssetBrandForm({ brand }: { brand?: { id: number; name: string } } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetBrand, updateAssetBrand } = await import("@/actions/asset.actions")
        if (brand?.id) {

          await updateAssetBrand(brand.id, formData)

        } else {

          await createAssetBrand(formData)

        }
        showSuccess(brand?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Merek *</Label>
            <Input id="name" name="name" placeholder="Nama merek aset" required defaultValue={brand?.name ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : brand?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
