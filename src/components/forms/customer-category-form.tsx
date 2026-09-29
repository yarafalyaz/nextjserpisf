"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

export function CustomerCategoryForm({
  category,
}: {
  category?: { id: number; name: string; downPaymentPercent?: number | null }
} = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createCustomerCategory, updateCustomerCategory } = await import("@/actions/master.actions")
        const result = category?.id
          ? await updateCustomerCategory(category.id, formData)
          : await createCustomerCategory(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess(category?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/kategori-pelanggan")
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
            <Label htmlFor="name">Nama Kategori *</Label>
            <Input id="name" name="name" placeholder="Nama kategori pelanggan" required defaultValue={category?.name ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="downPaymentPercent">Persentase Uang Muka (DP) (%) *</Label>
            <Input
              id="downPaymentPercent"
              name="downPaymentPercent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0"
              required
              defaultValue={category?.downPaymentPercent ?? "0"}
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-customer-category">
            {isPending ? "Menyimpan..." : category?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
