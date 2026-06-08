"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createWorkSchedule, updateWorkSchedule } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { AppTimePicker } from "@/components/ui/time-picker"
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
    departmentIds?: number[]
    lateToleranceMinutes?: number
    isActive?: boolean
    employeeIds?: number[]
  }
  departments?: { id: number; name: string }[]
  employees?: { id: number; name: string }[]
}

export function WorkScheduleForm({ schedule, departments = [], employees = [] }: WorkScheduleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [departmentIds, setDepartmentIds] = useState<string[]>((schedule?.departmentIds ?? []).map(String))
  const [employeeIds, setEmployeeIds] = useState<string[]>((schedule?.employeeIds ?? []).map(String))

  const selectedDays = new Set(
    (schedule?.workDays ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "")
      .map((d) => Number(d))
  )

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = schedule?.id ? await updateWorkSchedule(schedule.id, formData) : await createWorkSchedule(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(schedule?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
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
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="departmentId">Departemen (opsional)</Label>
          <MultiCombobox
            id="departmentId"
            name="departmentId"
            options={departments.map((dept) => ({ value: String(dept.id), label: dept.name }))}
            value={departmentIds}
            onChange={setDepartmentIds}
            placeholder="Cari & pilih departemen (boleh lebih dari satu)..."
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="employeeId">Karyawan (opsional)</Label>
          <MultiCombobox
            id="employeeId"
            name="employeeId"
            options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
            value={employeeIds}
            onChange={setEmployeeIds}
            placeholder="Cari & pilih karyawan (boleh lebih dari satu)..."
          />
          <span className="text-xs text-muted-foreground">Jika diisi, jadwal berlaku untuk karyawan terpilih. Jika kosong, berlaku untuk departemen di atas (atau semua bila departemen kosong).</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startTime">Jam Masuk *</Label>
          <AppTimePicker id="startTime" name="startTime" defaultValue={schedule?.startTime ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endTime">Jam Keluar *</Label>
          <AppTimePicker id="endTime" name="endTime" defaultValue={schedule?.endTime ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lateToleranceMinutes">Toleransi Keterlambatan (menit)</Label>
          <Input id="lateToleranceMinutes" name="lateToleranceMinutes" type="number" min="0" placeholder="0" defaultValue={String(schedule?.lateToleranceMinutes ?? 0)} />
        </div>
        <div className="flex flex-col gap-1.5 justify-end">
          <div className="flex items-center gap-2">
            <Checkbox id="work-schedule-is-active" name="isActive" value="true" defaultChecked={schedule?.isActive !== false} />
            <Label htmlFor="work-schedule-is-active">Aktif</Label>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label>Hari Kerja *</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            {DAYS.map((day) => (
              <label key={day.value} htmlFor={`day-${day.value}`} className="flex items-center gap-2 cursor-pointer">
                <Checkbox id={`day-${day.value}`} name="days" value={String(day.value)} defaultChecked={selectedDays.has(day.value)} />
                {day.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" variant="secondary" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : schedule?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
