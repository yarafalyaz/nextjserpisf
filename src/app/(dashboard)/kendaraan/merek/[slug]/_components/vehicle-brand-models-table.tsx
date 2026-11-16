"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface VehicleBrandModelRow {
  id: number
  slug: string | null
  name: string
  variantsCount: number
  createdAt: string
}

const columnHelper = createColumnHelper<VehicleBrandModelRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Model",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/kendaraan/model", info.row.original)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("variantsCount", {
    header: "Jumlah Varian",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function VehicleBrandModelsTable({ data }: { data: VehicleBrandModelRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar model merek kendaraan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
