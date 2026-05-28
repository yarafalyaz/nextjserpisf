"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createAppreciation, updateAppreciation } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label, InputGroup, Select } from "@heroui/react"
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (appreciation?.id) {
          formData.set("id", String(appreciation.id))
          await updateAppreciation(formData)
        } else {
          await createAppreciation(formData)
        }
        showSuccess(appreciation?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
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
          <ComboBox name="employeeId" className="w-full" isRequired defaultSelectedKey={appreciation?.employeeId ? String(appreciation.employeeId) : undefined}>
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
            label="Tanggal *"
            name="date"
            defaultValue={appreciation?.date}
            onChange={() => {}}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="type" isRequired defaultSelectedKey={appreciation?.type || "bonus"}>
            <Label>Tipe *</Label>
            <Select.Trigger />
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="bonus" textValue="Bonus">Bonus</ListBox.Item>
                <ListBox.Item id="reward" textValue="Reward">Reward</ListBox.Item>
                <ListBox.Item id="incentive" textValue="Insentif">Insentif</ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={appreciation?.amount} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan apresiasi..." defaultValue={appreciation?.notes ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending} >{isPending ? "Menyimpan..." : appreciation?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
