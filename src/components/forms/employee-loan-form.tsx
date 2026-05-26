// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createEmployeeLoan, updateEmployeeLoan } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label, InputGroup } from "@heroui/react"

interface LoanFormProps {
  employees: { id: number; name: string
}[]
  loan?: any
}

export function EmployeeLoanForm({ employees, loan }: LoanFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        loan?.id ? await updateEmployeeLoan(loan.id, formData) : await createEmployeeLoan(formData)
        showSuccess(loan?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/hrm/loans")
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
          <Label htmlFor="amount">Jumlah Pinjaman (Rp) *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <InputGroup.Input id="amount" name="amount" type="number" placeholder="0" required defaultValue={loan?.amount ?? ""} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="installmentAmount">Cicilan per Bulan (Rp) *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <InputGroup.Input id="installmentAmount" name="installmentAmount" type="number" placeholder="0" required defaultValue={loan?.installmentAmount ?? ""} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Mulai"
            name="startDate"
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="reason">Alasan</Label>
          <TextArea id="reason" name="reason" rows={3} placeholder="Alasan pinjaman..." defaultValue={loan?.reason ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : loan?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
