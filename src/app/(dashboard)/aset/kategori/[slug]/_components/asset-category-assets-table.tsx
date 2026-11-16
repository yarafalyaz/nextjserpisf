"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"

export interface AssetCategoryAssetRow {
  id: number
  slug: string | null
  code: string
  name: string
  status: string
}

const columnHelper = createColumnHelper<AssetCategoryAssetRow>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <Link href={entityHref("/aset", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function AssetCategoryAssetsTable({ data }: { data: AssetCategoryAssetRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar aset dalam kategori"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
