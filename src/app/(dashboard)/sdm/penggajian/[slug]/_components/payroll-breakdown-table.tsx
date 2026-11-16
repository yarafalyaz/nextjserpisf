"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface PayrollBreakdownRow {
  id: string
  label: string
  amount: number
  isHighlight?: boolean
}

const columnHelper = createColumnHelper<PayrollBreakdownRow>()

const columns = [
  columnHelper.accessor("label", {
    header: "Komponen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <span
          className={
            row.isHighlight
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground"
          }
        >
          {row.label}
        </span>
      )
    },
  }),
  columnHelper.accessor("amount", {
    header: "Nominal",
    meta: { align: "right" },
    cell: (info) => {
      const row = info.row.original
      return (
        <span
          className={`font-mono tabular-nums ${
            row.isHighlight ? "font-semibold text-foreground" : "text-foreground"
          }`}
        >
          {formatCurrencyExact(row.amount)}
        </span>
      )
    },
  }),
]

export function PayrollBreakdownTable({ data }: { data: PayrollBreakdownRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Rincian gaji"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
