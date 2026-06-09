"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createLeaveRequest, updateLeaveRequest } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/page-header"

interface LeaveFormProps {
  employees: { id: number; name: string
}[]
  leave?: { id: number; employeeId: number; leaveType: string; startDate: string; endDate: string; reason?: string | null }
}

const leaveTypes = [
  { id: "annual", name: "Cuti Tahunan" },
  { id: "sick", name: "Sakit" },
  { id: "personal", name: "Keperluan Pribadi" },
  { id: "maternity", name: "Cuti Melahirkan" },
  { id: "unpaid", name: "Tanpa Gaji" },
]

export function LeaveForm({ employees, leave }: LeaveFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState<string | null>(leave?.employeeId ? String(leave.employeeId) : null)
  const [leaveType, setLeaveType] = useState(leave?.leaveType ?? "annual")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = leave?.id
          ? await updateLeaveRequest(leave.id, formData)
          : await createLeaveRequest(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(leave?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/sdm/cuti")
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
          <Label htmlFor="employeeId">Karyawan *</Label>
          <Combobox
            id="employeeId"
            name="employeeId"
            options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="Cari karyawan..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipe Cuti *</Label>
          <FormSelect
            id="type"
            name="type"
            value={leaveType}
            onValueChange={setLeaveType}
            options={leaveTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Mulai"
            name="startDate"
            defaultValue={leave?.startDate ?? ""}
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Selesai"
            name="endDate"
            defaultValue={leave?.endDate ?? ""}
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label>Alasan</Label>
          <Textarea name="reason" className="w-full" rows={3} placeholder="Alasan cuti..." defaultValue={leave?.reason ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : leave?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
