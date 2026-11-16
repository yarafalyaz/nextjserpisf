"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"

export interface BrandItemRow {
  id: number
  sku: string
  name: string
  slug: string | null
}

const columnHelper = createColumnHelper<BrandItemRow>()

const columns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama Barang",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/barang", info.row.original)} className="text-primary hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
]

export function BrandItemsTable({ data }: { data: BrandItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar barang dengan merek ini"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
