"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createBankStatement } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { entityHref } from "@/lib/utils/entity-url"

interface Props {
  accounts: { id: number; code: string; name: string }[]
  banks: { id: number; code: string; name: string }[]
}

// Satu-satunya UI pemanggil `createBankStatement`. Tanpa halaman ini header
// rekening koran hanya bisa lahir dari seed: daftar kosong, dan baris mutasi
// (form di halaman detail) tidak pernah bisa diisi karena tidak ada header-nya.
export function BankStatementForm({ accounts, banks }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [accountId, setAccountId] = useState("")
  const [bankId, setBankId] = useState("")

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await createBankStatement(formData)
        if (!res?.success || res.id == null) throw new Error(res?.error || "Gagal menyimpan data")
        showSuccess("Rekening koran berhasil dibuat")
        // Langsung ke detail (rute menerima id): di sanalah baris mutasi diisi.
        router.push(entityHref("/keuangan/laporan-bank", { id: res.id }))
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulir tambah rekening koran" aria-busy={isPending}>
      <FormCard>
        <FormSection title="Informasi Rekening Koran">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Akun Bank/Kas <span aria-hidden="true" className="text-destructive">*</span></Label>
            <input type="hidden" name="accountId" value={accountId} />
            <FormSelect
              id="accountId"
              value={accountId}
              onValueChange={setAccountId}
              placeholder="-- Pilih Akun --"
              options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankId">Bank</Label>
            <input type="hidden" name="bankId" value={bankId} />
            <FormSelect
              id="bankId"
              value={bankId}
              onValueChange={setBankId}
              placeholder="-- Pilih Bank (opsional) --"
              options={banks.map((b) => ({ value: String(b.id), label: `${b.code} — ${b.name}` }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">Nomor Rekening</Label>
            <Input id="accountNumber" name="accountNumber" placeholder="mis. 1234567890" />
          </div>

          <AppDatePicker label="Tanggal *" name="date" required />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Referensi</Label>
            <Input id="reference" name="reference" placeholder="mis. RK-2026-10" />
          </div>

          <AppDatePicker label="Periode Mulai" name="periodStart" />
          <AppDatePicker label="Periode Selesai" name="periodEnd" />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Saldo Awal</Label>
            <CurrencyInput id="openingBalance" name="openingBalance" placeholder="0" prefix="Rp" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="closingBalance">Saldo Akhir</Label>
            <CurrencyInput id="closingBalance" name="closingBalance" placeholder="0" prefix="Rp" />
          </div>
        </FormSection>

        <FormSection title="Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Catatan rekening koran (opsional)" />
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
