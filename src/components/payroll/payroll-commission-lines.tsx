"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  addPayrollCommissionLine,
  removePayrollComponentLine,
} from "@/actions/hrm.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { formatCurrency } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { DeleteButton } from "@/components/ui/delete-button"
import { Label } from "@/components/ui/shadcn/label"

export interface PayrollCommissionDebtOption {
  id: number
  salesInvoiceId: number
  invoiceNo: string | null
  balance: number
}

export interface PayrollCommissionRow {
  id: number
  commissionPayableId: number
  commissionInvoiceId: number | null
  amount: number
}

export function PayrollCommissionLines({
  payrollId,
  status,
  debts,
  lines,
  canEdit,
}: {
  payrollId: number
  status: string
  debts: PayrollCommissionDebtOption[]
  lines: PayrollCommissionRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const editable = status === "draft" && canEdit
  // ponytail: opsi utang ≤ puluhan baris per karyawan; tanpa cari/filter.
  // Tambah pencarian server saat karyawan komisi volume tinggi protes.
  const used = new Set(lines.map((l) => l.commissionPayableId))
  const available = debts.filter((d) => !used.has(d.id))
  const defaultDebt = available[0]

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await fn()
      if (!result.success) {
        showError(result.error || "Gagal menyimpan baris komisi")
        return
      }
      showSuccess(ok)
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">Bayar Komisi</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Pilih utang komisi milik karyawan slip ini. Nominal terkunci dari pilihan
        saat tambah — ubah dengan hapus lalu tambah ulang. Baris terkirim ke
        subledger saat slip dibayar.
      </p>

      {lines.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Belum ada baris bayar komisi pada slip ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Faktur</th>
                <th className="px-3 py-2 text-right font-medium">Nominal</th>
                {editable && <th className="px-3 py-2 font-medium">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-default last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {l.commissionInvoiceId != null ? `Faktur #${l.commissionInvoiceId}` : `Utang #${l.commissionPayableId}`}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(l.amount)}</td>
                  {editable && (
                    <td className="px-3 py-2">
                      <DeleteButton id={l.id} action={removePayrollComponentLine} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => addPayrollCommissionLine(payrollId, new FormData(e.currentTarget)),
              "Baris bayar komisi ditambahkan",
            )
          }}
          aria-busy={isPending}
          aria-label="Formulir tambah bayar komisi"
          className="mt-5 grid grid-cols-1 gap-4 border-t border-default pt-5 md:grid-cols-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commission-debt">
              Utang komisi <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <select
              id="commission-debt"
              name="commissionPayableId"
              required
              className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
            >
              <option value="">Pilih utang...</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.invoiceNo ?? `Faktur #${d.salesInvoiceId}`} — sisa {formatCurrency(d.balance)}
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Tidak ada utang komisi bersaldo milik karyawan ini yang belum dibayar lewat slip.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commission-amount">
              Nominal <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="commission-amount"
              name="amount"
              required
              prefix="Rp"
              placeholder="0"
              defaultValue={defaultDebt?.balance}
              key={defaultDebt?.id ?? "empty"}
            />
          </div>
          <div className="flex items-end justify-end">
            <Button type="submit" variant="primary" isDisabled={isPending || available.length === 0}>
              {isPending ? "Menyimpan..." : "Tambah"}
            </Button>
          </div>
        </form>
      ) : (
        lines.length > 0 && (
          <p className="mt-4 border-t border-default pt-4 text-sm text-muted-foreground">
            Slip sudah bukan draf — baris komisi terkunci dan tidak dapat diubah.
          </p>
        )
      )}
    </div>
  )
}
