"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition, useMemo } from "react"
import { createBankStatement } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact } from "@/lib/utils/format"
import {
  Landmark,
  Calendar,
  Calculator,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Info,
} from "@/components/ui/fontawesome-icons"

interface Props {
  accounts: { id: number; code: string; name: string }[]
  banks: { id: number; code: string; name: string }[]
}

export function BankStatementForm({ accounts, banks }: Props) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()
  const [accountId, setAccountId] = useState("")
  const [bankId, setBankId] = useState("")
  const [openingBalance, setOpeningBalance] = useState<number>(0)
  const [closingBalance, setClosingBalance] = useState<number>(0)

  // Kalkulasi selisih / pergerakan mutasi bersih (Net Movement)
  const netMovement = useMemo(() => {
    return closingBalance - openingBalance
  }, [openingBalance, closingBalance])

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current!)
    startTransition(async () => {
      try {
        const res = await createBankStatement(formData)
        if (!res?.success || res.id == null) throw new Error(res?.error || "Gagal menyimpan data")
        showSuccess("Rekening koran berhasil dibuat")
        // Langsung ke detail: di sanalah baris mutasi diisi/diimpor
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kolom 1 & 2: Form Input Terstruktur */}
          <div className="space-y-6 lg:col-span-2">
            {/* Bagian 1: Identitas Rekening Bank */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Landmark className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Identitas Rekening & Referensi</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="accountId">
                    Akun Kas/Bank COA <span aria-hidden="true" className="text-destructive">*</span>
                  </Label>
                  <input type="hidden" name="accountId" value={accountId} />
                  <FormSelect
                    id="accountId"
                    value={accountId}
                    onValueChange={setAccountId}
                    placeholder="-- Pilih Rekening Kas/Bank --"
                    options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Hanya menampilkan akun kas dan setara bank yang aktif untuk rekonsiliasi.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bankId">Nama Bank Mitra</Label>
                  <input type="hidden" name="bankId" value={bankId} />
                  <FormSelect
                    id="bankId"
                    value={bankId}
                    onValueChange={setBankId}
                    placeholder="-- Pilih Bank (opsional) --"
                    options={banks.map((b) => ({ value: String(b.id), label: `${b.code} - ${b.name}` }))}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="accountNumber">Nomor Rekening Bank</Label>
                  <Input id="accountNumber" name="accountNumber" placeholder="mis. 5420-129-880" />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="reference">Nomor Referensi Dokumen / Memo</Label>
                  <Input id="reference" name="reference" placeholder="mis. RK-BCA-2026-10" />
                </div>
              </div>
            </div>

            {/* Bagian 2: Tanggal & Periode Laporan */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Calendar className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Periode Cut-Off Laporan</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <AppDatePicker label="Tanggal Terbit Rekening Koran *" name="date" required />
                </div>
                <div className="sm:col-span-1">
                  <AppDatePicker label="Periode Mulai" name="periodStart" />
                </div>
                <div className="sm:col-span-2">
                  <AppDatePicker label="Periode Selesai" name="periodEnd" />
                </div>
              </div>
            </div>

            {/* Bagian 3: Saldo Kontrol Laporan */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Calculator className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Saldo Rekening Koran Fisik</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="openingBalance">Saldo Awal Tercetak</Label>
                  <CurrencyInput
                    id="openingBalance"
                    name="openingBalance"
                    placeholder="0"
                    prefix="Rp"
                    value={openingBalance}
                    onChange={(val) => setOpeningBalance(val || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">Saldo per awal periode sebelum mutasi.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="closingBalance">Saldo Akhir Tercetak</Label>
                  <CurrencyInput
                    id="closingBalance"
                    name="closingBalance"
                    placeholder="0"
                    prefix="Rp"
                    value={closingBalance}
                    onChange={(val) => setClosingBalance(val || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">Saldo per akhir periode penutupan bank.</p>
                </div>
              </div>
            </div>

            {/* Bagian 4: Catatan Dokumen */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Catatan & Keterangan</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Catatan rekening koran atau instruksi audit (opsional)"
                />
              </div>
            </div>
          </div>

          {/* Kolom 3: Audit Summary / Checksum Sidebar (Standar ERP) */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ringkasan Kontrol Mutasi
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifikasi nilai kontrol untuk memastikan mutasi yang diimpor nanti seimbang.
              </p>

              <div className="mt-4 space-y-3 divide-y divide-border border-y border-border py-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saldo Awal</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatCurrencyExact(openingBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-muted-foreground">Saldo Akhir</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatCurrencyExact(closingBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 font-semibold">
                  <div className="flex items-center gap-1.5">
                    {netMovement >= 0 ? (
                      <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    )}
                    <span>Estimasi Mutasi Bersih</span>
                  </div>
                  <span
                    className={`font-mono tabular-nums ${
                      netMovement >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {netMovement >= 0 ? "+" : ""}
                    {formatCurrencyExact(netMovement)}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground flex gap-2">
                <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />
                <p>
                  Setelah header rekening koran disimpan, Anda akan diarahkan ke lembar kerja untuk mengisi atau mengimpor file mutasi (.CSV / Excel).
                </p>
              </div>
            </div>
          </div>
        </div>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            <span className="flex items-center gap-1.5">
              <span>{isPending ? "Menyimpan..." : "Simpan & Lanjutkan"}</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
