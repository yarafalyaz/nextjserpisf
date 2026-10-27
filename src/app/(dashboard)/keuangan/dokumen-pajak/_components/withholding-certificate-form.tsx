"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import {
  issueWithholdingCertificateAction,
  revokeWithholdingCertificateAction,
  settleWithholdingTaxAction,
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

/**
 * Form bukti potong + setor PPh (F-2026-10-21-003, tahap frontend).
 *
 * Memanggil server action existing `tax-documents.actions.ts` apa adanya;
 * galat service (termasuk format kode billing 15 digit / NTPN 16 karakter)
 * ditampilkan verbatim. UI tidak menghitung tarif/jumlah potong — DPP
 * dikirim sebagai input, tarif dibaca service dari jenis PPh terpilih.
 * Setor memakai izin setor existing, terbit/cabut bupot izin bupot (F-034).
 */

export function WithholdingCertificateForm({
  withholdingTypes,
  vendorBills,
  salesPayments,
}: {
  withholdingTypes: TaxOption[]
  vendorBills: TaxOption[]
  salesPayments: TaxOption[]
}) {
  const router = useRouter()
  const { isPending, idempotencyKeyRef, run } = useTaxDocSubmit(
    "Bukti potong diterbitkan",
    "Gagal menerbitkan bukti potong",
    "/laporan/pajak",
  )
  const [direction, setDirection] = useState("we_withhold")
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [linkId, setLinkId] = useState("")
  const [dpp, setDpp] = useState<number | null>(null)

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    formData.set("direction", direction)
    formData.set("withholdingDate", date)
    formData.set("dpp", dpp === null ? "" : String(dpp))
    formData.set(direction === "we_withhold" ? "vendorBillId" : "salesPaymentId", linkId)
    run(issueWithholdingCertificateAction, formData)
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir terbit bukti potong"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bupot-direction">Arah Bukti Potong <span className="text-destructive" aria-hidden="true">*</span></Label>
          <FormSelect
            id="bupot-direction"
            name="direction"
            required
            value={direction}
            onValueChange={(v) => {
              setDirection(v)
              setLinkId("")
            }}
            options={[
              { value: "we_withhold", label: "Kita memotong (pemasok)" },
              { value: "withheld_from_us", label: "Kita dipotong (pelanggan)" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Potong *" name="withholdingDate" defaultValue={date} onChange={setDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="certificateNumber">Nomor Bukti Potong <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="certificateNumber" name="certificateNumber" required maxLength={100} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="withholdingTypeId">Jenis PPh <span className="text-destructive" aria-hidden="true">*</span></Label>
          <FormSelect id="withholdingTypeId" name="withholdingTypeId" required placeholder="-- Pilih jenis PPh --" options={withholdingTypes} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bupot-dpp">DPP Bruto <span className="text-destructive" aria-hidden="true">*</span></Label>
          <CurrencyInput id="bupot-dpp" name="dpp" required value={dpp} onChange={setDpp} />
          <p className="text-xs text-muted-foreground">Jumlah potong dihitung service dari DPP dan tarif jenis PPh — tidak dihitung di form ini.</p>
        </div>
        {direction === "we_withhold" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-vendorBillId">Tagihan Pembelian Terkait</Label>
            <FormSelect id="bupot-vendorBillId" name="vendorBillId" value={linkId} onValueChange={setLinkId} placeholder="-- Tanpa tautan --" options={vendorBills} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-salesPaymentId">Pembayaran Penjualan Terkait</Label>
            <FormSelect id="bupot-salesPaymentId" name="salesPaymentId" value={linkId} onValueChange={setLinkId} placeholder="-- Tanpa tautan --" options={salesPayments} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bupot-counterpartyName">Nama Pihak <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="bupot-counterpartyName" name="counterpartyName" required maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bupot-counterpartyTaxId">NPWP Pihak</Label>
          <Input id="bupot-counterpartyTaxId" name="counterpartyTaxId" maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="facility">Fasilitas</Label>
          <FormSelect
            id="facility"
            name="facility"
            placeholder="-- Tanpa fasilitas --"
            options={[
              { value: "SKB", label: "SKB" },
              { value: "PP23", label: "PP 23" },
              { value: "DTP", label: "DTP" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="facilityNumber">Nomor Fasilitas</Label>
          <Input id="facilityNumber" name="facilityNumber" maxLength={200} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menerbitkan…" : "Terbitkan Bukti Potong"}
        </Button>
        <Button type="button" variant="outline" isDisabled={isPending} onClick={() => router.push("/laporan/pajak")}>
          Batal
        </Button>
      </div>
    </form>
  )
}

/** Cabut bupot terbit + setor PPh per masa (izin berbeda, F-034). */
export function WithholdingLifecycleActions({
  certificates,
  withholdingTypes,
  liabilityAccounts,
  paymentAccounts,
  canRevoke,
  canSettle,
}: {
  certificates: TaxOption[]
  withholdingTypes: TaxOption[]
  liabilityAccounts: TaxOption[]
  paymentAccounts: TaxOption[]
  canRevoke: boolean
  canSettle: boolean
}) {
  const { isPending, run } = useTaxDocAction("Gagal memproses bukti potong")
  const [certId, setCertId] = useState("")
  const [period, setPeriod] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const keyRef = useRef<string>(crypto.randomUUID())

  if (!canRevoke && !canSettle) return null

  function submitRevoke(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData()
    formData.set("id", certId)
    formData.set("idempotencyKey", keyRef.current)
    keyRef.current = crypto.randomUUID()
    run(revokeWithholdingCertificateAction, formData, "Bukti potong dicabut")
  }

  function submitSettle(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", keyRef.current)
    formData.set("period", period)
    formData.set("amount", amount === null ? "" : String(amount))
    keyRef.current = crypto.randomUUID()
    run(settleWithholdingTaxAction, formData, "Setoran PPh dicatat")
  }

  return (
    <section aria-label="Aksi bukti potong dan setor PPh" className="flex flex-col gap-6">
      {canRevoke && certificates.length > 0 && (
        <form onSubmit={submitRevoke} aria-busy={isPending} className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <h2 className="text-base font-semibold text-foreground">Cabut Bukti Potong</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pencabutan bersifat final untuk bupot terbit — pilih bupot yang benar.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="revoke-cert">Bukti Potong Terbit</Label>
              <FormSelect id="revoke-cert" value={certId} onValueChange={setCertId} placeholder="-- Pilih bupot --" options={certificates} />
            </div>
          </div>
          <div className="mt-5">
            <Button type="submit" variant="danger" isDisabled={isPending || !certId}>{isPending ? "Memproses…" : "Cabut Bupot Ini"}</Button>
          </div>
        </form>
      )}

      {canSettle && (
        <form onSubmit={submitSettle} aria-busy={isPending} className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <h2 className="text-base font-semibold text-foreground">Setor PPh per Masa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kode billing 15 digit dan NTPN 16 karakter divalidasi service — galat tampil apa adanya.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-type">Jenis PPh <span className="text-destructive" aria-hidden="true">*</span></Label>
              <FormSelect id="settle-type" name="withholdingTypeId" required placeholder="-- Pilih jenis PPh --" options={withholdingTypes} />
            </div>
            <div className="flex flex-col gap-1.5">
              <AppMonthPicker label="Masa Setor (YYYY-MM) *" name="period" value={period} onChange={setPeriod} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-amount">Jumlah Setor <span className="text-destructive" aria-hidden="true">*</span></Label>
              <CurrencyInput id="settle-amount" required value={amount} onChange={setAmount} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-paymentAccount">Akun Bayar <span className="text-destructive" aria-hidden="true">*</span></Label>
              <FormSelect id="settle-paymentAccount" name="paymentAccountId" required placeholder="-- Pilih akun bayar --" options={paymentAccounts} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-taxAccount">Akun Utang Pajak</Label>
              <FormSelect id="settle-taxAccount" name="taxAccountId" placeholder="-- Default service --" options={liabilityAccounts} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-billing">Kode Billing (15 digit)</Label>
              <Input id="settle-billing" name="billingCode" inputMode="numeric" maxLength={15} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-ntpn">NTPN (16 karakter)</Label>
              <Input id="settle-ntpn" name="ntpn" maxLength={16} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-reference">Referensi</Label>
              <Input id="settle-reference" name="reference" maxLength={200} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="settle-notes">Catatan</Label>
              <Textarea id="settle-notes" name="notes" maxLength={200} />
            </div>
          </div>
          <div className="mt-5">
            <Button type="submit" isDisabled={isPending}>{isPending ? "Memproses…" : "Catat Setoran"}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
