"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createAppreciation, updateAppreciation } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/page-header"

interface AppreciationFormProps {
  employees: { id: number; name: string }[]
  appreciation?: {
    id: number
    employeeId: number
    date: string
    type: string
    amount: number
    notes: string | null
  }
}

export function AppreciationForm({ employees, appreciation }: AppreciationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState(appreciation?.employeeId ? String(appreciation.employeeId) : "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        let result
        if (appreciation?.id) {
          formData.set("id", String(appreciation.id))
          result = await updateAppreciation(formData)
        } else {
          result = await createAppreciation(formData)
        }
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(appreciation?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/sdm/apresiasi")
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
          <Label>Karyawan *</Label>
          <Combobox
            name="employeeId"
            value={employeeId || null}
            onChange={(key) => setEmployeeId(key ?? "")}
            placeholder="Cari karyawan..."
            options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal *"
            name="date"
            defaultValue={appreciation?.date}
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipe *</Label>
          <FormSelect
            id="type"
            name="type"
            required
            defaultValue={appreciation?.type || "bonus"}
            options={[
              { value: "bonus", label: "Bonus" },
              { value: "reward", label: "Penghargaan" },
              { value: "incentive", label: "Insentif" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={appreciation?.amount} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan apresiasi..." defaultValue={appreciation?.notes ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : appreciation?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
