"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { createSptFiling } from "@/actions/spt-filing.actions"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Check } from "@/components/ui/fontawesome-icons"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  SPT_TYPE_LABELS,
  SPT_TYPE_VALUES,
} from "@/lib/validations/spt-filing.schemas"
import type { SptFilingTaxPaymentOption } from "@/lib/reports/spt-filing-data"
import { formatCurrencyExact } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"

interface SptFilingFormProps {
  taxPayments: SptFilingTaxPaymentOption[]
  defaultFiledAt: string
  defaultPeriod: string
}

const SPT_TYPE_OPTIONS = SPT_TYPE_VALUES.map((t) => ({
  value: t,
  label: SPT_TYPE_LABELS[t],
}))

export function SptFilingForm({
  taxPayments,
  defaultFiledAt,
  defaultPeriod,
}: Readonly<SptFilingFormProps>) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [sptType, setSptType] = useState<string>("ppn")
  const [period, setPeriod] = useState<string>(defaultPeriod)
  const [amendmentNo, setAmendmentNo] = useState<string>("0")
  const [filedAt, setFiledAt] = useState<string>(defaultFiledAt)
  const [bpeNumber, setBpeNumber] = useState<string>("")
  const [underOverPayment, setUnderOverPayment] = useState<number>(0)
  const [compensationBalance, setCompensationBalance] = useState<number>(0)
  const [taxPaymentId, setTaxPaymentId] = useState<string>("")
  const [varianceNote, setVarianceNote] = useState<string>("")

  const taxPaymentOptions = taxPayments.map((p) => ({
    value: String(p.id),
    label: `${p.documentNo} (${p.period ?? "-"}) : ${formatCurrencyExact(p.amount)}${p.ntpn ? ` | NTPN ${p.ntpn}` : ""}`,
  }))

  function handleSptTypeChange(nextType: string | null) {
    const resolved = nextType || "ppn"
    setSptType(resolved)
    if (resolved === "tahunan" && period.includes("-")) {
      setPeriod(period.slice(0, 4))
    } else if (resolved !== "tahunan" && period.length === 4) {
      setPeriod(defaultPeriod)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("sptType", sptType)
        formData.set("period", period)
        formData.set("amendmentNo", amendmentNo)
        formData.set("filedAt", filedAt)
        formData.set("bpeNumber", bpeNumber)
        formData.set("underOverPayment", String(underOverPayment))
        formData.set("compensationBalance", String(compensationBalance))
        formData.set("taxPaymentId", taxPaymentId)
        formData.set("varianceNote", varianceNote)

        const res = await createSptFiling(formData)
        if (!res.success) {
          showError(res.error ?? "Gagal mencatat pelaporan SPT.")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Catatan pelaporan SPT berhasil disimpan ke register.")
        router.push("/keuangan/register-spt")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mencatat pelaporan SPT.")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir catat pelaporan SPT"
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm max-w-3xl"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sptType">
            Jenis SPT <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Combobox
            id="sptType"
            required
            options={SPT_TYPE_OPTIONS}
            value={sptType || null}
            onChange={handleSptTypeChange}
            placeholder="Pilih jenis SPT"
          />
        </div>

        {sptType === "tahunan" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="period">
              Tahun Pajak (YYYY) <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="period"
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026"
              className="font-mono tabular-nums"
              required
              maxLength={4}
            />
          </div>
        ) : (
          <AppMonthPicker
            label="Masa Pajak *"
            name="period"
            value={period}
            onChange={setPeriod}
            required
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amendmentNo">
            Versi Pembetulan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Input
            id="amendmentNo"
            type="number"
            min={0}
            max={99}
            value={amendmentNo}
            onChange={(e) => setAmendmentNo(e.target.value)}
            className="font-mono tabular-nums"
            aria-describedby="amendmentNo-hint"
            required
          />
          <span id="amendmentNo-hint" className="text-xs text-muted-foreground">
            0 = Normal, 1 = Pembetulan ke-1, 2 = Pembetulan ke-2, dst.
          </span>
        </div>

        <AppDatePicker
          label="Tanggal Lapor Coretax *"
          name="filedAt"
          value={filedAt}
          onChange={setFiledAt}
          required
        />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="bpeNumber">
            Nomor BPE (Bukti Penerimaan Elektronik){" "}
            <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Input
            id="bpeNumber"
            type="text"
            value={bpeNumber}
            onChange={(e) => setBpeNumber(e.target.value)}
            placeholder="Salin nomor BPE persis dari Coretax"
            className="font-mono tabular-nums"
            required
            maxLength={100}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="underOverPayment">
            Kurang / (Lebih) Bayar Coretax (Rp){" "}
            <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="underOverPayment"
            value={underOverPayment}
            onChange={setUnderOverPayment}
            allowNegative
            placeholder="0"
            className="font-mono tabular-nums"
            aria-describedby="underOverPayment-hint"
            required
          />
          <span id="underOverPayment-hint" className="text-xs text-muted-foreground">
            Positif = kurang bayar, negatif (-) = lebih bayar.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compensationBalance">
            Saldo Kompensasi Coretax Sesudah Lapor (Rp){" "}
            <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="compensationBalance"
            value={compensationBalance}
            onChange={setCompensationBalance}
            allowNegative
            placeholder="0"
            className="font-mono tabular-nums"
            aria-describedby="compensationBalance-hint"
            required
          />
          <span id="compensationBalance-hint" className="text-xs text-muted-foreground">
            Salin dari tabel kompensasi Coretax (boleh negatif pada pembetulan).
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="taxPaymentId">Tautan Setoran Pajak (Opsional)</Label>
          <Combobox
            id="taxPaymentId"
            options={taxPaymentOptions}
            value={taxPaymentId || null}
            onChange={(value) => setTaxPaymentId(value ?? "")}
            placeholder="Tidak ada / SPT nihil atau lebih bayar"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="varianceNote">
            Penjelasan Selisih Buku vs Coretax / Catatan Versi (Opsional)
          </Label>
          <Textarea
            id="varianceNote"
            value={varianceNote}
            onChange={(e) => setVarianceNote(e.target.value)}
            placeholder="Contoh: Selisih Rp... = penyesuaian kompensasi Coretax atas pembetulan masa 2026-03 (BPE ...); buku koreksi via JRN ... tanggal ..."
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <Button
          type="submit"
          variant="primary"
          className="min-h-11 sm:min-h-9 gap-1.5"
          isDisabled={isPending}
          aria-label="Simpan catatan pelaporan SPT ke register"
        >
          <Check className="size-3.5" aria-hidden="true" />
          <span>{isPending ? "Menyimpan…" : "Simpan ke Register"}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          isDisabled={isPending}
          onClick={() => router.back()}
        >
          Batal
        </Button>
      </div>
    </form>
  )
}
