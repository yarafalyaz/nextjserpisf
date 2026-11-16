"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface JournalEntryRow {
  id: number
  accountCode: string
  accountName: string
  memo: string | null
  debit: number
  credit: number
  debitFormatted?: string
  creditFormatted?: string
}

const columnHelper = createColumnHelper<JournalEntryRow>()

const columns = [
  columnHelper.accessor("accountName", {
    header: "Akun",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return `${row.accountCode} - ${row.accountName}`
    },
  }),
  columnHelper.accessor("memo", {
    header: "Memo",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("debit", {
    header: "Debit",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {info.row.original.debitFormatted ?? formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("credit", {
    header: "Kredit",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {info.row.original.creditFormatted ?? formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
]

export function JournalEntriesTable({
  data,
  totalDebit,
  totalCredit,
}: {
  data: JournalEntryRow[]
  totalDebit: number
  totalCredit: number
}) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        data={data}
        columns={columns}
        ariaLabel="Entri Jurnal"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="flex flex-wrap items-center justify-end gap-6 rounded-lg border border-default bg-muted/30 px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">Total Debit:</span>
          <span className="font-bold font-mono tabular-nums text-foreground">
            {formatCurrencyExact(totalDebit)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">Total Kredit:</span>
          <span className="font-bold font-mono tabular-nums text-foreground">
            {formatCurrencyExact(totalCredit)}
          </span>
        </div>
      </div>
    </div>
  )
}
