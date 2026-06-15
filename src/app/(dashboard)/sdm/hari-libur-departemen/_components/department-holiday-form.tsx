"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createDepartmentHoliday, updateDepartmentHoliday } from "@/actions/hrm.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface Department {
  id: number
  name: string
}

interface DepartmentHolidayData {
  id: number
  departmentId: number
  name: string
  date: string
  isRecurring: boolean
}

interface DepartmentHolidayFormProps {
  departments: Department[]
  holiday?: DepartmentHolidayData
}

export function DepartmentHolidayForm({ departments, holiday }: DepartmentHolidayFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(holiday?.date ?? new Date().toISOString().split("T")[0])
  const [departmentId, setDepartmentId] = useState<string | null>(
    holiday?.departmentId ? String(holiday.departmentId) : null
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (holiday?.id) {
      formData.set("id", String(holiday.id))
    }
    startTransition(async () => {
      try {
        if (holiday?.id) {
          await updateDepartmentHoliday(formData)
        } else {
          await createDepartmentHoliday(formData)
        }
        showSuccess(holiday?.id ? "Hari libur departemen berhasil diperbarui" : "Hari libur departemen berhasil ditambahkan")
        router.push("/sdm/hari-libur-departemen")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="departmentId">Departemen *</Label>
          <Combobox
            id="departmentId"
            name="departmentId"
            placeholder="Cari departemen..."
            value={departmentId}
            onChange={setDepartmentId}
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Hari Libur *</Label>
          <Input id="name" name="name" defaultValue={holiday?.name} placeholder="Contoh: Hari Jadi Departemen" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
        </div>

        <div className="flex flex-col gap-1.5 justify-end">
          <div className="flex items-center gap-2">
            <Checkbox id="department-holiday-is-recurring" name="isRecurring" value="on" defaultChecked={holiday?.isRecurring ?? false} />
            <Label htmlFor="department-holiday-is-recurring">Berulang setiap tahun</Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-department-holiday">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
