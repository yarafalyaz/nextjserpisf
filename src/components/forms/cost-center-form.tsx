"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"

export function CostCenterForm({ costCenter }: { costCenter?: { id: number; code: string; name: string; description?: string | null; isActive?: boolean } } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createCostCenter, updateCostCenter } = await import("@/actions/finance.actions")
        const result = costCenter?.id ? await updateCostCenter(costCenter.id, formData) : await createCostCenter(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(costCenter?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/pusat-biaya")
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
          <Input id="name" name="name" placeholder="Nama pusat biaya" required defaultValue={costCenter?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={2} placeholder="Deskripsi pusat biaya" defaultValue={costCenter?.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <div className="flex items-center gap-2">
            <Checkbox id="cost-center-is-active" name="isActive" value="on" defaultChecked={costCenter?.isActive !== false} />
            <Label htmlFor="cost-center-is-active">Aktif</Label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : costCenter?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
