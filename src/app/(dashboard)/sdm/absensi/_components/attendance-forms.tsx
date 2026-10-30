"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createAttendance, updateAttendance } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppTimePicker } from "@/components/ui/time-picker"
import { FormActions, FormSection } from "@/components/ui/form-section"
import { ATTENDANCE_STATUS_LABELS } from "./attendance-labels"

// Formulir absensi: satu-satunya UI yang memanggil createAttendance/updateAttendance.
// Sebelum ini `Attendance` hanya bisa diisi skrip seed, padahal dasbor kehadiran,
// potongan keterlambatan, dan ringkasan absensi penggajian MEMBACANYA — jadi
// angkanya hanya benar pada basis data yang di-seed.
//
// Field FormData yang dikirim: employeeId, date (YYYY-MM-DD), checkIn/checkOut
// (HH:MM, opsional — dibiarkan kosong berarti tidak diisi, dan `parseFormData`
// mengubah string kosong menjadi `undefined` sehingga skema opsional menerimanya),
// status, notes (opsional). Koordinat GPS opsional: hanya dikirim bila petugas
// menekan "Gunakan lokasi saat ini" dan tangkapan berhasil; satu tangkapan
// dipakai untuk check-in dan check-out, masing-masing hanya bila jamnya terisi.
// Edit tanpa tangkapan baru menimpa koordinat lama dengan null (disengaja:
// mempertahankan nilai lama diam-diam akan mengklaim lokasi untuk jam yang
// mungkin diubah).

export type AttendanceFormItem = {
  id: number
  employeeId: number
  /** Hari kalender WIB, `YYYY-MM-DD` (nilai untuk `AppDatePicker`). */
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
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  function captureLocation() {
    if (!navigator.geolocation) {
      showError("Browser kamu tidak mendukung geolocation")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (err) => {
        showError("Gagal mengambil lokasi: " + err.message)
      },
    )
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      // Tanpa stempel jam tidak ada klaim lokasi: koordinat pasangan jam yang
      // kosong tidak dikirim.
      if (location) {
        if (fd.get("checkIn")) {
          fd.set("checkInLatitude", String(location.latitude))
          fd.set("checkInLongitude", String(location.longitude))
        }
        if (fd.get("checkOut")) {
          fd.set("checkOutLatitude", String(location.latitude))
          fd.set("checkOutLongitude", String(location.longitude))
        }
      }
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
      className="flex flex-col gap-8"
      aria-label={item ? "Ubah absensi" : "Catat absensi"}
    >
      <FormSection
        title="Karyawan & Tanggal"
        description="Satu karyawan hanya boleh punya satu absensi per tanggal."
        columns={3}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceEmployee">Karyawan *</Label>
          <select
            id="attendanceEmployee"
            name="employeeId"
            required
            defaultValue={item ? String(item.employeeId) : ""}
            className="h-10 w-full rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Pilih karyawan</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.employeeNo})
              </option>
            ))}
          </select>
        </div>
        <AppDatePicker
          label="Tanggal *"
          name="date"
          required
          defaultValue={item?.date ?? ""}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceStatus">Status *</Label>
          <select
            id="attendanceStatus"
            name="status"
            required
            defaultValue={item ? item.status : "present"}
            className="h-10 w-full rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection
        title="Jam Kehadiran"
        description="Jam masuk/keluar memakai waktu WIB dan dipakai menghitung keterlambatan serta lembur."
        columns={3}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceCheckIn">Jam masuk</Label>
          <AppTimePicker id="attendanceCheckIn" name="checkIn" defaultValue={item?.checkIn ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceCheckOut">Jam keluar</Label>
          <AppTimePicker id="attendanceCheckOut" name="checkOut" defaultValue={item?.checkOut ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceNotes">Catatan</Label>
          <Input
            id="attendanceNotes"
            name="notes"
            placeholder="Opsional"
            defaultValue={item?.notes ?? ""}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Lokasi GPS</Label>
          <div>
            <Button type="button" variant="secondary" onPress={captureLocation}>
              Gunakan lokasi saat ini
            </Button>
          </div>
          {location && (
            <p className="text-xs text-muted-foreground">
              Lokasi: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </p>
          )}
        </div>
      </FormSection>

      <div className="rounded-lg border border-default bg-default-100/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
        Bila karyawan belum punya jadwal kerja aktif, jam masuk tidak bisa dicatat —
        buat jadwal kerja lebih dulu di Kalender Kerja.
      </div>

      <FormActions>
        <Button type="button" variant="secondary" onPress={() => router.push("/sdm/absensi")}>
          Batal
        </Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : item ? "Simpan Perubahan" : "Catat Absensi"}
        </Button>
      </FormActions>
    </form>
  )
}
