"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface VehicleOwnerRow {
  id: number
  customer: {
    id: number
    slug: string | null
    name: string
  }
  createdAt: string
}

const columnHelper = createColumnHelper<VehicleOwnerRow>()

const columns = [
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/pelanggan", info.row.original.customer)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Terdaftar",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function VehicleOwnersTable({ data }: { data: VehicleOwnerRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pemilik kendaraan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
