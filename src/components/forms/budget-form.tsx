"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface BudgetFormProps {
  accounts: { id: number; code: string; name: string
}[]
  budget?: { id: number; name: string; year: number; departmentId?: number | null; totalAmount: number; amount?: number; notes?: string | null }
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
        const { createBudget, updateBudget } = await import("@/actions/finance.actions")
        if (budget?.id) {

          await updateBudget(budget.id, formData)

        } else {

          await createBudget(formData)

        }
        showSuccess(budget?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/keuangan/anggaran")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
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
            <AppDatePicker label="Tanggal Mulai *" name="startDate" value={startDate} onChange={setStartDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Selesai *" name="endDate" value={endDate} onChange={setEndDate} required />
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (Rp) *</Label>
            <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={budget?.amount} prefix="Rp" />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : budget?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
