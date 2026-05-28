"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createLeaveRequest, updateLeaveRequest } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { TextArea, Label, Select, ComboBox, Input, ListBox } from "@heroui/react"
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        leave?.id ? await updateLeaveRequest(leave.id, formData) : await createLeaveRequest(formData)
        showSuccess(leave?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
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
          <ComboBox name="employeeId" isRequired className="w-full">
            <Label>Karyawan *</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari karyawan..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {employees.map((emp) => (
                  <ListBox.Item key={emp.id} id={String(emp.id)} textValue={emp.name}>
                    {emp.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="type" isRequired defaultSelectedKey="annual" className="w-full">
            <Label>Tipe Cuti *</Label>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {leaveTypes.map((lt) => (
                  <ListBox.Item key={lt.id} id={lt.id} textValue={lt.name}>
                    {lt.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Mulai"
            name="startDate"
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Selesai"
            name="endDate"
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label>Alasan</Label>
          <TextArea name="reason" className="w-full" rows={3} placeholder="Alasan cuti..." defaultValue={leave?.reason ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : leave?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
