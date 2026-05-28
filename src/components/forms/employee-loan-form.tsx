"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createEmployeeLoan, updateEmployeeLoan } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label, InputGroup } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface LoanFormProps {
  employees: { id: number; name: string }[]
  loan?: { id: number; employeeId: number; loanDate: string; totalAmount: number; monthlyInstallment: number; remainingAmount: number; status: string; notes?: string | null }
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
        router.push("/sdm/pinjaman")
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
            <ComboBox name="employeeId" defaultSelectedKey={loan ? String(loan.employeeId) : undefined} className="w-full" isRequired>
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
              label="Tanggal Pinjaman *"
              name="loanDate"
              onChange={() => {}}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalAmount">Jumlah Pinjaman (Rp) *</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <CurrencyInput id="totalAmount" name="totalAmount" placeholder="0" required defaultValue={loan?.totalAmount} />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyInstallment">Cicilan per Bulan (Rp) *</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <CurrencyInput id="monthlyInstallment" name="monthlyInstallment" placeholder="0" required defaultValue={loan?.monthlyInstallment} />
            </InputGroup>
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <TextArea id="notes" name="notes" rows={3} placeholder="Catatan pinjaman..." defaultValue={loan?.notes ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : loan?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
