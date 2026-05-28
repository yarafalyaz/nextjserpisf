"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

export function AssetBrandForm({ brand }: { brand?: { id: number; name: string } } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetBrand, updateAssetBrand } = await import("@/actions/asset.actions")
        brand?.id ? await updateAssetBrand(brand.id, formData) : await createAssetBrand(formData)
        showSuccess(brand?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/aset/merek")
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
            <Label htmlFor="name">Nama Brand *</Label>
            <Input id="name" name="name" placeholder="Nama brand aset" required defaultValue={brand?.name ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : brand?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
