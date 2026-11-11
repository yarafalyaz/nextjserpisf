"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"

interface RowItem {
  id: number
  sku: string
  name: string
  slug: string | null
  unitOfMeasure: string
  rackRowQty: number
  qtyOnHand: number
}

const columnHelper = createColumnHelper<RowItem>()

const columns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: (info) => (
      <Link
        href={entityHref("/master/barang", info.row.original)}
        className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline tabular-nums"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama Barang",
    // The item name (linked) is the card's headline; the SKU becomes a detail line.
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/master/barang", info.row.original)}
        className="text-foreground hover:text-primary hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("unitOfMeasure", {
    header: "Satuan (UoM)",
    cell: (info) => (
      <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("rackRowQty", {
    header: "Kuantitas di Baris Ini",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
        {Number(info.getValue()).toLocaleString("id-ID")}
      </span>
    ),
  }),
  columnHelper.accessor("qtyOnHand", {
    header: "Total Stok Sistem",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {Number(info.getValue()).toLocaleString("id-ID")}
      </span>
    ),
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
      searchPlaceholder="Cari SKU atau nama barang..."
    />
  )
}
