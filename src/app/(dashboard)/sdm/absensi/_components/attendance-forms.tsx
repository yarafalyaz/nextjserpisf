"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createAttendance, updateAttendance } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { ATTENDANCE_STATUS_LABELS } from "./attendance-labels"

// Formulir absensi: satu-satunya UI yang memanggil createAttendance/updateAttendance.
// Sebelum ini `Attendance` hanya bisa diisi skrip seed, padahal dasbor kehadiran,
// potongan keterlambatan, dan ringkasan absensi penggajian MEMBACANYA — jadi
// angkanya hanya benar pada basis data yang di-seed.
//
// Field FormData yang dikirim: employeeId, date (YYYY-MM-DD), checkIn/checkOut
// (HH:MM, opsional — dibiarkan kosong berarti tidak diisi, dan `parseFormData`
// mengubah string kosong menjadi `undefined` sehingga skema opsional menerimanya),
// status, notes (opsional).

export type AttendanceFormItem = {
  id: number
  employeeId: number
  /** Hari kalender WIB, `YYYY-MM-DD` (nilai untuk `<input type="date">`). */
  date: string
  /** Jam dinding WIB `HH:MM`, kosong bila tidak diisi. */
  checkIn: string
  checkOut: string
  status: string
  notes: string
}

export type AttendanceEmployeeOption = {
  id: number
  name: string
  employeeNo: string
}

export function AttendanceForm({
  employees,
  item,
}: {
  employees: AttendanceEmployeeOption[]
  item?: AttendanceFormItem
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      const res = item ? await updateAttendance(item.id, fd) : await createAttendance(fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan absensi")
        return
      }
      showSuccess(item ? "Absensi diperbarui" : "Absensi dicatat")
      form.reset()
      router.push("/sdm/absensi")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label={item ? "Ubah absensi" : "Catat absensi"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="attendanceEmployee">Karyawan *</Label>
          <select
            id="attendanceEmployee"
            name="employeeId"
            required
            defaultValue={item ? String(item.employeeId) : ""}
            className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Pilih karyawan</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.employeeNo})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="attendanceDate">Tanggal *</Label>
          <Input
            id="attendanceDate"
            name="date"
            type="date"
            required
            defaultValue={item?.date ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor="attendanceStatus">Status *</Label>
          <select
            id="attendanceStatus"
            name="status"
            required
            defaultValue={item ? item.status : "present"}
            className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-32">
          <Label htmlFor="attendanceCheckIn">Jam masuk</Label>
          <Input
            id="attendanceCheckIn"
            name="checkIn"
            type="time"
            defaultValue={item?.checkIn ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-32">
          <Label htmlFor="attendanceCheckOut">Jam keluar</Label>
          <Input
            id="attendanceCheckOut"
            name="checkOut"
            type="time"
            defaultValue={item?.checkOut ?? ""}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="attendanceNotes">Catatan</Label>
          <Input
            id="attendanceNotes"
            name="notes"
            placeholder="Opsional"
            defaultValue={item?.notes ?? ""}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Jam masuk/keluar memakai waktu WIB dan dipakai menghitung keterlambatan serta
        lembur. Bila karyawan belum punya jadwal kerja aktif, jam masuk tidak bisa
        dicatat — buat jadwal kerja lebih dulu di Kalender Kerja.
      </p>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : item ? "Perbarui" : "Tambah"}
        </Button>
        {item && (
          <Button type="button" onPress={() => router.push("/sdm/absensi")}>
            Batal
          </Button>
        )}
      </div>
    </form>
  )
}
