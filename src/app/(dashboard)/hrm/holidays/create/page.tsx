"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createHoliday } from "@/actions/hrm.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default function CreateHolidayPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createHoliday(formData)
      router.push("/hrm/holidays")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Hari Libur</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Hari Libur *</label>
            <input id="name" name="name" className="form-input" placeholder="Contoh: Hari Raya Idul Fitri" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
          </div>

          <div className="flex flex-col gap-1.5 col-span-full">
            <label htmlFor="description" className="text-sm font-medium text-foreground">Deskripsi</label>
            <textarea id="description" name="description" className="form-input" rows={3} placeholder="Deskripsi hari libur (opsional)" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-holiday">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
