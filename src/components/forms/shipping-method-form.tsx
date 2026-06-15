"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createShippingMethod, updateShippingMethod } from "@/actions/method.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"

interface ShippingMethodFormProps {
  method?: { id: number; code: string; name: string; isActive: boolean }
  generatedCode?: string
  enableAutoCode?: boolean
}

export function ShippingMethodForm({ method, generatedCode, enableAutoCode = true }: ShippingMethodFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!method
  const codeReadOnly = isEdit || enableAutoCode
  const codeDefault = method?.code ?? (enableAutoCode ? generatedCode : "") ?? ""

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateShippingMethod(method!.id, formData)
          : await createShippingMethod(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/metode-pengiriman")
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
          <Label htmlFor="code">Kode {codeReadOnly ? "" : "*"}</Label>
          <Input id="code" name="code" placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} required={!codeReadOnly} readOnly={codeReadOnly} className={codeReadOnly ? "bg-muted" : undefined} defaultValue={codeDefault} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" placeholder="Contoh: Kurir" required defaultValue={method?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <div className="flex items-center gap-2">
            <Checkbox id="sm-is-active" name="isActive" value="on" defaultChecked={method?.isActive !== false} />
            <Label htmlFor="sm-is-active">Aktif</Label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" isDisabled={isPending}>{isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
