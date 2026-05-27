"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createStatisticalKeyFigure } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export default function CreateStatisticalKeyFigurePage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createStatisticalKeyFigure(formData)
      router.push("/finance/statistical-key-figures")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Angka Kunci Statistik</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama *</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit">Satuan *</Label>
            <Input id="unit" name="unit" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="value">Nilai</Label>
            <Input id="value" name="value" type="number" step="0.01" defaultValue="0" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button onClick={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
