"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateStatisticalKeyFigure } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"

export function KeyFigureEditForm({ id, name, unit, value }: { id: number; name: string; unit: string; value: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateStatisticalKeyFigure(id, formData)
      if (res && !res.success) { showError(res.error || "Gagal menyimpan data"); return }
      showSuccess("Data berhasil diperbarui")
      router.push("/keuangan/angka-kunci-statistik")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" required defaultValue={name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit">Satuan *</Label>
          <Input id="unit" name="unit" required defaultValue={unit} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value">Nilai</Label>
          <Input id="value" name="value" type="number" step="0.01" defaultValue={value} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : "Perbarui"}</Button>
      </div>
    </form>
  )
}
