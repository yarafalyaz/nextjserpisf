"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"

export interface VehicleModelVariantRow {
  id: number
  name: string
  drivetrain: string | null
  transmission: string | null
  createdAt: string
}

const columnHelper = createColumnHelper<VehicleModelVariantRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Varian",
    meta: { mobilePrimary: true },
  }),
  columnHelper.accessor("drivetrain", {
    header: "Penggerak",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("transmission", {
    header: "Transmisi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function VehicleModelVariantsTable({ data }: { data: VehicleModelVariantRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar varian model kendaraan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
