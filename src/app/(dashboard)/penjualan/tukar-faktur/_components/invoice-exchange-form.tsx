"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { createInvoiceExchange } from "@/actions/invoice-exchange.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"

export interface Option {
  value: string
  label: string
}

export interface ExchangeableInvoice {
  id: number
  documentNo: string
  date: string
  grandTotal: number
  paidAmount: number
}

export function InvoiceExchangeForm({
  customerOptions,
  customerId,
  invoices,
}: {
  customerOptions: Option[]
  customerId: string
  invoices: ExchangeableInvoice[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [receiptNumber, setReceiptNumber] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [notes, setNotes] = useState("")
  const [selected, setSelected] = useState<number[]>([])

  const totals = useMemo(() => {
    const chosen = invoices.filter((invoice) => selected.includes(invoice.id))
    const amount = chosen.reduce((sum, invoice) => sum + invoice.grandTotal, 0)
    const paid = chosen.reduce((sum, invoice) => sum + invoice.paidAmount, 0)
    return { amount, paid, outstanding: amount - paid, count: chosen.length }
  }, [invoices, selected])

  function handleCustomerChange(value: string) {
    const query = value ? `?customer=${value}` : ""
    router.push(`/penjualan/tukar-faktur/tambah${query}`)
  }

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selected.length === 0) {
      showError("Pilih minimal satu faktur yang diserahkan.")
      return
    }
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("date", date)
        formData.set("customerId", customerId)
        formData.set("receiptNumber", receiptNumber)
        formData.set("dueDate", dueDate)
        formData.set("notes", notes)
        for (const id of selected) formData.append("invoiceIds", String(id))

        const result = await createInvoiceExchange(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan tukar faktur")
          return
        }
        showSuccess("Tukar faktur tersimpan")
        router.push("/penjualan/tukar-faktur")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan tukar faktur")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan *</Label>
          <Combobox
            id="customerId"
            options={customerOptions}
            value={customerId || null}
            onChange={(value) => handleCustomerChange(value ?? "")}
            placeholder="Pilih pelanggan..."
          />
        </div>

        <AppDatePicker label="Tanggal Penyerahan *" name="date" value={date} onChange={setDate} required />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receiptNumber">Nomor Tanda Terima</Label>
          <Input
            id="receiptNumber"
            name="receiptNumber"
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value)}
            placeholder="Dari pelanggan (opsional)"
          />
        </div>

        <AppDatePicker
          label="Jatuh Tempo Menurut Tanda Terima"
          name="dueDate"
          value={dueDate}
          onChange={setDueDate}
        />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Catatan (opsional)"
            rows={2}
          />
        </div>
      </div>

      {/* Grup checkbox: <fieldset>+<legend> memberi nama grup ke pembaca layar;
          <label> lepas tanpa kontrol sebelumnya adalah label yatim. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm leading-none font-medium">Faktur yang Diserahkan *</legend>
        {!customerId ? (
          <p className="rounded-lg border border-default bg-muted/40 p-4 text-sm text-muted-foreground">
            Pilih pelanggan dulu untuk melihat faktur yang belum lunas.
          </p>
        ) : invoices.length === 0 ? (
          <p className="rounded-lg border border-default bg-muted/40 p-4 text-sm text-muted-foreground">
            Tidak ada faktur belum lunas untuk pelanggan ini (faktur yang sudah pernah diserahkan juga tidak muncul).
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-default rounded-lg border border-default">
            {invoices.map((invoice) => (
              <label key={invoice.id} className="flex items-center gap-3 p-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.includes(invoice.id)}
                  onChange={() => toggle(invoice.id)}
                  disabled={isPending}
                />
                <span className="font-mono">{invoice.documentNo}</span>
                <span className="text-muted-foreground">{invoice.date}</span>
                <span className="ml-auto tabular-nums">{formatAccounting(invoice.grandTotal)}</span>
                <span className="w-32 text-right text-xs text-muted-foreground tabular-nums">
                  sisa {formatAccounting(invoice.grandTotal - invoice.paidAmount)}
                </span>
              </label>
            ))}
          </div>
        )}
        {selected.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {totals.count} faktur · nilai {formatCurrency(totals.amount)} · sudah dibayar {formatCurrency(totals.paid)} ·
            sisa {formatCurrency(totals.outstanding)}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
        <p className="text-xs text-muted-foreground">
          Tukar faktur tidak membuat jurnal — piutang sudah tercatat oleh fakturnya.
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-invoice-exchange">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </form>
  )
}
