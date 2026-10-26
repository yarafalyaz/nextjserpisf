"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { createAttendanceCorrection } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppTimePicker } from "@/components/ui/time-picker"
import { FormActions, FormSection } from "@/components/ui/form-section"
import { ATTENDANCE_STATUS_LABELS } from "./attendance-labels"

export type AttendanceCorrectionEmployeeOption = {
  id: number
  name: string
  employeeNo: string
}

/**
 * Formulir pengajuan koreksi absensi (F-2026-10-25-010-S). Field FormData:
 * employeeId, date, status, checkIn/checkOut (HH:MM opsional), notes
 * (opsional), reason (wajib). Jendela tanggal, satu pending per tanggal,
 * dan scope self ditegakkan server; error server tampil verbatim.
 */
export function AttendanceCorrectionForm({
  employees,
}: {
  employees: AttendanceCorrectionEmployeeOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await createAttendanceCorrection(new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal mengajukan koreksi absensi")
        return
      }
      showSuccess("Pengajuan koreksi absensi terkirim")
      form.reset()
      router.push("/sdm/absensi/koreksi")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" aria-label="Ajukan koreksi absensi">
      <FormSection
        title="Karyawan & Tanggal"
        description="Tanggal koreksi paling awal tanggal 1 bulan lalu dan paling akhir hari ini."
        columns={3}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionEmployee">Karyawan *</Label>
          <select
            id="correctionEmployee"
            name="employeeId"
            required
            defaultValue=""
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
        <AppDatePicker label="Tanggal *" name="date" required defaultValue="" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionStatus">Status Usulan *</Label>
          <select
            id="correctionStatus"
            name="status"
            required
            defaultValue="present"
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
        title="Jam & Catatan Usulan"
        description="Jam masuk/keluar memakai waktu WIB; kosongkan bila tidak diubah."
        columns={3}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionCheckIn">Jam masuk</Label>
          <AppTimePicker id="correctionCheckIn" name="checkIn" defaultValue="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionCheckOut">Jam keluar</Label>
          <AppTimePicker id="correctionCheckOut" name="checkOut" defaultValue="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionNotes">Catatan</Label>
          <Input id="correctionNotes" name="notes" placeholder="Opsional" className="h-10" />
        </div>
      </FormSection>

      <FormSection title="Alasan Koreksi" description="Alasan wajib diisi dan dibaca penyetuju.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctionReason">Alasan *</Label>
          <Textarea
            id="correctionReason"
            name="reason"
            required
            rows={3}
            placeholder="Contoh: lupa absen masuk, mesin absen mati"
          />
        </div>
      </FormSection>

      <div className="rounded-lg border border-default bg-default-100/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
        Pengajuan tidak mengubah rekod absensi. Rekod induk baru berubah sesudah penyetuju
        menyetujui pengajuan ini.
      </div>

      <FormActions>
        <Button
          type="button"
          variant="secondary"
          onPress={() => router.push("/sdm/absensi/koreksi")}
        >
          Batal
        </Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Mengirim..." : "Ajukan Koreksi"}
        </Button>
      </FormActions>
    </form>
  )
}
