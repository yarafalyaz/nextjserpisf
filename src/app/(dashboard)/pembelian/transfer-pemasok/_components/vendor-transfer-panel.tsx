"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { markVendorPaymentsTransferred, unmarkVendorPaymentsTransferred } from "@/actions/vendor-transfer.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"

export interface TransferInstructionRow {
  id: number
  documentNo: string
  paymentDate: string
  vendorName: string
  paymentMethod: string
  bankAccount: string | null
  referenceNumber: string | null
  amount: number
  /** Status pembayaran: "draft" berarti belum dikonfirmasi (jurnalnya belum dibuat). */
  status: string
  transferredAt: string | null
  transferReference: string | null
}

export function VendorTransferPanel({ rows }: { rows: TransferInstructionRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selected, setSelected] = useState<number[]>([])
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [reference, setReference] = useState("")

  const pending = rows.filter((row) => !row.transferredAt)
  const transferred = rows.filter((row) => row.transferredAt)
  const pendingAmount = pending.reduce((sum, row) => sum + row.amount, 0)

  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected])
  const selectedAmount = selectedRows.reduce((sum, row) => sum + row.amount, 0)

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  function submit(kind: "mark" | "unmark") {
    if (selected.length === 0) {
      showError("Pilih minimal satu pembayaran dulu.")
      return
    }
    startTransition(async () => {
      const formData = new FormData()
      for (const id of selected) formData.append("paymentIds", String(id))
      formData.set("date", date)
      formData.set("reference", reference)

      const result =
        kind === "mark"
          ? await markVendorPaymentsTransferred(formData)
          : await unmarkVendorPaymentsTransferred(formData)

      if (result.success) {
        showSuccess(
          kind === "mark"
            ? `${result.updated} pembayaran ditandai sudah ditransfer.`
            : `${result.updated} penanda transfer dibatalkan.`,
        )
        setSelected([])
        router.refresh()
      } else {
        showError(result.error ?? "Gagal menyimpan.")
      }
    })
  }

  function row(row: TransferInstructionRow) {
    return (
      <label key={row.id} className="flex flex-wrap items-center gap-3 border-b border-default p-3 text-sm last:border-b-0">
        <input
          type="checkbox"
          className="size-4"
          checked={selected.includes(row.id)}
          onChange={() => toggle(row.id)}
          disabled={isPending}
          aria-label={`Pilih ${row.documentNo}`}
        />
        <span className="text-xs text-muted-foreground">{row.paymentDate}</span>
        <span className="font-mono">{row.documentNo}</span>
        <span className="min-w-40 flex-1 truncate">{row.vendorName}</span>
        <span className="w-40 truncate text-xs text-muted-foreground">
          {row.bankAccount ?? row.paymentMethod}
        </span>
        <span className="w-32 text-right tabular-nums">{formatAccounting(row.amount)}</span>
        <span className="w-20 text-xs text-muted-foreground">{statusLabel(row.status)}</span>
        <span className="w-40 text-right text-xs text-muted-foreground">
          {row.transferredAt ? `${row.transferredAt}${row.transferReference ? ` · ${row.transferReference}` : ""}` : "belum ditransfer"}
        </span>
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-default bg-surface p-4">
        <p className="flex-1 text-sm text-muted-foreground">
          {selected.length > 0
            ? `${selected.length} pembayaran dipilih · ${formatCurrency(selectedAmount)}`
            : `${pending.length} menunggu transfer · ${formatCurrency(pendingAmount)} · ${transferred.length} sudah ditransfer`}
        </p>
        <div className="flex items-end gap-3">
          <AppDatePicker label="Tanggal Transfer" name="transferDate" value={date} onChange={setDate} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transferReference">Referensi Bukti</Label>
            <Input
              id="transferReference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="No. bukti transfer (opsional)"
              className="w-52"
            />
          </div>
          <Button variant="primary" onPress={() => submit("mark")} isDisabled={isPending} id="mark-transferred">
            Tandai Sudah Ditransfer
          </Button>
          <Button variant="outline" onPress={() => submit("unmark")} isDisabled={isPending} id="unmark-transferred">
            Batalkan Penanda
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface">
        <div className="border-b border-default p-3 text-sm font-medium">Belum ditransfer ({pending.length})</div>
        {pending.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Semua pembayaran pada rentang ini sudah ditandai ditransfer.</p>
        ) : (
          <div className="flex flex-col">{pending.map(row)}</div>
        )}
      </div>

      <div className="rounded-xl border border-default bg-surface">
        <div className="border-b border-default p-3 text-sm font-medium">Sudah ditransfer ({transferred.length})</div>
        {transferred.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Belum ada pembayaran yang ditandai ditransfer.</p>
        ) : (
          <div className="flex flex-col">{transferred.map(row)}</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Menandai transfer tidak membuat jurnal. Untuk pembayaran berstatus draft jurnalnya memang belum
        ada — jurnal kas/bank baru dibuat saat pembayaran dikonfirmasi/diposting (aksi itu belum
        tersambung ke UI). Daftar ini hanya menandai pembayaran yang transfer banknya sudah dikirim.
      </p>
    </div>
  )
}
