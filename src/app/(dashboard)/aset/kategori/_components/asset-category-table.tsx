"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAssetCategory } from "@/actions/asset.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface AssetCategoryData {
  id: number
  name: string
  depreciationRate: number | null
  usefulLife: number | null
}

const columnHelper = createColumnHelper<AssetCategoryData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/aset/kategori/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("depreciationRate", {
    header: "Depresiasi (%)",
    cell: (info) => {
      const val = info.getValue()
      return val ? `${Number(val)}%` : "-"
    },
  }),
  columnHelper.accessor("usefulLife", {
    header: "Umur Manfaat",
    cell: (info) => {
      const val = info.getValue()
      return val ? `${val} tahun` : "-"
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/aset/kategori/${info.row.original.id}`}
        editHref={`/aset/kategori/${info.row.original.id}/ubah`}
        deleteAction={deleteAssetCategory}
        deleteId={info.row.original.id}
        deletePermission="delete_asset_categories"
      />
    ),
  }),
]

interface AssetCategoryTableProps {
  data: AssetCategoryData[]
}

export function AssetCategoryTable({ data }: AssetCategoryTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kategori aset"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama kategori..."
      onBulkDelete={(ids) => bulkDelete("assetCategory", ids)}
    />
  )
}
