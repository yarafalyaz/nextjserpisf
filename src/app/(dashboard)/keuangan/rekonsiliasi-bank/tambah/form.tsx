"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createBankReconciliation } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"

interface Props {
  accounts: { id: number; code: string; name: string }[]
}

export function BankReconciliationForm({ accounts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [accountId, setAccountId] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await createBankReconciliation(formData)
        if (!res?.success) throw new Error(res?.error || "Gagal menyimpan data")
        showSuccess("Rekonsiliasi berhasil dibuat")
        router.push("/keuangan/rekonsiliasi-bank")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormCard>
        <FormSection title="Informasi Rekonsiliasi">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Akun Bank/Kas *</Label>
            <input type="hidden" name="accountId" value={accountId} />
            <FormSelect
              id="accountId"
              value={accountId}
              onValueChange={setAccountId}
              placeholder="-- Pilih Akun --"
              options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` }))}
            />
          </div>

          <AppDatePicker label="Tanggal Rekening Koran *" name="statementDate" required />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statementBalance">Saldo Rekening Koran *</Label>
            <CurrencyInput id="statementBalance" name="statementBalance" placeholder="0" prefix="Rp" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookBalance">Saldo Buku</Label>
            <CurrencyInput id="bookBalance" name="bookBalance" placeholder="0" prefix="Rp" />
          </div>

          <AppDatePicker label="Periode Mulai" name="periodStart" />

          <AppDatePicker label="Periode Selesai" name="periodEnd" />
        </FormSection>

        <FormSection title="Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Catatan rekonsiliasi (opsional)" />
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-recon">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
