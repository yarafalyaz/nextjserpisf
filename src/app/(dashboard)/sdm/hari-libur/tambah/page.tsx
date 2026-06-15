"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createHoliday } from "@/actions/hrm.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"


export default function CreateHolidayPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createHoliday(formData)
      router.push("/sdm/hari-libur")
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
            <Label htmlFor="name">Nama Hari Libur *</Label>
            <Input id="name" name="name" placeholder="Contoh: Hari Raya Idul Fitri" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
          </div>

          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Deskripsi hari libur (opsional)" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-holiday">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
