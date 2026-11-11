"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import {
  BadgeCheck,
  Ban,
  Trash2,
  Landmark,
  TrendingDown,
  TrendingUp,
  Calendar,
  Building2,
  FileText,
} from "@/components/ui/fontawesome-icons"

import { createCheque, deleteCheque, updateChequeStatus } from "@/actions/cheque.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccountingExact } from "@/lib/utils/format"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export interface ChequeRow {
  id: number
  documentNo: string
  type: string
  direction: string
  number: string | null
  party: string | null
  accountLabel: string | null
  amount: number
  dueDate: string
  status: string
}

interface AccountOption {
  id: number
  code: string
  name: string
}

const TYPE_LABEL: Record<string, string> = {
  giro: "Giro",
  cek: "Cek",
}

const columnHelper = createColumnHelper<ChequeRow>()

export function ChequeManager({
  cheques,
  accounts,
  canCreate,
  canEdit,
  canDelete,
}: {
  cheques: ChequeRow[]
  accounts: AccountOption[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  // State untuk expand form pencatatan (default terbuka agar form selalu siap pakai)
  const [isFormOpen, setIsFormOpen] = useState(true)

  // Form states
  const [type, setType] = useState("giro")
  const [direction, setDirection] = useState("in")
  const [number, setNumber] = useState("")
  const [party, setParty] = useState("")
  const [accountId, setAccountId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState(toLocalDateOnly(new Date()))
  const [notes, setNotes] = useState("")

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    variant?: "danger" | "warning" | "accent" | "success" | "primary"
    confirmText?: string
    onConfirm: () => void
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  })

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))

  function handleCreate(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("type", type)
        formData.set("direction", direction)
        formData.set("number", number)
        formData.set("party", party)
        formData.set("accountId", accountId)
        formData.set("amount", amount === null ? "" : String(amount))
        formData.set("dueDate", dueDate)
        formData.set("notes", notes)
        formData.set("idempotencyKey", idempotencyKeyRef.current)

        const result = await createCheque(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan giro/cek")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Giro/cek berhasil dicatat")
        setNumber("")
        setParty("")
        setAmount(null)
        setNotes("")
        setIsFormOpen(false)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan giro/cek")
      }
    })
  }

  function handleStatus(id: number, status: string, documentNo: string) {
    const isClearing = status === "cleared"
    setConfirmDialog({
      open: true,
      title: isClearing ? "Konfirmasi Pencairan Giro/Cek" : "Konfirmasi Pembatalan Giro/Cek",
      description: isClearing
        ? `Tandai dokumen ${documentNo} telah cair ke rekening bank operasional? Status ini bersifat final.`
        : `Batalkan lembar giro/cek ${documentNo}? Dokumen yang dibatalkan tidak dapat dicairkan kembali.`,
      variant: isClearing ? "primary" : "danger",
      confirmText: isClearing ? "Ya, Cairkan" : "Ya, Batalkan",
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }))
        startTransition(async () => {
          try {
            const result = await updateChequeStatus(id, status)
            if (result && !result.success) {
              showError(result.error || "Gagal mengubah status")
              return
            }
            showSuccess(isClearing ? "Giro/cek berhasil dicairkan" : "Giro/cek dibatalkan")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal mengubah status")
          }
        })
      },
    })
  }

  function handleDelete(id: number, documentNo: string) {
    setConfirmDialog({
      open: true,
      title: "Hapus Dokumen Giro/Cek",
      description: `Apakah Anda yakin ingin menghapus data lembar ${documentNo}? Tindakan ini akan dicatat di log audit.`,
      variant: "danger",
      confirmText: "Hapus Dokumen",
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }))
        startTransition(async () => {
          try {
            const result = await deleteCheque(id)
            if (result && !result.success) {
              showError(result.error || "Gagal menghapus")
              return
            }
            showSuccess("Giro/cek berhasil dihapus")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal menghapus")
          }
        })
      },
    })
  }

  // Ringkasan Finansial Metrik
  const _totalNominal = cheques.reduce((acc, c) => acc + c.amount, 0)
  const pendingCount = cheques.filter((c) => c.status === "pending").length
  const clearedCount = cheques.filter((c) => c.status === "cleared").length
  const inCount = cheques.filter((c) => c.direction === "in").length

  const columns = [
    columnHelper.accessor("dueDate", {
      header: "Jatuh Tempo",
      cell: (info) => (
        <span className="font-mono text-xs tabular-nums text-foreground font-medium">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("documentNo", {
      header: "No. Dokumen",
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("number", {
      header: "No. Warkat / Lembar",
      cell: (info) => (
        <span className="font-mono text-xs text-muted-foreground">
          {info.getValue() ?? "-"}
        </span>
      ),
    }),
    columnHelper.accessor("type", {
      header: "Jenis",
      cell: (info) => {
        const val = info.getValue()
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
            {TYPE_LABEL[val] ?? val}
          </span>
        )
      },
    }),
    columnHelper.accessor("direction", {
      header: "Arah Arus",
      cell: (info) => {
        const isDiterima = info.getValue() === "in"
        return (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              isDiterima ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {isDiterima ? (
              <>
                <TrendingDown className="size-3" aria-hidden="true" />
                <span>Diterima (Pelanggan)</span>
              </>
            ) : (
              <>
                <TrendingUp className="size-3" aria-hidden="true" />
                <span>Dikeluarkan (Pemasok)</span>
              </>
            )}
          </span>
        )
      },
    }),
    columnHelper.accessor("party", {
      header: "Pihak Rekanan",
      cell: (info) => (
        <div className="flex items-center gap-1.5">
          <Building2 className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
            {info.getValue() ?? "-"}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor("accountLabel", {
      header: "Rekening Bank",
      cell: (info) => (
        <div className="flex items-center gap-1.5">
          <Landmark className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
            {info.getValue() ?? "-"}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor("amount", {
      header: "Nominal",
      cell: (info) => (
        <span className="text-right block font-mono text-xs font-semibold text-foreground tabular-nums">
          {formatAccountingExact(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const st = info.getValue()
        if (st === "cleared") {
          return <StatusChip status="cleared" customLabel="Sudah Cair" customTone="success" />
        }
        if (st === "cancelled") {
          return <StatusChip status="cancelled" customLabel="Dibatalkan" customTone="danger" />
        }
        return <StatusChip status="pending" customLabel="Belum Cair" customTone="warning" />
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original
        const isPendingStatus = row.status === "pending"

        return (
          <div className="flex items-center justify-end gap-1.5">
            {isPendingStatus && canEdit && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  isDisabled={isPending}
                  onPress={() => handleStatus(row.id, "cleared", row.documentNo)}
                  className="gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 min-h-11 sm:min-h-8 px-2"
                  aria-label={`Tandai cair ${row.documentNo}`}
                >
                  <BadgeCheck size={14} aria-hidden="true" />
                  <span>Cair</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  isDisabled={isPending}
                  onPress={() => handleStatus(row.id, "cancelled", row.documentNo)}
                  className="gap-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 min-h-11 sm:min-h-8 px-2"
                  aria-label={`Batalkan ${row.documentNo}`}
                >
                  <Ban size={14} aria-hidden="true" />
                  <span>Batal</span>
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={isPending}
                onPress={() => handleDelete(row.id, row.documentNo)}
                className="gap-1 text-destructive hover:bg-destructive/10 min-h-11 sm:min-h-8 px-2"
                aria-label={`Hapus ${row.documentNo}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        )
      },
    }),
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Dokumen</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {cheques.length} <span className="text-sm font-normal text-muted-foreground">lembar</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Warkat Diterima</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {inCount} <span className="text-sm font-normal text-muted-foreground">lembar</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Sudah Dicairkan</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {clearedCount} <span className="text-sm font-normal text-muted-foreground">lembar</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-amber-500" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Menunggu Jatuh Tempo</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {pendingCount} <span className="text-sm font-normal text-muted-foreground">lembar</span>
          </p>
        </div>
      </div>

      {/* Form Collapsible Pencatatan Giro Baru */}
      {canCreate && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                {isFormOpen ? "Formulir Pencatatan Giro & Cek Baru" : "Pencatatan Warkat Giro / Cek"}
              </h3>
            </div>
            <Button
              type="button"
              variant={isFormOpen ? "outline" : "primary"}
              size="sm"
              onClick={() => setIsFormOpen((prev) => !prev)}
              className="gap-1.5 text-xs min-h-11 sm:min-h-9"
            >
              {isFormOpen ? "Tutup Formulir" : "+ Catat Giro/Cek Baru"}
            </Button>
          </div>

          {isFormOpen && (
            <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-type">
                    Jenis Warkat <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <FormSelect
                    id="cheque-type"
                    name="type"
                    options={[
                      { value: "giro", label: "Giro (Bilyet Giro)" },
                      { value: "cek", label: "Cek (Tunai / Kliring)" },
                    ]}
                    defaultValue={type}
                    onValueChange={setType}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-direction">
                    Arah Transaksi <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <FormSelect
                    id="cheque-direction"
                    name="direction"
                    options={[
                      { value: "in", label: "Diterima (dari Pelanggan)" },
                      { value: "out", label: "Dikeluarkan (ke Pemasok)" },
                    ]}
                    defaultValue={direction}
                    onValueChange={setDirection}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-number">Nomor Seri Lembar Warkat</Label>
                  <Input
                    id="cheque-number"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                    placeholder="Contoh: BG-1029384"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-party">Nama Pihak Rekanan</Label>
                  <Input
                    id="cheque-party"
                    value={party}
                    onChange={(event) => setParty(event.target.value)}
                    placeholder="Nama pelanggan atau vendor terkait"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-account">Rekening Bank Operasional</Label>
                  <Combobox
                    id="cheque-account"
                    options={accountOptions}
                    value={accountId || null}
                    onChange={(value) => setAccountId(value ?? "")}
                    placeholder="Pilih rekening bank..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cheque-amount">
                    Nominal Warkat <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <CurrencyInput
                    id="cheque-amount"
                    value={amount}
                    onChange={setAmount}
                    placeholder="0"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <AppDatePicker
                    label="Jatuh Tempo *"
                    name="dueDate"
                    value={dueDate}
                    onChange={setDueDate}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
                  <Label htmlFor="cheque-notes">Keterangan / Catatan Transaksi</Label>
                  <Textarea
                    id="cheque-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={1}
                    placeholder="Catatan tambahan (opsional)"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isDisabled={isPending}
                  onClick={() => setIsFormOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isDisabled={isPending}
                  id="create-cheque-btn"
                  className="min-h-11 sm:min-h-9 px-5"
                >
                  {isPending ? "Menyimpan Warkat..." : "Catat Giro/Cek"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Main Enterprise Data Table */}
      <DataTable
        data={cheques}
        columns={columns}
        ariaLabel="Daftar register giro dan cek"
        searchColumn="documentNo"
        searchPlaceholder="Cari nomor dokumen, lembar, atau rekanan..."
      />

      {/* Confirmation Dialog Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        body={confirmDialog.description}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmText}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  )
}
