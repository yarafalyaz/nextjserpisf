"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createStatisticalKeyFigure } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
            <label htmlFor="name" className="text-sm font-medium text-foreground">Nama *</label>
            <input id="name" name="name" className="form-input" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="unit" className="text-sm font-medium text-foreground">Satuan *</label>
            <input id="unit" name="unit" className="form-input" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="value" className="text-sm font-medium text-foreground">Nilai</label>
            <input id="value" name="value" type="number" step="0.01" defaultValue="0" className="form-input" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
