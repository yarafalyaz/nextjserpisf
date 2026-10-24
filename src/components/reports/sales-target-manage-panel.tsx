"use client"

import { useState } from "react"
import {
  createSalesTarget,
  deleteSalesTarget,
  updateSalesTarget,
} from "@/actions/sales-target.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { useActionRunner } from "./use-action-runner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

export interface SalesTargetManageRow {
  id: number
  salesEmployeeId: number
  salesEmployeeName: string
  periodStart: Date | string
  periodEnd: Date | string
  targetAmount: number
  notes: string | null
}

export interface SalesTargetEmployeeOption {
  id: number
  name: string
}

function toDateInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ""
  // ponytail: periode disimpan tengah malam UTC hari kalender WIB — baca UTC apa adanya.
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const inputLabel = "text-sm font-medium text-foreground"

/**
 * Panel kelola target penjualan (F-2026-10-22-088-S).
 * Gerbang server approve_sales_invoices; canManage=false = baca-saja.
 * Error server tampil apa adanya. Nol hitung bisnis di UI.
 */
export function SalesTargetManagePanel({
  targets,
  employees,
  canManage,
}: Readonly<{
  targets: SalesTargetManageRow[]
  employees: SalesTargetEmployeeOption[]
  canManage: boolean
}>) {
  const { isPending, run } = useActionRunner("Gagal menyimpan target penjualan")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SalesTargetManageRow | null>(null)
  const [deleteFor, setDeleteFor] = useState<SalesTargetManageRow | null>(null)
  const [salesEmployeeId, setSalesEmployeeId] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [targetAmount, setTargetAmount] = useState<number>(0)
  const [notes, setNotes] = useState("")

  function openCreate() {
    setEditing(null)
    setSalesEmployeeId("")
    setPeriodStart("")
    setPeriodEnd("")
    setTargetAmount(0)
    setNotes("")
    setFormOpen(true)
  }

  function openEdit(row: SalesTargetManageRow) {
    setEditing(row)
    setSalesEmployeeId(String(row.salesEmployeeId))
    setPeriodStart(toDateInput(row.periodStart))
    setPeriodEnd(toDateInput(row.periodEnd))
    setTargetAmount(row.targetAmount)
    setNotes(row.notes ?? "")
    setFormOpen(true)
  }

  function submit() {
    const input = {
      salesEmployeeId: Number(salesEmployeeId),
      periodStart,
      periodEnd,
      targetAmount,
      notes: notes.trim() || null,
    }
    if (editing) {
      run(() => updateSalesTarget({ id: editing.id, ...input }), "Target penjualan diubah", () => setFormOpen(false))
    } else {
      run(() => createSalesTarget(input), "Target penjualan dibuat", () => setFormOpen(false))
    }
  }

  return (
    <section aria-label="kelola target penjualan" className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Kelola Target Penjualan</h2>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={openCreate} isDisabled={isPending}>
            + Target Baru
          </Button>
        ) : null}
      </div>
      <div className="p-4 px-5">
        {targets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada target penjualan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stmt">
              <thead>
                <tr>
                  <th scope="col">Penjual</th>
                  <th scope="col">Periode Target</th>
                  <th scope="col" className="num">Target (Rp)</th>
                  <th scope="col">Catatan</th>
                  {canManage ? <th scope="col">Aksi</th> : null}
                </tr>
              </thead>
              <tbody>
                {targets.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.salesEmployeeName || "—"}</td>
                    <td>
                      {formatDate(row.periodStart, { format: "numeric" })} – {formatDate(row.periodEnd, { format: "numeric" })}
                    </td>
                    <td className="num">{formatCurrency(row.targetAmount)}</td>
                    <td>{row.notes || "—"}</td>
                    {canManage ? (
                      <td>
                        <span className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(row)} isDisabled={isPending}>
                            Ubah
                          </Button>
                          <Button variant="danger-soft" size="sm" onClick={() => setDeleteFor(row)} isDisabled={isPending}>
                            Nonaktifkan
                          </Button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {formOpen ? (
          <form
            className="mt-5 grid gap-4 rounded-xl border border-default p-4 sm:grid-cols-2"
            aria-label={editing ? "Form ubah target penjualan" : "Form target penjualan baru"}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sales-target-employee" className={inputLabel}>
                Penjual <span aria-hidden="true">*</span>
              </Label>
              <FormSelect
                id="sales-target-employee"
                value={salesEmployeeId}
                onValueChange={setSalesEmployeeId}
                placeholder="Pilih penjual"
                required
                disabled={isPending}
                options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sales-target-amount" className={inputLabel}>
                Target (Rp) <span aria-hidden="true">*</span>
              </Label>
              <CurrencyInput
                id="sales-target-amount"
                value={targetAmount || ""}
                onChange={setTargetAmount}
                required
                disabled={isPending}
                aria-label="Target (Rp)"
              />
            </div>
            <AppDatePicker
              label="Tanggal mulai periode"
              name="sales-target-period-start"
              value={periodStart}
              onChange={setPeriodStart}
              required
              disabled={isPending}
            />
            <AppDatePicker
              label="Tanggal selesai periode"
              name="sales-target-period-end"
              value={periodEnd}
              onChange={setPeriodEnd}
              required
              disabled={isPending}
            />
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="sales-target-notes" className={inputLabel}>
                Catatan
              </Label>
              <Textarea
                id="sales-target-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" isPending={isPending}>
                {editing ? "Simpan Perubahan" : "Simpan Target"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)} isDisabled={isPending}>
                Batal
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={deleteFor !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFor(null)
        }}
        title="Nonaktifkan target penjualan?"
        body={
          deleteFor
            ? `Target ${deleteFor.salesEmployeeName} periode ${formatDate(deleteFor.periodStart, { format: "numeric" })} – ${formatDate(deleteFor.periodEnd, { format: "numeric" })} akan dinonaktifkan. Faktur dan pencapaian tidak berubah.`
            : undefined
        }
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={() => {
          if (!deleteFor) return
          run(() => deleteSalesTarget({ id: deleteFor.id }), "Target penjualan dinonaktifkan", () => setDeleteFor(null))
        }}
      />
    </section>
  )
}
