"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatNumber } from "@/lib/utils/format"

export interface StockAdjustmentItemRow {
  id: number
  itemName: string
  systemQty: number
  actualQty: number
  difference: number
}

const columnHelper = createColumnHelper<StockAdjustmentItemRow>()

const columns = [
  columnHelper.accessor("itemName", {
    header: "Nama Barang",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("systemQty", {
    header: "Kuantitas Sistem",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("actualQty", {
    header: "Kuantitas Aktual",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("difference", {
    header: "Selisih",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
]

export function StockAdjustmentItemsTable({ data }: { data: StockAdjustmentItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar Barang Penyesuaian Stok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
