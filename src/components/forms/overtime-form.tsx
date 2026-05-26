// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createOvertimeRequest, updateOvertimeRequest } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

export function OvertimeForm({ employees, overtime }: { employees: { id: number; name: string }[]; overtime?: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        overtime?.id ? await updateOvertimeRequest(overtime.id, formData) : await createOvertimeRequest(formData)
        showSuccess(overtime?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/hrm/overtime")
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
          <ComboBox name="employeeId" className="w-full" isRequired>
            <Label>Karyawan *</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari karyawan..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {employees.map((e) => (
                  <ListBox.Item key={e.id} id={String(e.id)} textValue={e.name}>
                    {e.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={date}
            onChange={(val) => setDate(val)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hours">Jam Lembur *</Label>
          <Input id="hours" name="hours" type="number" min="0.5" step="0.5" placeholder="2" required defaultValue={overtime?.hours ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="reason">Alasan</Label>
          <TextArea id="reason" name="reason" rows={3} placeholder="Alasan lembur..." defaultValue={overtime?.reason ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : overtime?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
