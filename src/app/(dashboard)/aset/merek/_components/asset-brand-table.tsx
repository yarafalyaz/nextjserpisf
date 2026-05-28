"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAssetBrand } from "@/actions/asset.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface AssetBrandData {
  id: number
  name: string
  _count: { models: number }
}

const columnHelper = createColumnHelper<AssetBrandData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/aset/merek/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("_count.models", {
    id: "modelsCount",
    header: "Jumlah Model",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/aset/merek/${info.row.original.id}`}
        deleteAction={deleteAssetBrand}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface AssetBrandTableProps {
  data: AssetBrandData[]
}

export function AssetBrandTable({ data }: AssetBrandTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar brand aset"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("assetBrand", ids)}
    />
  )
}
