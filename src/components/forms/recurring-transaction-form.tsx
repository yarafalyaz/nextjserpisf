"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { createRecurringTransaction, updateRecurringTransaction } from "@/actions/recurring.actions"
import { FREQUENCIES, FREQUENCY_LABELS, type RecurrenceFrequency } from "@/lib/reports/recurring-schedule"

interface Option {
  id: number
  label: string
}

interface RecurringTransactionFormProps {
  accounts: Option[]
  expenseCategories: Option[]
  schedule?: {
    id: number
    name: string
    type: string
    frequency: string
    interval: number
    startDate: string
    endDate: string | null
    description: string
    amount: number
    debitAccountId: number | null
    creditAccountId: number | null
    accountId: number | null
    paidFromAccountId: number | null
    categoryId: number | null
    isActive: boolean
  }
}

export function RecurringTransactionForm({ accounts, expenseCategories, schedule }: RecurringTransactionFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<string>(schedule?.type ?? "journal")
  const [frequency, setFrequency] = useState<string>(schedule?.frequency ?? "monthly")
  const [startDate, setStartDate] = useState(schedule?.startDate ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(schedule?.endDate ?? "")
  const [amount, setAmount] = useState<number>(schedule?.amount ?? 0)
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true)
  const [debitAccountId, setDebitAccountId] = useState<string | null>(schedule?.debitAccountId ? String(schedule.debitAccountId) : null)
  const [creditAccountId, setCreditAccountId] = useState<string | null>(schedule?.creditAccountId ? String(schedule.creditAccountId) : null)
  const [accountId, setAccountId] = useState<string | null>(schedule?.accountId ? String(schedule.accountId) : null)
  const [paidFromAccountId, setPaidFromAccountId] = useState<string | null>(schedule?.paidFromAccountId ? String(schedule.paidFromAccountId) : null)
  const [categoryId, setCategoryId] = useState<string | null>(schedule?.categoryId ? String(schedule.categoryId) : null)

  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: a.label }))

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("type", type)
    formData.set("frequency", frequency)
    formData.set("amount", String(amount))
    formData.set("startDate", startDate)
    if (endDate) formData.set("endDate", endDate)
    formData.set("isActive", isActive ? "true" : "false")
    if (type === "journal") {
      if (debitAccountId) formData.set("debitAccountId", debitAccountId)
      if (creditAccountId) formData.set("creditAccountId", creditAccountId)
    } else {
      if (accountId) formData.set("accountId", accountId)
      if (paidFromAccountId) formData.set("paidFromAccountId", paidFromAccountId)
      if (categoryId) formData.set("categoryId", categoryId)
    }

    startTransition(async () => {
      try {
        const result = schedule?.id
          ? await updateRecurringTransaction(schedule.id, formData)
          : await createRecurringTransaction(formData)
        if (!result?.success) {
          showError(result?.error ?? "Gagal menyimpan data")
          return
        }
        showSuccess(schedule?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/pengaturan/transaksi-berulang")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={schedule?.id ? "Formulir ubah transaksi berulang" : "Formulir tambah transaksi berulang"}>
      <FormCard>
        <FormSection title="Jadwal">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Jadwal <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Input id="name" name="name" required defaultValue={schedule?.name ?? ""} placeholder="mis. Sewa kantor bulanan" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Jenis Dokumen <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type" aria-label="Jenis dokumen" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="journal">Jurnal Umum (draf)</SelectItem>
                <SelectItem value="expense">Beban (draf)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="frequency">Frekuensi <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="frequency" aria-label="Frekuensi" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((item) => (
                  <SelectItem key={item} value={item}>{FREQUENCY_LABELS[item as RecurrenceFrequency]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interval">Setiap</Label>
            <Input id="interval" name="interval" type="number" min="1" max="60" defaultValue={schedule?.interval ?? 1} aria-describedby="interval-hint" />
            <span id="interval-hint" className="text-xs text-muted-foreground">1 = setiap periode, 2 = tiap 2 periode, dst.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Mulai" name="startDate" value={startDate} onChange={setStartDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Berakhir (opsional)" name="endDate" value={endDate} onChange={setEndDate} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-default" />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
        </FormSection>

        <FormSection title="Isi Dokumen">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Keterangan</Label>
            <Input id="description" name="description" defaultValue={schedule?.description ?? ""} placeholder="mis. Sewa kantor Oktober" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Nominal <span className="text-destructive" aria-hidden="true">*</span></Label>
            <CurrencyInput id="amount" value={amount} onChange={setAmount} />
          </div>

          {type === "journal" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debitAccountId">Akun Debit <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Combobox id="debitAccountId" required value={debitAccountId} onChange={setDebitAccountId} placeholder="Pilih akun debit..." options={accountOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="creditAccountId">Akun Kredit <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Combobox id="creditAccountId" required value={creditAccountId} onChange={setCreditAccountId} placeholder="Pilih akun kredit..." options={accountOptions} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountId">Akun Beban <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Combobox id="accountId" required value={accountId} onChange={setAccountId} placeholder="Pilih akun beban..." options={accountOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paidFromAccountId">Dibayar Dari</Label>
                <Combobox id="paidFromAccountId" value={paidFromAccountId} onChange={setPaidFromAccountId} placeholder="Kas / bank..." options={accountOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Kategori Beban</Label>
                <Combobox id="categoryId" value={categoryId} onChange={setCategoryId} placeholder="Pilih kategori..." options={expenseCategories.map((c) => ({ value: String(c.id), label: c.label }))} />
              </div>
            </>
          )}
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : schedule?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
