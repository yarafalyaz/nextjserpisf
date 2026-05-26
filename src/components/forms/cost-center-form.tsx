// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label, Textarea, Checkbox } from "@heroui/react"

export function CostCenterForm({ costCenter }: { costCenter?: any } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createCostCenter, updateCostCenter } = await import("@/actions/finance.actions")
        costCenter?.id ? await updateCostCenter(costCenter.id, formData) : await createCostCenter(formData)
        showSuccess(costCenter?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/finance/cost-centers")
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
          <Label htmlFor="code">Kode *</Label>
          <Input id="code" name="code" placeholder="Contoh: CC-001" required defaultValue={costCenter?.code ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" placeholder="Nama cost center" required defaultValue={costCenter?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={2} placeholder="Deskripsi cost center" defaultValue={costCenter?.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Checkbox name="isActive" defaultSelected={costCenter?.isActive !== false}>Aktif</Checkbox>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : costCenter?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
