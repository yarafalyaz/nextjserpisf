"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"

interface RowItem {
  id: number
  sku: string
  name: string
  unitOfMeasure: string
  rackRowQty: number
  qtyOnHand: number
}

const columnHelper = createColumnHelper<RowItem>()

const columns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama Barang",
    cell: (info) => (
      <Link href={`/master/barang/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("unitOfMeasure", {
    header: "Satuan (UoM)",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("rackRowQty", {
    header: "Qty di Baris Ini",
    cell: (info) => Number(info.getValue()),
  }),
  columnHelper.accessor("qtyOnHand", {
    header: "Total Qty Sistem",
    cell: (info) => Number(info.getValue()),
  }),
]

export function RackRowItemsTable({ data }: { data: RowItem[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar barang di baris rak"
      pageSize={10}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari barang..."
    />
  )
}
