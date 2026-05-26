// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"

interface BudgetFormProps {
  accounts: { id: number; code: string; name: string
}[]
  budget?: any
  costCenters: { id: number; code: string; name: string }[]
}

export function BudgetForm({ accounts, costCenters, budget }: BudgetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createBudget } = await import("@/actions/finance.actions")
        budget?.id ? await updateBudget(budget.id, formData) : await createBudget(formData)
        showSuccess(budget?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/finance/budgets")
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
          <Label htmlFor="name">Nama Budget *</Label>
          <Input id="name" name="name" placeholder="Nama budget" required defaultValue={budget?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="accountId" className="w-full" isRequired>
            <Label>Akun *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari akun..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {accounts.map((a) => (
                  <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.code} - {a.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="costCenterId" className="w-full">
            <Label>Cost Center</Label>
            <ComboBox.InputGroup><Input placeholder="Cari cost center..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {costCenters.map((cc) => (
                  <ListBox.Item key={cc.id} id={String(cc.id)} textValue={`${cc.code} - ${cc.name}`}>{cc.code} - {cc.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <Input id="amount" name="amount" type="number" step="0.01" placeholder="0" required defaultValue={budget?.amount ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Mulai *" name="startDate" value={startDate} onChange={setStartDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Selesai *" name="endDate" value={endDate} onChange={setEndDate} required />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : budget?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
