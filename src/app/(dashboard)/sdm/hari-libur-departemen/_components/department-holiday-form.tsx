"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createDepartmentHoliday, updateDepartmentHoliday } from "@/actions/hrm.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label, ComboBox, ListBox, Checkbox } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

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
  const [date, setDate] = useState(holiday?.date ?? "")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (holiday?.id) {
      formData.set("id", String(holiday.id))
    }
    startTransition(async () => {
      try {
        holiday?.id ? await updateDepartmentHoliday(formData) : await createDepartmentHoliday(formData)
        showSuccess(holiday?.id ? "Hari libur departemen berhasil diupdate" : "Hari libur departemen berhasil ditambahkan")
        router.push("/hrm/department-holidays")
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
          <ComboBox name="departmentId" className="w-full" isRequired defaultSelectedKey={holiday?.departmentId ? String(holiday.departmentId) : undefined}>
            <Label>Departemen *</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari departemen..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {departments.map((d) => (
                  <ListBox.Item key={d.id} id={String(d.id)} textValue={d.name}>
                    {d.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Hari Libur *</Label>
          <Input id="name" name="name" defaultValue={holiday?.name} placeholder="Contoh: Hari Jadi Departemen" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
        </div>

        <div className="flex flex-col gap-1.5 justify-end">
          <Checkbox id="department-holiday-is-recurring" name="isRecurring" value="on" defaultSelected={holiday?.isRecurring ?? false}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label htmlFor="department-holiday-is-recurring">Berulang setiap tahun</Label>
            </Checkbox.Content>
          </Checkbox>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-department-holiday">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
