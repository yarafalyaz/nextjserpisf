"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface VendorBillItemRow {
  id: number
  description: string | null
  qty: number
  unitPrice: number
  total: number
}

const columnHelper = createColumnHelper<VendorBillItemRow>()

const columns = [
  columnHelper.accessor("description", {
    header: "Deskripsi",
    meta: { mobilePrimary: true },
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("unitPrice", {
    header: "Harga",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("total", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function VendorBillItemsTable({
  data,
}: Readonly<{ data: VendorBillItemRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Item Tagihan Pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
