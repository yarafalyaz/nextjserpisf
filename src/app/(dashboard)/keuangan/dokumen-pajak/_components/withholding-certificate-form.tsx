"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

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
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { useTaxDocSubmit, useTaxDocAction, type TaxOption } from "./tax-doc-submit"
import {
  Building2,
  Receipt,
  FileSpreadsheet,
  CreditCard,
  Ban,
} from "@/components/ui/fontawesome-icons"

export type { TaxOption }

export interface ExtendedTaxOption extends TaxOption {
  counterpartyName?: string
  counterpartyTaxId?: string
  dpp?: number
}

/**
 * Form bukti potong + setor PPh (F-2026-10-21-003, tahap frontend).
 *
 * Memanggil server action existing `tax-documents.actions.ts` apa adanya;
 * galat service (termasuk format kode billing 15 digit / NTPN 16 karakter)
 * ditampilkan verbatim. UI tidak menghitung tarif/jumlah potong - DPP
 * dikirim sebagai input, tarif dibaca service dari jenis PPh terpilih.
 * Setor memakai izin setor existing, terbit/cabut bupot izin bupot (F-034).
 */

export function WithholdingCertificateForm({
  withholdingTypes,
  vendorBills,
  salesPayments,
}: {
  withholdingTypes: TaxOption[]
  vendorBills: ExtendedTaxOption[]
  salesPayments: ExtendedTaxOption[]
}) {
  const router = useRouter()
  const { isPending, idempotencyKeyRef, run } = useTaxDocSubmit(
    "Bukti potong berhasil diterbitkan",
    "Gagal menerbitkan bukti potong",
    "/keuangan/dokumen-pajak/bupot",
  )
  const [direction, setDirection] = useState("we_withhold")
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [linkId, setLinkId] = useState("")
  const [dpp, setDpp] = useState<number | null>(null)
  const [counterpartyName, setCounterpartyName] = useState("")
  const [counterpartyTaxId, setCounterpartyTaxId] = useState("")

  function handleSelectLinkId(newLinkId: string) {
    setLinkId(newLinkId)
    if (!newLinkId) return
    const list = direction === "we_withhold" ? vendorBills : salesPayments
    const selected = list.find((item) => item.value === newLinkId)
    if (selected) {
      if (selected.counterpartyName) setCounterpartyName(selected.counterpartyName)
      if (selected.counterpartyTaxId) setCounterpartyTaxId(selected.counterpartyTaxId)
      if (selected.dpp !== undefined && selected.dpp !== null && !dpp) {
        setDpp(selected.dpp)
      }
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    formData.set("direction", direction)
    formData.set("withholdingDate", date)
    formData.set("dpp", dpp === null ? "" : String(dpp))
    formData.set("counterpartyName", counterpartyName)
    formData.set("counterpartyTaxId", counterpartyTaxId)
    formData.set(direction === "we_withhold" ? "vendorBillId" : "salesPaymentId", linkId)
    run(issueWithholdingCertificateAction, formData)
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir terbit bukti potong"
      className="flex flex-col gap-6"
    >
      {/* Seksi 1: Parameter & Arah Dokumen Bukti Potong */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <Receipt className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
            1. Parameter & Nomor Dokumen
          </h2>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-direction">
              Arah Bukti Potong <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <FormSelect
              id="bupot-direction"
              name="direction"
              required
              value={direction}
              onValueChange={(v) => {
                setDirection(v)
                setLinkId("")
                setCounterpartyName("")
                setCounterpartyTaxId("")
                setDpp(null)
              }}
              options={[
                { value: "we_withhold", label: "Dipungut Sendiri (Kita memotong vendor / Pemasok)" },
                { value: "withheld_from_us", label: "Dipotong Pelanggan (Pelanggan memotong pembayaran kita)" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {direction === "we_withhold"
                ? "Pencatatan utang pajak PPh atas tagihan vendor / subkontraktor."
                : "Pencatatan PPh dibayar dimuka (uang muka pajak) atas penerimaan piutang penjualan."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="certificateNumber">
              Nomor Bukti Potong (DJP / Unifikasi) <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="certificateNumber"
              name="certificateNumber"
              required
              maxLength={100}
              placeholder="Contoh: BP-2026-11-0001"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Nomor seri resmi e-Bupot Unifikasi dari aplikasi DJP.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Pemotongan *"
              name="withholdingDate"
              defaultValue={date}
              onChange={setDate}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withholdingTypeId">
              Jenis PPh Unifikasi <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <FormSelect
              id="withholdingTypeId"
              name="withholdingTypeId"
              required
              placeholder="-- Pilih jenis pasal PPh --"
              options={withholdingTypes}
            />
          </div>
        </div>
      </div>

      {/* Seksi 2: Pihak Rekanan & Dokumen Komersial Sumber */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
            2. Pihak Rekanan & Dokumen Sumber
          </h2>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {direction === "we_withhold" ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bupot-vendorBillId">Tautkan ke Tagihan Pembelian (Vendor Bill)</Label>
              <FormSelect
                id="bupot-vendorBillId"
                name="vendorBillId"
                value={linkId}
                onValueChange={handleSelectLinkId}
                placeholder="-- Pilih tagihan pembelian untuk isi otomatis --"
                options={vendorBills}
              />
              <p className="text-xs text-muted-foreground">
                Memilih tagihan vendor akan mengisi otomatis nama rekanan, NPWP, dan dasar pengenaan pajak.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bupot-salesPaymentId">Tautkan ke Penerimaan Pembayaran Penjualan</Label>
              <FormSelect
                id="bupot-salesPaymentId"
                name="salesPaymentId"
                value={linkId}
                onValueChange={handleSelectLinkId}
                placeholder="-- Pilih penerimaan kas pelanggan untuk isi otomatis --"
                options={salesPayments}
              />
              <p className="text-xs text-muted-foreground">
                Memilih pembayaran piutang akan mengalokasikan kredit pajak pemotongan langsung pada mutasi bersangkutan.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-counterpartyName">
              Nama Rekanan / Wajib Pajak <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="bupot-counterpartyName"
              name="counterpartyName"
              required
              maxLength={200}
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="Nama badan usaha atau wajib pajak orang pribadi"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-counterpartyTaxId">NPWP / NIK 16 Digit Pihak Terkait</Label>
            <Input
              id="bupot-counterpartyTaxId"
              name="counterpartyTaxId"
              maxLength={200}
              value={counterpartyTaxId}
              onChange={(e) => setCounterpartyTaxId(e.target.value)}
              placeholder="00.000.000.0-000.000 atau NIK 16 digit"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Seksi 3: Dasar Pengenaan Pajak & Fasilitas Pajak */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
            3. Dasar Pengenaan Pajak (DPP) & Fasilitas
          </h2>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bupot-dpp">
              Dasar Pengenaan Pajak (DPP Bruto) <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <CurrencyInput
              id="bupot-dpp"
              name="dpp"
              required
              value={dpp}
              onChange={setDpp}
            />
            <p className="text-xs text-muted-foreground">
              Nominal potongan resmi dihitung otomatis oleh sistem perpajakan berdasarkan master tarif PPh terpilih.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="facility">Fasilitas Pembebasan Pajak</Label>
            <FormSelect
              id="facility"
              name="facility"
              placeholder="-- Tanpa Fasilitas (Tarif Normal) --"
              options={[
                { value: "SKB", label: "SKB (Surat Keterangan Bebas)" },
                { value: "PP23", label: "PP 23 (PPh Final UMKM 0.5%)" },
                { value: "DTP", label: "DTP (Ditanggung Pemerintah)" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="facilityNumber">Nomor Dokumen Fasilitas (SKB / Surat Keterangan)</Label>
            <Input
              id="facilityNumber"
              name="facilityNumber"
              maxLength={200}
              placeholder="Nomor SKB atau surat keterangan PP23 terdaftar (jika ada)"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          isDisabled={isPending}
          onClick={() => router.push("/keuangan/dokumen-pajak/bupot")}
        >
          Batal
        </Button>
        <Button
          type="submit"
          isDisabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs min-h-11 sm:min-h-9 px-6 font-medium cursor-pointer"
        >
          {isPending ? "Menerbitkan Bukti Potong..." : "Terbitkan Bukti Potong"}
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
  const { isPending, keyRef, run } = useTaxDocAction("Gagal memproses bukti potong")
  const [certId, setCertId] = useState("")
  const [period, setPeriod] = useState("")
  const [amount, setAmount] = useState<number | null>(null)

  if (!canRevoke && !canSettle) return null

  function submitRevoke(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData()
    formData.set("id", certId)
    // Key diputar hook sesudah sukses; retry memakai key sama (putaran 52).
    formData.set("idempotencyKey", keyRef.current)
    run(revokeWithholdingCertificateAction, formData, "Bukti potong berhasil dicabut")
  }

  function submitSettle(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", keyRef.current)
    formData.set("period", period)
    formData.set("amount", amount === null ? "" : String(amount))
    run(settleWithholdingTaxAction, formData, "Setoran PPh berhasil dicatat")
  }

  return (
    <section aria-label="Aksi bukti potong dan setor PPh" className="flex flex-col gap-6 mt-4">
      <div className="border-t border-border pt-6">
        <h3 className="text-base font-semibold text-foreground tracking-tight">
          Aksi Administrasi Lanjutan Dokumen Pajak
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Pengelolaan dokumen bukti potong yang sudah terbit dan pencatatan kewajiban penyetoran unifikasi.
        </p>
      </div>

      {canRevoke && certificates.length > 0 && (
        <form
          onSubmit={submitRevoke}
          aria-busy={isPending}
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Ban className="size-4 text-destructive" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-destructive uppercase tracking-tight">
              Pencabutan Bukti Potong Resmi
            </h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pencabutan bersifat final untuk dokumen bukti potong yang telah terbit. Pastikan nomor bukti potong yang dipilih sudah diverifikasi dengan DJP.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="revoke-cert">Pilih Bukti Potong Terbit</Label>
              <FormSelect
                id="revoke-cert"
                value={certId}
                onValueChange={setCertId}
                placeholder="-- Pilih bukti potong terbit --"
                options={certificates}
              />
            </div>
          </div>
          <div className="mt-5">
            <Button type="submit" variant="danger" isDisabled={isPending || !certId}>
              {isPending ? "Memproses Pencabutan..." : "Cabut Bukti Potong Ini"}
            </Button>
          </div>
        </form>
      )}

      {canSettle && (
        <form
          onSubmit={submitSettle}
          aria-busy={isPending}
          className="rounded-xl border border-border bg-card p-6 shadow-2xs"
        >
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" aria-hidden="true" />
              <h4 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                Pencatatan Setor PPh per Masa
              </h4>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
              Validasi NTPN DJP
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Kode billing 15 digit dan NTPN 16 karakter divalidasi langsung oleh sistem perpajakan.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-type">
                Jenis PPh <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <FormSelect
                id="settle-type"
                name="withholdingTypeId"
                required
                placeholder="-- Pilih jenis PPh --"
                options={withholdingTypes}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <AppMonthPicker
                label="Masa Setor (YYYY-MM) *"
                name="period"
                value={period}
                onChange={setPeriod}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-amount">
                Jumlah Setor Kas Pajak <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <CurrencyInput id="settle-amount" required value={amount} onChange={setAmount} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-paymentAccount">
                Akun Kas/Bank Pembayar <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <FormSelect
                id="settle-paymentAccount"
                name="paymentAccountId"
                required
                placeholder="-- Pilih akun bank --"
                options={paymentAccounts}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-taxAccount">Akun Utang Pajak Terkait</Label>
              <FormSelect
                id="settle-taxAccount"
                name="taxAccountId"
                placeholder="-- Sesuai akun default jenis pajak --"
                options={liabilityAccounts}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-billing">Kode Billing DJP (15 digit angka)</Label>
              <Input
                id="settle-billing"
                name="billingCode"
                inputMode="numeric"
                maxLength={15}
                placeholder="012345678901234"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-ntpn">NTPN Resmi (16 karakter alfanumerik)</Label>
              <Input
                id="settle-ntpn"
                name="ntpn"
                maxLength={16}
                placeholder="Contoh: 1A2B3C4D5E6F7G8H"
                className="font-mono text-sm uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-reference">Nomor Referensi Transaksi Bank</Label>
              <Input id="settle-reference" name="reference" maxLength={200} placeholder="Ref transaksi atau bukti transfer bank" />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              type="submit"
              isDisabled={isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs min-h-11 sm:min-h-9 px-6 font-medium cursor-pointer"
            >
              {isPending ? "Mencatat Setoran..." : "Catat Penyetoran Pajak"}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
