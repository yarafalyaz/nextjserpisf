"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowRight } from "lucide-react"

import { createTaxPayment } from "@/actions/tax-payment.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export interface Option {
  value: string
  label: string
}

export function TaxPaymentForm({
  taxTypes,
  liabilityAccounts,
  paymentAccounts,
}: {
  taxTypes: Option[]
  liabilityAccounts: Option[]
  paymentAccounts: Option[]
}) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [period, setPeriod] = useState("")
  const [taxTypeId, setTaxTypeId] = useState("")
  const [taxAccountId, setTaxAccountId] = useState("")
  const [paymentAccountId, setPaymentAccountId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("date", date)
        formData.set("period", period)
        formData.set("taxTypeId", taxTypeId)
        formData.set("taxAccountId", taxAccountId)
        formData.set("paymentAccountId", paymentAccountId)
        formData.set("amount", amount === null ? "" : String(amount))
        formData.set("reference", reference)
        formData.set("notes", notes)

        const result = await createTaxPayment(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan penyetoran pajak")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Penyetoran pajak tersimpan dan jurnalnya diposting")
        router.push("/keuangan/penyetoran-pajak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan penyetoran pajak")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir tambah penyetoran pajak"
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <AppDatePicker label="Tanggal Setor *" name="date" value={date} onChange={setDate} required />

        <div className="flex flex-col gap-1.5">
          <AppMonthPicker label="Masa Pajak" name="period" value={period} onChange={setPeriod} />
          <span className="text-xs text-muted-foreground">Mis. September 2026. Boleh dikosongkan (klik bulan terpilih untuk mengosongkan).</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxTypeId">Jenis Pemotongan</Label>
          <Combobox
            id="taxTypeId"
            options={taxTypes}
            value={taxTypeId || null}
            onChange={(value) => setTaxTypeId(value ?? "")}
            placeholder="Opsional"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">
            Jumlah Setor <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput id="amount" value={amount} onChange={setAmount} placeholder="0" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxAccountId">
            Akun Utang Pajak <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Combobox
            id="taxAccountId"
            required
            options={liabilityAccounts}
            value={taxAccountId || null}
            onChange={(value) => setTaxAccountId(value ?? "")}
            placeholder="Mis. 210202 PPh 23 Pembelian"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentAccountId">
            Dibayar dari Kas/Bank <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Combobox
            id="paymentAccountId"
            required
            options={paymentAccounts}
            value={paymentAccountId || null}
            onChange={(value) => setPaymentAccountId(value ?? "")}
            placeholder="Pilih rekening kas/bank..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reference">Nomor SSP / MPN</Label>
          <Input
            id="reference"
            name="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Bukti setor (opsional)"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Keterangan</Label>
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Keterangan (opsional)"
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Jurnal: Dr utang pajak <ArrowRight size={12} aria-hidden="true" /> Cr kas/bank
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-tax-payment">
            {isPending ? "Menyimpan..." : "Simpan & Posting"}
          </Button>
        </div>
      </div>
    </form>
  )
}
