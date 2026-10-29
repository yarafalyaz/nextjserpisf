"use client"

import {
  addPayrollComponentLine,
  removePayrollComponentLine,
  updatePayrollComponentLineAmount,
} from "@/actions/hrm.actions"
import { formatCurrency } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { DeleteButton } from "@/components/ui/delete-button"
import { Label } from "@/components/ui/shadcn/label"
import { kindLabel, recurrenceLabel, taxableLabel } from "./payroll-component-master"
import { useSlipActionRunner } from "./use-slip-action-runner"

export interface PayrollComponentLineRow {
  id: number
  pkwtEventId?: number | null
  componentId: number | null
  componentNameSnapshot: string
  kindSnapshot: string
  recurrenceSnapshot: string
  isTaxableSnapshot: boolean
  source: string
  commissionPayableId?: number | null
  commissionInvoiceId?: number | null
  amount: number
}

export interface LineComponentOption {
  id: number
  name: string
  kind: string
  recurrence: string
}

const SOURCE_LABEL: Record<string, string> = {
  fixed_assignment: "Penugasan tetap",
  manual: "Manual",
  commission: "Komisi",
  // F-2026-10-24-132-V: baris kompensasi PKWT dari peristiwa terbekukan;
  // nominal penuh non-parsial dikunci server, UI tidak boleh ubah/hapus.
  pkwt_compensation: "Kompensasi PKWT",
}

export function PayrollComponentLines({
  payrollId,
  status,
  lines,
  components,
  allowances,
  deductions,
  canEdit,
}: {
  payrollId: number
  status: string
  lines: PayrollComponentLineRow[]
  components: LineComponentOption[]
  allowances: number
  deductions: number
  canEdit: boolean
}) {
  const { isPending, run } = useSlipActionRunner("Gagal menyimpan baris komponen gaji")
  const editable = status === "draft" && canEdit
  const visible = lines.filter((l) => l.commissionPayableId == null)
  const usedIds = new Set(visible.map((l) => l.componentId).filter((v) => v != null))
  // Kartu F-027 UI: baris manual hanya komponen tidak-tetap; komponen tetap
  // masuk slip lewat penugasan saat generate.
  const available = components.filter((c) => c.recurrence === "variable" && !usedIds.has(c.id))

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">Komponen Gaji Slip</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Baris snapshot dari server. Total tunjangan dan potongan di Rincian Gaji
        adalah turunan baris-baris ini, bukan isian bebas.
      </p>

      {visible.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Belum ada baris komponen gaji pada slip ini.
          {lines.length > visible.length && " Baris komisi tampil di panel Bayar Komisi."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Komponen</th>
                <th className="px-3 py-2 font-medium">Jenis</th>
                <th className="px-3 py-2 font-medium">Sifat</th>
                <th className="px-3 py-2 font-medium">Klasifikasi Pajak</th>
                <th className="px-3 py-2 font-medium">Sumber</th>
                <th className="px-3 py-2 text-right font-medium">Nominal</th>
                {editable && <th className="px-3 py-2 font-medium">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} className="border-b border-default last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{l.componentNameSnapshot}</td>
                  <td className="px-3 py-2">{kindLabel(l.kindSnapshot)}</td>
                  <td className="px-3 py-2">{recurrenceLabel(l.recurrenceSnapshot)}</td>
                  <td className="px-3 py-2">{taxableLabel(l.isTaxableSnapshot, l.kindSnapshot)}</td>
                  <td className="px-3 py-2">{SOURCE_LABEL[l.source] ?? l.source}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(l.amount)}</td>
                  {editable && l.source !== "pkwt_compensation" && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <form
                          aria-label={`Ubah nominal ${l.componentNameSnapshot}`}
                          onSubmit={(e) => {
                            e.preventDefault()
                            run(
                              () => updatePayrollComponentLineAmount(l.id, new FormData(e.currentTarget)),
                              "Nominal baris komponen gaji diubah",
                            )
                          }}
                          className="flex items-end gap-2"
                        >
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`line-amount-${l.id}`}>Nominal baru</Label>
                            <CurrencyInput
                              id={`line-amount-${l.id}`}
                              name="amount"
                              defaultValue={l.amount}
                              prefix="Rp"
                            />
                          </div>
                          <Button type="submit" variant="secondary" isDisabled={isPending}>
                            Simpan
                          </Button>
                        </form>
                        <DeleteButton id={l.id} action={removePayrollComponentLine} label={`Hapus baris ${l.componentNameSnapshot}`} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
          <dt className="text-xs text-muted-foreground">Total Tunjangan (turunan baris pendapatan)</dt>
          <dd className="text-base font-semibold text-foreground">{formatCurrency(allowances)}</dd>
        </div>
        <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
          <dt className="text-xs text-muted-foreground">Total Potongan Komponen (turunan baris potongan)</dt>
          <dd className="text-base font-semibold text-foreground">{formatCurrency(deductions)}</dd>
        </div>
      </dl>

      {lines.some((l) => l.source === "pkwt_compensation") && (
        <p className="mt-4 rounded-lg border border-default bg-surface-secondary/40 p-3 text-sm text-muted-foreground">
          Baris Kompensasi PKWT berasal dari peristiwa terbekukan dan dibayar
          penuh (non-parsial) — nominal tidak dapat diubah atau dihapus dari slip.
        </p>
      )}
      {lines.some((l) => l.source === "commission") && (
        <p className="mt-4 rounded-lg border border-default bg-surface-secondary/40 p-3 text-sm text-muted-foreground">
          Baris komisi dikelola di panel Bayar Komisi — ubah nominal dengan hapus
          lalu tambah ulang; tanpa baris komisi slip tak membayar komisi.
        </p>
      )}
      {editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => addPayrollComponentLine(payrollId, new FormData(e.currentTarget)),
              "Baris komponen gaji ditambahkan",
            )
          }}
          aria-busy={isPending}
          aria-label="Formulir tambah baris komponen gaji"
          className="mt-5 grid grid-cols-1 gap-4 border-t border-default pt-5 md:grid-cols-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-component">
              Komponen <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <select
              id="line-component"
              name="componentId"
              required
              className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
            >
              <option value="">Pilih komponen...</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({kindLabel(c.kind)}, {recurrenceLabel(c.recurrence)})
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Tidak ada komponen tidak-tetap aktif yang belum ada pada slip ini.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-amount">
              Nominal <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <CurrencyInput id="line-amount" name="amount" required prefix="Rp" placeholder="0" />
          </div>
          <div className="flex items-end justify-end">
            <Button type="submit" variant="primary" isDisabled={isPending || available.length === 0}>
              {isPending ? "Menyimpan..." : "Tambah Baris"}
            </Button>
          </div>
        </form>
      ) : (
        lines.length > 0 && (
          <p className="mt-4 border-t border-default pt-4 text-sm text-muted-foreground">
            {status === "draft"
              ? "Baris komponen hanya dapat diubah oleh pengguna berizin ubah penggajian."
              : "Slip sudah bukan draf — baris komponen terkunci dan tidak dapat diubah."}
          </p>
        )
      )}
    </div>
  )
}
