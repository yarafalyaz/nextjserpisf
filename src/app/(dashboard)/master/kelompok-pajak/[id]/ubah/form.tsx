"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateTaxGroup } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/page-header"

interface Props {
  id: number
  name: string
  selectedTaxIds: number[]
  taxes: { id: number; name: string; rate: number }[]
}

export function TaxGroupEditForm({ id, name, selectedTaxIds, taxes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateTaxGroup(id, formData)
      if (res && !res.success) { showError(res.error || "Gagal menyimpan data"); return }
      showSuccess("Data berhasil diperbarui")
      router.push("/master/kelompok-pajak")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Grup *</Label>
          <Input id="name" name="name" required defaultValue={name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Pajak</label>
          <div className="flex flex-col gap-2">
            {taxes.map((tax) => (
              <label key={tax.id} htmlFor={`tax-${tax.id}`} className="flex items-center gap-2 cursor-pointer">
                <Checkbox id={`tax-${tax.id}`} name="taxIds" value={String(tax.id)} defaultChecked={selectedTaxIds.includes(tax.id)} />
                {tax.name} ({tax.rate}%)
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : "Perbarui"}</Button>
      </div>
    </form>
  )
}
