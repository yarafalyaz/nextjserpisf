"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateTax } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"
import { runUiAction } from "@/components/ui/async-action"

interface TaxEditFormProps {
  tax: { id: number; name: string; rate: number }
}

export function TaxEditForm({ tax }: TaxEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const rawRate = String(formData.get("rate") ?? "").trim()
    if (rawRate !== "") {
      const rate = Number(rawRate)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        showError("Tarif pajak harus antara 0% dan 100%")
        return
      }
    }
    startTransition(async () => {
      await runUiAction(async () => {
        const result = await updateTax(tax.id, formData)
        if (!result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess("Pajak berhasil diperbarui")
        router.push("/master/pajak")
        router.refresh()
      }, "Gagal menyimpan data")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" required defaultValue={tax.name} placeholder="Nama pajak" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate">Tarif (%) *</Label>
          <Input id="rate" name="rate" type="number" min={0} max={100} step="0.01" required defaultValue={tax.rate} placeholder="0.00" />
        </div>
      </div>
      <FormActions>
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Perbarui"}
        </Button>
      </FormActions>
    </form>
  )
}
