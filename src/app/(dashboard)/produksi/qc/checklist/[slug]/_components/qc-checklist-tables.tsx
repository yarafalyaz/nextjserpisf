"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"

export interface QcChecklistItemRow {
  id: number
  itemName: string
  methodLabel: string
  spec: string | null
  isRequired: boolean
}

const columnHelper = createColumnHelper<QcChecklistItemRow>()

const columns = [
  columnHelper.display({
    id: "no",
    header: "#",
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {info.row.index + 1}
      </span>
    ),
  }),
  columnHelper.accessor("itemName", {
    header: "Butir",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("methodLabel", {
    header: "Metode",
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("spec", {
    header: "Spesifikasi",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? "-"}</span>
    ),
  }),
  columnHelper.accessor("isRequired", {
    header: "Wajib",
    cell: (info) => (
      <span className="text-foreground">{info.getValue() ? "Ya" : "Tidak"}</span>
    ),
  }),
]

export function QcChecklistItemsTable({ data }: { data: QcChecklistItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Butir Checklist QC"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
