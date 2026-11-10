"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition, useMemo } from "react"
import { createBankReconciliation } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
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
  Scale,
  Info,
} from "@/components/ui/fontawesome-icons"

interface Props {
  accounts: { id: number; code: string; name: string }[]
}

export function BankReconciliationForm({ accounts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [accountId, setAccountId] = useState("")
  const [statementBalance, setStatementBalance] = useState<number>(0)
  const [bookBalance, setBookBalance] = useState<number>(0)

  // Estimasi selisih awal rekonsiliasi (Unreconciled Variance)
  const unreconciledVariance = useMemo(() => {
    return statementBalance - bookBalance
  }, [statementBalance, bookBalance])

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    startTransition(async () => {
      try {
        const res = await createBankReconciliation(formData)
        if (!res?.success) throw new Error(res?.error || "Gagal menyimpan data")
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Sesi rekonsiliasi berhasil dibuat")
        // Di ERP: langsung navigasi ke lembar kerja rekonsiliasi untuk mencocokkan baris
        if (res.id) {
          router.push(entityHref("/keuangan/rekonsiliasi-bank", { id: res.id }))
        } else {
          router.push("/keuangan/rekonsiliasi-bank")
        }
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulir tambah rekonsiliasi bank" aria-busy={isPending}>
      <FormCard>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kolom 1 & 2: Form Input Terstruktur */}
          <div className="space-y-6 lg:col-span-2">
            {/* Bagian 1: Akun Bank & Tanggal Cut-off */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Landmark className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Rekening Kas/Bank yang Direkonsiliasi</h3>
              </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
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
                    Pilih akun buku besar kas atau rekening bank yang akan dicocokkan mutasinya.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <AppDatePicker label="Tanggal Laporan Bank *" name="statementDate" required />
                  </div>
                  <div className="sm:col-span-1">
                    <AppDatePicker label="Periode Mulai" name="periodStart" />
                  </div>
                  <div className="sm:col-span-2">
                    <AppDatePicker label="Periode Selesai" name="periodEnd" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bagian 2: Posisi Saldo Perbandingan */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Calculator className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Saldo Cut-Off untuk Rekonsiliasi</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="statementBalance">
                    Saldo Rekening Koran Bank <span aria-hidden="true" className="text-destructive">*</span>
                  </Label>
                  <CurrencyInput
                    id="statementBalance"
                    name="statementBalance"
                    placeholder="0"
                    prefix="Rp"
                    required
                    value={statementBalance}
                    onChange={(val) => setStatementBalance(val || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Saldo akhir fisik yang tertera pada laporan rekening koran dari bank.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bookBalance">Saldo Buku Besar (General Ledger)</Label>
                  <CurrencyInput
                    id="bookBalance"
                    name="bookBalance"
                    placeholder="0"
                    prefix="Rp"
                    value={bookBalance}
                    onChange={(val) => setBookBalance(val || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Saldo tercatat pada buku besar akuntansi per tanggal cut-off.
                  </p>
                </div>
              </div>
            </div>

            {/* Bagian 3: Catatan Dokumen */}
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Catatan Rekonsiliasi</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Catatan atau referensi audit rekonsiliasi (opsional)"
                />
              </div>
            </div>
          </div>

          {/* Kolom 3: Audit Variance Sidebar (Standar ERP) */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-primary" aria-hidden="true" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status Rekonsiliasi Awal
                </h4>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Toleransi selisih pada saat penyelesaian akhir adalah Rp 0 (seimbang).
              </p>

              <div className="mt-4 space-y-3 divide-y divide-border border-y border-border py-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saldo Bank Fisik</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatCurrencyExact(statementBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-muted-foreground">Saldo Buku Kas/Bank</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatCurrencyExact(bookBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 font-semibold">
                  <span>Selisih Belum Terekonsiliasi</span>
                  <span
                    className={`font-mono tabular-nums ${
                      unreconciledVariance === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {formatCurrencyExact(Math.abs(unreconciledVariance))}
                  </span>
                </div>
              </div>

              {unreconciledVariance !== 0 ? (
                <div className="mt-4 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                  <Info className="size-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
                  <p>
                    Terdapat selisih awal sebesar {formatCurrencyExact(Math.abs(unreconciledVariance))}. Anda dapat mencocokkan transaksi dan membuat ayat jurnal penyesuaian di lembar kerja berikutnya.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex gap-2">
                  <Info className="size-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                  <p>
                    Saldo bank dan buku sama persis. Anda tinggal melakukan verifikasi kecocokan baris transaksi.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-recon">
            <span className="flex items-center gap-1.5">
              <span>{isPending ? "Menyimpan..." : "Buat & Buka Lembar Kerja"}</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
