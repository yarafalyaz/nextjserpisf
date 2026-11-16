"use client"

import { useMemo } from "react"
import { createColumnHelper, type ErpColumnDef } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { deleteBankStatementLine } from "@/actions/finance.actions"
import { bankStatementLineTypeLabel } from "./bank-statement-line-labels"

export interface BankStatementLineRow {
  id: number
  date: string
  description: string | null
  reference: string | null
  type: string
  debit: number
  credit: number
}

const columnHelper = createColumnHelper<BankStatementLineRow>()

export function BankStatementLinesTable({
  data,
  baseHref,
  canWrite,
  totalDebits,
  totalCredits,
}: {
  data: BankStatementLineRow[]
  baseHref: string
  canWrite: boolean
  totalDebits: number
  totalCredits: number
}) {
  const columns = useMemo(() => {
    const base: ErpColumnDef<BankStatementLineRow, any>[] = [
      columnHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Keterangan / Uraian",
        meta: { mobilePrimary: true },
        cell: (info) => (
          <span className="text-xs font-medium text-foreground">
            {info.getValue() || "-"}
          </span>
        ),
      }),
      columnHelper.accessor("reference", {
        header: "No. Referensi",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">
            {info.getValue() || "-"}
          </span>
        ),
      }),
      columnHelper.accessor("type", {
        header: "Arah Mutasi",
        meta: { align: "center" },
        cell: (info) => {
          const type = info.getValue()
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                type === "DEBIT" || type === "debit"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              }`}
            >
              {bankStatementLineTypeLabel(type)}
            </span>
          )
        },
      }),
      columnHelper.accessor("debit", {
        header: "Debit (Masuk)",
        meta: { align: "right" },
        cell: (info) => {
          const val = info.getValue()
          return (
            <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {val > 0 ? formatCurrencyExact(val) : "-"}
            </span>
          )
        },
      }),
      columnHelper.accessor("credit", {
        header: "Kredit (Keluar)",
        meta: { align: "right" },
        cell: (info) => {
          const val = info.getValue()
          return (
            <span className="font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
              {val > 0 ? formatCurrencyExact(val) : "-"}
            </span>
          )
        },
      }),
    ]
    if (canWrite) {
      base.push(
        columnHelper.display({
          id: "actions",
          header: "Aksi",
          meta: { align: "right" },
          cell: (info) => (
            <div className="flex items-center justify-end">
              <ActionDropdown
                editHref={`${baseHref}/baris/${info.row.original.id}/ubah`}
                editPermission="create_journals"
                deleteAction={deleteBankStatementLine}
                deleteId={info.row.original.id}
                deletePermission="create_journals"
                deleteConfirmTitle="Hapus baris mutasi rekening koran ini?"
                deleteConfirmBody="Baris mutasi akan dihapus dan total debit/kredit header akan dihitung ulang secara otomatis."
              />
            </div>
          ),
        }),
      )
    }
    return base
  }, [baseHref, canWrite])

  return (
    <div className="flex flex-col gap-3 p-4">
      <DataTable
        data={data}
        columns={columns}
        ariaLabel="Daftar Baris Mutasi Rekening Koran"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-xs">
        <span className="font-semibold text-foreground uppercase tracking-wider">
          Total Mutasi Tercatat
        </span>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Debit:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrencyExact(totalDebits)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Kredit:</span>
            <span className="font-mono font-bold text-red-600 dark:text-red-400 tabular-nums">
              {formatCurrencyExact(totalCredits)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
