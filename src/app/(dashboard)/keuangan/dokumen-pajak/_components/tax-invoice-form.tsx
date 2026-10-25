"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import {
  issueTaxInvoiceAction,
  replaceTaxInvoiceAction,
  cancelTaxInvoiceAction,
  creditInputInvoiceAction,
} from "@/actions/tax-documents.actions"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { useTaxDocSubmit, useTaxDocAction, type TaxOption } from "./tax-doc-submit"

export type { TaxOption }

const DIRECTION_OPTIONS: TaxOption[] = [
  { value: "out", label: "Keluaran (penjualan)" },
  { value: "in", label: "Masukan (pembelian)" },
]

/**
 * Form dokumen pajak (F-2026-10-21-001..006, tahap frontend).
 *
 * Memanggil server action existing `tax-documents.actions.ts` apa adanya;
 * galat service ditampilkan verbatim (tanpa parafrase) supaya aturan pajak
 * tidak berubah makna di UI. UI tidak menghitung DPP/PPN — harga jual dan
 * tarif nominal dikirim sebagai input form ke service. Aksi pengganti,
 * batal, dan kredit masukan berjalan lewat dialog konfirmasi berisi form
 * singkat (satu dokumen, alasan wajib), bukan halaman terpisah.
 */

export function TaxInvoiceForm({
  salesInvoices,
  vendorBills,
  vendors,
}: {
  salesInvoices: TaxOption[]
  vendorBills: TaxOption[]
  vendors: TaxOption[]
}) {
  const router = useRouter()
  const { isPending, idempotencyKeyRef, run } = useTaxDocSubmit(
    "Faktur pajak diterbitkan",
    "Gagal menerbitkan faktur pajak",
    "/laporan/pajak",
  )
  const [direction, setDirection] = useState("out")
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [linkId, setLinkId] = useState("")
  const [sellingPrice, setSellingPrice] = useState<number | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    formData.set("direction", direction)
    formData.set("taxInvoiceDate", date)
    formData.set("sellingPrice", sellingPrice === null ? "" : String(sellingPrice))
    formData.set(direction === "out" ? "salesInvoiceId" : "vendorBillId", linkId)
    run(issueTaxInvoiceAction, formData)
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir terbit faktur pajak"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="direction">Arah Faktur <span className="text-destructive" aria-hidden="true">*</span></Label>
          <FormSelect
            id="direction"
            name="direction"
            required
            value={direction}
            onValueChange={(v) => {
              setDirection(v)
              setLinkId("")
            }}
            options={DIRECTION_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Faktur *" name="taxInvoiceDate" defaultValue={date} onChange={setDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxInvoiceNumber">Nomor Faktur Pajak <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="taxInvoiceNumber" name="taxInvoiceNumber" required maxLength={50} placeholder="mis. 010.000-26.00000001" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transactionCode">Kode Transaksi</Label>
          <Input id="transactionCode" name="transactionCode" maxLength={200} placeholder="Opsional" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sellingPrice">Harga Jual / Penggantian (DPP) <span className="text-destructive" aria-hidden="true">*</span></Label>
          <CurrencyInput id="sellingPrice" name="sellingPrice" required value={sellingPrice} onChange={setSellingPrice} />
          <p className="text-xs text-muted-foreground">PPN dihitung service dari DPP dan tarif — tidak dihitung di form ini.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nominalRate">Tarif Nominal (%)</Label>
          <Input id="nominalRate" name="nominalRate" type="number" min={0} max={100} step="0.01" placeholder="Kosongkan = tarif efektif service" />
        </div>
        {direction === "out" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="salesInvoiceId">Faktur Penjualan Terkait</Label>
            <FormSelect id="salesInvoiceId" name="salesInvoiceId" value={linkId} onValueChange={setLinkId} placeholder="-- Tanpa tautan --" options={salesInvoices} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendorBillId">Tagihan Pembelian Terkait</Label>
              <FormSelect id="vendorBillId" name="vendorBillId" value={linkId} onValueChange={setLinkId} placeholder="-- Tanpa tautan --" options={vendorBills} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendorId">Pemasok</Label>
              <FormSelect id="vendorId" name="vendorId" placeholder="-- Pilih pemasok --" options={vendors} />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counterpartyName">Nama Lawan Transaksi</Label>
          <Input id="counterpartyName" name="counterpartyName" maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counterpartyTaxId">NPWP Lawan Transaksi</Label>
          <Input id="counterpartyTaxId" name="counterpartyTaxId" maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counterpartyNitku">NITKU Lawan Transaksi</Label>
          <Input id="counterpartyNitku" name="counterpartyNitku" maxLength={200} />
        </div>
        {direction === "out" ? (
          <div className="flex min-h-11 items-center gap-2 sm:col-span-2">
            <input id="legacy15Confirmed" name="legacy15Confirmed" type="checkbox" value="true" className="size-4 shrink-0 rounded border-default" />
            <Label htmlFor="legacy15Confirmed" className="font-normal">
              NPWP lawan 15 digit (legacy) — saya konfirmasi terbit tetap dilanjutkan dengan NPWP 15 digit
            </Label>
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menerbitkan…" : "Terbitkan Faktur Pajak"}
        </Button>
        <Button type="button" variant="outline" isDisabled={isPending} onClick={() => router.push("/laporan/pajak")}>
          Batal
        </Button>
      </div>
    </form>
  )
}

/** Aksi atas satu faktur terbit: pengganti / batal / kredit masukan. */
export function TaxInvoiceLifecycleActions({ invoices }: { invoices: TaxOption[] }) {
  const { isPending, run } = useTaxDocAction()
  const [mode, setMode] = useState<"replace" | "cancel" | "credit" | "">("")
  const [invoiceId, setInvoiceId] = useState("")
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [sellingPrice, setSellingPrice] = useState<number | null>(null)
  const [creditPeriod, setCreditPeriod] = useState("")
  const keyRef = useRef<string>(crypto.randomUUID())

  if (invoices.length === 0) return null

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", keyRef.current)
    if (mode === "replace") {
      formData.set("replacesId", invoiceId)
      formData.set("taxInvoiceDate", date)
      formData.set("sellingPrice", sellingPrice === null ? "" : String(sellingPrice))
      run(replaceTaxInvoiceAction, formData, "Faktur pengganti diterbitkan")
    } else if (mode === "cancel") {
      formData.set("id", invoiceId)
      run(cancelTaxInvoiceAction, formData, "Faktur pajak dibatalkan")
    } else if (mode === "credit") {
      formData.set("id", invoiceId)
      formData.set("creditPeriod", creditPeriod)
      run(creditInputInvoiceAction, formData, "Kredit pajak masukan dicatat")
    }
    keyRef.current = crypto.randomUUID()
  }

  return (
    <section aria-label="Aksi faktur pajak terbit" className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h2 className="text-base font-semibold text-foreground">Pengganti, Pembatalan, dan Kredit Masukan</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pilih faktur terbit, lalu jenis aksi. Alasan dan nomor pengganti wajib — galat dari service tampil apa adanya.
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lifecycle-invoice">Faktur Pajak Terbit</Label>
          <FormSelect id="lifecycle-invoice" value={invoiceId} onValueChange={setInvoiceId} placeholder="-- Pilih faktur --" options={invoices} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lifecycle-mode">Jenis Aksi</Label>
          <FormSelect
            id="lifecycle-mode"
            value={mode}
            onValueChange={(v) => setMode(v as typeof mode)}
            placeholder="-- Pilih aksi --"
            options={[
              { value: "replace", label: "Terbitkan faktur pengganti" },
              { value: "cancel", label: "Batalkan faktur" },
              { value: "credit", label: "Kreditkan pajak masukan" },
            ]}
          />
        </div>
      </div>

      {mode === "replace" && invoiceId && (
        <form onSubmit={submit} aria-busy={isPending} className="mt-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-number">Nomor Faktur Pengganti <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Input id="replace-number" name="taxInvoiceNumber" required maxLength={50} />
            </div>
            <div className="flex flex-col gap-1.5">
              <AppDatePicker label="Tanggal Pengganti *" name="taxInvoiceDate" defaultValue={date} onChange={setDate} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-price">Harga Jual / Penggantian Baru <span className="text-destructive" aria-hidden="true">*</span></Label>
              <CurrencyInput id="replace-price" required value={sellingPrice} onChange={setSellingPrice} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-reason">Alasan Pengganti <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Textarea id="replace-reason" name="replaceReason" required maxLength={500} />
            </div>
          </div>
          <div>
            <Button type="submit" isDisabled={isPending}>{isPending ? "Memproses…" : "Terbitkan Pengganti"}</Button>
          </div>
        </form>
      )}

      {mode === "cancel" && invoiceId && (
        <form onSubmit={submit} aria-busy={isPending} className="mt-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-reason">Alasan Pembatalan <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Textarea id="cancel-reason" name="cancelReason" required maxLength={500} />
          </div>
          <div>
            <Button type="submit" variant="danger" isDisabled={isPending}>{isPending ? "Memproses…" : "Batalkan Faktur Ini"}</Button>
          </div>
        </form>
      )}

      {mode === "credit" && invoiceId && (
        <form onSubmit={submit} aria-busy={isPending} className="mt-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <AppMonthPicker label="Masa Kredit (YYYY-MM) *" name="creditPeriod" value={creditPeriod} onChange={setCreditPeriod} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="creditablePercent">Persen Dapat Dikreditkan (%)</Label>
              <Input id="creditablePercent" name="creditablePercent" type="number" min={0} max={100} step="0.01" placeholder="Kosongkan = aturan service" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="nonCreditableReason">Alasan Tidak Dapat Dikreditkan</Label>
              <Textarea id="nonCreditableReason" name="nonCreditableReason" maxLength={200} />
            </div>
          </div>
          <div>
            <Button type="submit" isDisabled={isPending}>{isPending ? "Memproses…" : "Catat Kredit Masukan"}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
