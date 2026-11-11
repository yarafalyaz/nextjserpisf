"use client"

import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatCurrencyExact } from "@/lib/utils/format"
import {
  Wallet,
  Receipt,
  RotateCcw,
  FileText,
  Paperclip,
  Check,
} from "@/components/ui/fontawesome-icons"

// P2 idempotency UI: generator key murni di luar render (pola customer-credit-panel).
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function PettyCashForm({
  accounts,
  pettyCash,
  currentBalance = 0,
  defaultType,
  projects = [],
  vendors = [],
  categories = [],
}: {
  accounts: { id: number; code: string; name: string; type: string }[];
  pettyCash?: {
    id: number;
    date: string;
    type?: string;
    description?: string | null;
    amount: number;
    accountId: number;
    notes?: string | null;
    referenceNo?: string | null;
    balanceBefore?: number;
    balanceAfter?: number;
    projectId?: number | null;
    vendorId?: number | null;
    categoryId?: number | null;
  };
  currentBalance?: number;
  defaultType?: "IN" | "OUT";
  projects?: { id: number; name: string; documentNo: string | null }[];
  vendors?: { id: number; name: string }[];
  categories?: { id: number; name: string; label: string }[];
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(pettyCash?.date ?? toLocalDateOnly(new Date()))
  const [type, setType] = useState<string>(pettyCash?.type ?? defaultType ?? "OUT")
  const [accountId, setAccountId] = useState<string | null>(pettyCash?.accountId ? String(pettyCash.accountId) : null)
  const [projectId, setProjectId] = useState<string | null>(pettyCash?.projectId ? String(pettyCash.projectId) : null)
  const [forProject, setForProject] = useState<boolean>(Boolean(pettyCash?.projectId))
  const [vendorId, setVendorId] = useState<string | null>(pettyCash?.vendorId ? String(pettyCash.vendorId) : null)
  const [categoryId, setCategoryId] = useState<string | null>(pettyCash?.categoryId ? String(pettyCash.categoryId) : null)
  const [accountList, setAccountList] = useState(accounts)
  const [vendorOptions, setVendorOptions] = useState(vendors)
  const [amount, setAmount] = useState<number>(pettyCash?.amount ?? 0)

  // P2 idempotency UI: satu key stabil per submit create
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

  const isInflow = type === "IN"
  const assetAccounts = accountList.filter((a) => a.type === "ASSET")
  const expenseAccounts = accountList.filter((a) => a.type === "EXPENSE")

  const filteredOptions = useMemo(() => {
    if (isInflow) {
      return assetAccounts.map((a) => ({ value: String(a.id), label: a.code ? `${a.code} - ${a.name}` : a.name }))
    }
    return expenseAccounts.map((a) => ({ value: String(a.id), label: a.code ? `${a.code} - ${a.name}` : a.name }))
  }, [isInflow, assetAccounts, expenseAccounts])

  function handleTypeChange(newType: "IN" | "OUT") {
    setType(newType)
    setAccountId(null)
    if (!pettyCash?.id && typeof window !== "undefined") {
      const targetPath = `/keuangan/kas-kecil/tambah/tipe/${newType.toLowerCase()}`
      window.history.replaceState(null, "", targetPath)
    }
  }

  // Live estimated balance calculation
  const beforeBalance = pettyCash?.balanceBefore ?? currentBalance ?? 0
  const estimatedBalanceAfter = isInflow
    ? beforeBalance + (Number(amount) || 0)
    : beforeBalance - (Number(amount) || 0)

  const isOverdrawn = !isInflow && (Number(amount) || 0) > beforeBalance

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const attachmentIdsValue = formData.get("attachmentIds")
        if (attachmentIdsValue) formData.set("attachmentIds", attachmentIdsValue as string)
        if (!pettyCash?.id) formData.set("idempotencyKey", idempotencyKeyRef.current)
        const { createPettyCash, updatePettyCash } = await import("@/actions/finance.actions")

        const result = pettyCash?.id ? await updatePettyCash(pettyCash.id, formData) : await createPettyCash(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }

        if (!pettyCash?.id) idempotencyKeyRef.current = newIdempotencyKey()
        showSuccess(pettyCash?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/kas-kecil")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={pettyCash?.id ? "Formulir ubah kas kecil" : "Formulir tambah kas kecil"}
      className="flex flex-col gap-6 max-w-4xl"
    >
      {/* Mode Selector Segmented Tabs (ERP High-Affordance Switcher) */}
      {!pettyCash?.id ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">
            Tipe <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <input type="hidden" id="type" name="type" value={type} aria-required="true" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 rounded-xl border border-border bg-muted/40">
            <button
              type="button"
              onClick={() => handleTypeChange("OUT")}
              className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all min-h-11 ${
                !isInflow
                  ? "bg-card border-border shadow-2xs text-foreground ring-1 ring-border"
                  : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                  !isInflow
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Receipt className="size-4" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold">Voucher Kas Kecil (PCV)</span>
                  {!isInflow && <Check className="size-4 text-primary" aria-hidden="true" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pengeluaran operasional harian kasir kas kecil
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange("IN")}
              className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all min-h-11 ${
                isInflow
                  ? "bg-card border-border shadow-2xs text-foreground ring-1 ring-border"
                  : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                  isInflow
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold">Pengisian Kas Kecil (PCF)</span>
                  {isInflow && <Check className="size-4 text-primary" aria-hidden="true" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Top-up saldo fisik dari rekening kas/bank besar
                </p>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <input type="hidden" id="type" name="type" value={type} aria-required="true" />
      )}

      {/* Main Form Body */}
      <div className="rounded-xl border border-border bg-card shadow-2xs divide-y divide-border">
        {/* Section 1: Financial & Date (Primary Focus) */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {isInflow ? "Nominal Pengisian Kembali" : "Nominal Voucher Pengeluaran"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isInflow
                  ? "Tentukan jumlah penarikan dana dari rekening sumber"
                  : "Tentukan nominal pengeluaran tunai operasional"}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                isInflow
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800"
              }`}
            >
              {isInflow ? "Dana Masuk (Debit Kas Kecil)" : "Dana Keluar (Kredit Kas Kecil)"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">
                Jumlah (Rp) <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <CurrencyInput
                id="amount"
                name="amount"
                placeholder="0"
                required
                defaultValue={pettyCash?.amount}
                prefix="Rp"
                className="font-mono text-base font-semibold tabular-nums"
                onChange={(val) => setAmount(val)}
              />
              {isOverdrawn && (
                <p className="text-xs font-medium text-destructive mt-1">
                  Peringatan: Nominal melebihi saldo kas fisik yang tersedia ({formatCurrencyExact(beforeBalance)}).
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <AppDatePicker
                label="Tanggal Transaksi"
                name="date"
                value={date}
                onChange={(val) => setDate(val)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">
              {isInflow ? "Rekening Sumber Kas / Bank" : "Alokasi Akun Beban (GL Expense)"}
            </Label>
            <QuickAddSelect
              id="accountId"
              name="accountId"
              options={filteredOptions}
              value={accountId}
              onChange={setAccountId}
              placeholder={isInflow ? "Pilih rekening kas/bank penyedia dana..." : "Pilih akun beban operasional..."}
              title={QUICK_ADD.account.title}
              fields={QUICK_ADD.account.fields}
              action={QUICK_ADD.account.action}
              onCreated={(created) => {
                setAccountList((prev) => [
                  ...prev,
                  { id: created.id, code: "", name: created.label, type: isInflow ? "ASSET" : "EXPENSE" },
                ])
                setAccountId(String(created.id))
              }}
            />
            <p className="text-xs text-muted-foreground">
              {isInflow
                ? "Akun aset bank/kas besar yang akan dikredit pada pembukuan jurnal."
                : "Akun beban yang akan didebit sebagai pertanggungjawaban pengeluaran kas."}
            </p>
          </div>
        </div>

        {/* Section 2: Details & Allocation (For OUT expenses or project replenishment) */}
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Detail & Pihak Terkait</h2>
            <p className="text-xs text-muted-foreground">Informasi pendukung, penerima, atau nomor bukti transaksi</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referenceNo">No. Referensi / No. Nota Fisik</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="referenceNo"
                  name="referenceNo"
                  placeholder="Contoh: NOTA-1289 / STR-04"
                  defaultValue={pettyCash?.referenceNo ?? ""}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendorId">{isInflow ? "Penyetor / PIC Bank" : "Penerima Dana / Vendor / Toko"}</Label>
              <div className="relative">
                <QuickAddSelect
                  id="vendorId"
                  name="vendorId"
                  options={vendorOptions.map((v) => ({ value: String(v.id), label: v.name }))}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder={isInflow ? "Pilih PIC / pembawa dana..." : "Cari vendor atau toko fisik..."}
                  title={QUICK_ADD.vendor.title}
                  fields={QUICK_ADD.vendor.fields}
                  action={QUICK_ADD.vendor.action}
                  onCreated={(created) => {
                    setVendorOptions((prev) => [...prev, { id: created.id, name: created.label }])
                    setVendorId(String(created.id))
                  }}
                />
              </div>
            </div>
          </div>

          {!isInflow && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Kategori Biaya Operasional</Label>
                <Combobox
                  id="categoryId"
                  name="categoryId"
                  options={categories.map((c) => ({ value: String(c.id), label: c.label }))}
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Pilih kategori..."
                />
              </div>

              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer min-h-9 select-none">
                  <input
                    type="checkbox"
                    checked={forProject}
                    onChange={(e) => {
                      setForProject(e.target.checked)
                      if (!e.target.checked) setProjectId(null)
                    }}
                    aria-label="Alokasikan ke Proyek"
                    className="size-4 rounded accent-primary"
                  />
                  <span>Alokasikan beban ini ke Pekerjaan / Proyek khusus</span>
                </label>
              </div>
            </div>
          )}

          {forProject && !isInflow && (
            <div className="p-3.5 rounded-lg border border-border bg-muted/30">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectId">Pilih Proyek / Job</Label>
                <Combobox
                  id="projectId"
                  name="projectId"
                  options={projects.map((p) => ({
                    value: String(p.id),
                    label: `${p.documentNo ? `${p.documentNo} - ` : ""}${p.name}`,
                  }))}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Cari nama atau nomor proyek..."
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Keterangan & Rincian Keperluan</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder={
                isInflow
                  ? "Keterangan pengisian kas kecil (misal: Reimposisi kas minggu ke-2 November)..."
                  : "Rincian keperluan pengeluaran kas kecil (misal: Pembelian materai dan konsumsi rapat)..."
              }
              defaultValue={pettyCash?.description ?? ""}
            />
          </div>

          {/* Attachments Upload */}
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">Lampiran Bukti Nota / Kwitansi Fisik</span>
            </div>
            <FormAttachmentUpload referenceType="petty_cash" />
          </div>
        </div>

        {/* Section 3: ERP Physical Cash Status Box */}
        <div className="p-5 sm:p-6 bg-muted/20">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Rekonsiliasi Posisi Kas Fisik
            </h2>
          </div>

          <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card">
            <div className="p-3.5 sm:p-4">
              <span className="text-xs text-muted-foreground">Saldo Kas Fisik Saat Ini</span>
              <p className="mt-1 font-mono text-base font-bold text-foreground tabular-nums">
                {formatCurrencyExact(beforeBalance)}
              </p>
            </div>

            <div className="p-3.5 sm:p-4">
              <span className="text-xs text-muted-foreground">
                {isInflow ? "Total Tambahan Kas" : "Total Pengeluaran Kas"}
              </span>
              <p
                className={`mt-1 font-mono text-base font-bold tabular-nums ${
                  isInflow
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {isInflow ? `+${formatCurrencyExact(amount)}` : `-${formatCurrencyExact(amount)}`}
              </p>
            </div>

            <div className="p-3.5 sm:p-4">
              <span className="text-xs text-muted-foreground">Estimasi Saldo Akhir Kasir</span>
              <p
                className={`mt-1 font-mono text-base font-bold tabular-nums ${
                  isOverdrawn ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatCurrencyExact(estimatedBalanceAfter)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          onPress={() => router.back()}
          className="min-h-11 sm:min-h-9 px-4 text-xs font-medium"
        >
          Batal
        </Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={isPending || isOverdrawn}
          className="min-h-11 sm:min-h-9 px-5 text-xs font-semibold"
        >
          {isPending
            ? "Menyimpan..."
            : pettyCash?.id
              ? "Perbarui Transaksi"
              : isInflow
                ? "Simpan Pengisian Kas"
                : "Simpan Voucher Kas"}
        </Button>
      </div>
    </form>
  )
}
