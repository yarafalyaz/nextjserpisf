"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  createHoliday,
  updateHoliday,
  createDepartmentHoliday,
  updateDepartmentHoliday,
  createWorkSchedule,
  updateWorkSchedule,
} from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppTimePicker } from "@/components/ui/time-picker"

// Formulir kalender kerja: satu-satunya UI yang memanggil aksi hari libur dan
// jadwal kerja. Sebelum ini ketiga tabelnya (hari libur, hari libur departemen,
// jadwal kerja) hanya bisa diisi skrip seed, padahal perhitungan absensi dan sisa
// cuti membacanya.

type HolidayItem = {
  id: number
  name: string
  date: string
  description: string | null
}

type DepartmentHolidayItem = {
  id: number
  name: string
  date: string
  departmentId: number
}

type WorkScheduleItem = {
  id: number
  name: string
  workDays: string
  startTime: string
  endTime: string
  isActive: boolean
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

/** `Date` Prisma → nilai untuk `AppDatePicker` (YYYY-MM-DD). */
function dateInputValue(value: string | Date): string {
  return new Date(value).toISOString().split("T")[0]
}

export function HolidayForm({ holiday }: { holiday?: HolidayItem }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      const res = holiday ? await updateHoliday(holiday.id, fd) : await createHoliday(fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan hari libur")
        return
      }
      showSuccess(holiday ? "Hari libur diperbarui" : "Hari libur ditambahkan")
      form.reset()
      router.push("/sdm/kalender-kerja")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label={holiday ? "Ubah hari libur" : "Tambah hari libur"}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="holidayName">Nama *</Label>
        <Input
          id="holidayName"
          name="name"
          placeholder="mis. Hari Kemerdekaan"
          required
          defaultValue={holiday?.name ?? ""}
        />
      </div>
      <AppDatePicker
        label="Tanggal *"
        name="date"
        required
        defaultValue={holiday ? dateInputValue(holiday.date) : ""}
        className="sm:w-40"
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="holidayDescription">Keterangan</Label>
        <Input
          id="holidayDescription"
          name="description"
          placeholder="Opsional"
          defaultValue={holiday?.description ?? ""}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : holiday ? "Perbarui" : "Tambah"}
        </Button>
        {holiday && (
          <Button type="button" onPress={() => router.push("/sdm/kalender-kerja")}>
            Batal
          </Button>
        )}
      </div>
    </form>
  )
}

export function DepartmentHolidayForm({
  item,
  departments,
}: {
  item?: DepartmentHolidayItem
  departments: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      const res = item
        ? await updateDepartmentHoliday(item.id, fd)
        : await createDepartmentHoliday(fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan hari libur departemen")
        return
      }
      showSuccess(item ? "Hari libur departemen diperbarui" : "Hari libur departemen ditambahkan")
      form.reset()
      router.push("/sdm/kalender-kerja")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label={item ? "Ubah hari libur departemen" : "Tambah hari libur departemen"}
    >
      <div className="flex flex-col gap-1.5 sm:w-56">
        <Label htmlFor="deptHolidayDepartment">Departemen *</Label>
        <select
          id="deptHolidayDepartment"
          name="departmentId"
          required
          defaultValue={item ? String(item.departmentId) : ""}
          className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
        >
          <option value="">Pilih departemen</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="deptHolidayName">Nama *</Label>
        <Input
          id="deptHolidayName"
          name="name"
          placeholder="mis. Cuti bersama pabrik"
          required
          defaultValue={item?.name ?? ""}
        />
      </div>
      <AppDatePicker
        label="Tanggal *"
        name="date"
        required
        defaultValue={item ? dateInputValue(item.date) : ""}
        className="sm:w-40"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : item ? "Perbarui" : "Tambah"}
        </Button>
        {item && (
          <Button type="button" onPress={() => router.push("/sdm/kalender-kerja")}>
            Batal
          </Button>
        )}
      </div>
    </form>
  )
}

export function WorkScheduleForm({ schedule }: { schedule?: WorkScheduleItem }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const selectedDays = new Set(
    (schedule?.workDays ?? "1,2,3,4,5").split(",").map((v) => v.trim()),
  )

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      // Checkbox `workDays` mengirim satu entri per hari terpilih, sedangkan
      // `parseFormData` memetakan FormData ke objek dan hanya menyimpan nilai
      // TERAKHIR: jadwal Senin–Jumat akan tersimpan sebagai "Jumat" saja. Jadi
      // hari-hari digabung lebih dulu menjadi satu nilai.
      fd.set("workDays", fd.getAll("workDays").map(String).join(","))
      // Checkbox `isActive` native tidak mengirim field saat tidak dicentang,
      // sedangkan aksi membaca absen sebagai tetap aktif — tanpa set eksplisit,
      // jadwal nonaktif tidak pernah bisa dinonaktifkan lewat UI.
      const activeBox = form.querySelector<HTMLInputElement>('input[name="isActive"]')
      fd.set("isActive", activeBox?.checked ? "true" : "false")
      const res = schedule
        ? await updateWorkSchedule(schedule.id, fd)
        : await createWorkSchedule(fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan jadwal kerja")
        return
      }
      showSuccess(schedule ? "Jadwal kerja diperbarui" : "Jadwal kerja ditambahkan")
      form.reset()
      router.push("/sdm/kalender-kerja")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label={schedule ? "Ubah jadwal kerja" : "Tambah jadwal kerja"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="scheduleName">Nama jadwal *</Label>
          <Input
            id="scheduleName"
            name="name"
            placeholder="mis. Shift Pagi"
            required
            defaultValue={schedule?.name ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scheduleStart">Jam mulai *</Label>
          <AppTimePicker id="scheduleStart" name="startTime" defaultValue={schedule?.startTime ?? "08:00"} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scheduleEnd">Jam selesai *</Label>
          <AppTimePicker id="scheduleEnd" name="endTime" defaultValue={schedule?.endTime ?? "17:00"} />
        </div>
        <label className="inline-flex items-center gap-2 pb-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="isActive"
            value="on"
            defaultChecked={schedule ? schedule.isActive : true}
            className="h-4 w-4 rounded border-default"
          />
          Aktif
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-foreground">Hari kerja *</legend>
        <div className="flex flex-wrap gap-3">
          {DAY_NAMES.map((label, index) => (
            <label key={label} className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name="workDays"
                value={String(index)}
                defaultChecked={selectedDays.has(String(index))}
                className="h-4 w-4 rounded border-default"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Hari terpilih menentukan hari kerja pada perhitungan absensi &amp; sisa cuti.
        </p>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : schedule ? "Perbarui" : "Tambah"}
        </Button>
        {schedule && (
          <Button type="button" onPress={() => router.push("/sdm/kalender-kerja")}>
            Batal
          </Button>
        )}
      </div>
    </form>
  )
}
