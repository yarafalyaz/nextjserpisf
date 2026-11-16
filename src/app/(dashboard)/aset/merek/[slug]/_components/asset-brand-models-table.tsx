"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"

export interface AssetBrandModelRow {
  id: number
  name: string
  createdAt: string
}

const columnHelper = createColumnHelper<AssetBrandModelRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Model",
    meta: { mobilePrimary: true },
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function AssetBrandModelsTable({ data }: { data: AssetBrandModelRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar model merek aset"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
