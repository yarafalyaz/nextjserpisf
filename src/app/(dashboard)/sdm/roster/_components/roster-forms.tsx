"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  createEmployeeRoster,
  approveEmployeeRoster,
  rejectEmployeeRoster,
} from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { ROSTER_TYPES } from "@/lib/validations/hrm.schemas"

export const ROSTER_TYPE_LABELS: Record<string, string> = {
  cuti: "Cuti",
  sakit: "Sakit",
  izin: "Izin",
  tugas_luar: "Tugas Luar",
  libur_ganti: "Libur Ganti",
}

type EmployeeOption = { id: number; name: string; employeeNo: string | null }

export function RosterForm({ employees }: { employees: EmployeeOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      try {
        const res = await createEmployeeRoster(new FormData(form))
        if (!res.success) {
          showError(res.error || "Gagal menyimpan roster")
          return
        }
        showSuccess("Roster ditambahkan (draft)")
        form.reset()
        router.refresh()
      } catch {
        showError("Gagal menyimpan roster")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label="Tambah roster"
    >
      <div className="flex flex-col gap-1.5 sm:w-56">
        <Label htmlFor="rosterEmployee">Karyawan *</Label>
        <FormSelect
          id="rosterEmployee"
          name="employeeId"
          required
          defaultValue=""
          placeholder="Pilih karyawan"
          options={employees.map((emp) => ({
            value: String(emp.id),
            label: `${emp.name}${emp.employeeNo ? ` (${emp.employeeNo})` : ""}`,
          }))}
        />
      </div>
      <AppDatePicker label="Tanggal *" name="date" required className="sm:w-40" />
      <div className="flex flex-col gap-1.5 sm:w-44">
        <Label htmlFor="rosterType">Jenis *</Label>
        <FormSelect
          id="rosterType"
          name="type"
          required
          defaultValue="cuti"
          options={ROSTER_TYPES.map((type) => ({
            value: type,
            label: ROSTER_TYPE_LABELS[type],
          }))}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="rosterNotes">Catatan</Label>
        <Input id="rosterNotes" name="notes" placeholder="Opsional" />
      </div>
      <Button type="submit" variant="primary" isDisabled={isPending}>
        {isPending ? "Menyimpan..." : "Tambah"}
      </Button>
    </form>
  )
}

export function RosterDecisionButtons({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(action: (id: number) => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      try {
        const res = await action(id)
        if (!res.success) {
          showError(res.error || "Gagal memproses roster")
          return
        }
        showSuccess(ok)
        router.refresh()
      } catch {
        showError("Gagal memproses roster")
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        isDisabled={isPending}
        onPress={() => run(approveEmployeeRoster, "Roster disetujui")}
      >
        Setujui
      </Button>
      <Button
        type="button"
        size="sm"
        isDisabled={isPending}
        onPress={() => run(rejectEmployeeRoster, "Roster ditolak")}
      >
        Tolak
      </Button>
    </div>
  )
}
