"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createWorkSchedule, updateWorkSchedule } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label, ComboBox, ListBox, Checkbox } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

const DAYS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 0, label: "Minggu" },
]

interface WorkScheduleFormProps {
  schedule?: {
    id: number
    name: string
    startTime: string
    endTime: string
    workDays: string
    departmentId?: number | null
    lateToleranceMinutes?: number
    isActive?: boolean
  }
  departments?: { id: number; name: string }[]
}

export function WorkScheduleForm({ schedule, departments = [] }: WorkScheduleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        schedule?.id ? await updateWorkSchedule(schedule.id, formData) : await createWorkSchedule(formData)
        showSuccess(schedule?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/sdm/jadwal-kerja")
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
          <Label htmlFor="name">Nama Jadwal *</Label>
          <Input id="name" name="name" required placeholder="Contoh: Shift Pagi" defaultValue={schedule?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="departmentId" className="w-full" defaultSelectedKey={schedule?.departmentId ? String(schedule.departmentId) : undefined}>
            <Label>Departemen</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari departemen..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {departments.map((dept) => (
                  <ListBox.Item key={dept.id} id={String(dept.id)} textValue={dept.name}>
                    {dept.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startTime">Jam Masuk *</Label>
          <Input id="startTime" name="startTime" type="time" required defaultValue={schedule?.startTime ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endTime">Jam Keluar *</Label>
          <Input id="endTime" name="endTime" type="time" required defaultValue={schedule?.endTime ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lateToleranceMinutes">Toleransi Keterlambatan (menit)</Label>
          <Input id="lateToleranceMinutes" name="lateToleranceMinutes" type="number" min="0" placeholder="0" defaultValue={String(schedule?.lateToleranceMinutes ?? 0)} />
        </div>
        <div className="flex flex-col gap-1.5 justify-end">
          <Checkbox id="work-schedule-is-active" name="isActive" value="on" defaultSelected={schedule?.isActive !== false}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label htmlFor="work-schedule-is-active">Aktif</Label>
            </Checkbox.Content>
          </Checkbox>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label>Hari Kerja *</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            {DAYS.map((day) => (
              <label key={day.value} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input type="checkbox" name="days" value={day.value} />
                {day.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending} >{isPending ? "Menyimpan..." : schedule?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
