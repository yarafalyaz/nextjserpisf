"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAssetGroup } from "@/actions/asset.actions"
import { entityEditHref } from "@/lib/utils/entity-url"

interface AssetGroupData {
  id: number
  name: string
  _count?: { assets: number }
}

const columnHelper = createColumnHelper<AssetGroupData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "jumlahAset",
    header: "Jumlah Aset",
    enableSorting: false,
    cell: (info) => <span>{info.row.original._count?.assets ?? 0}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={entityEditHref("/aset/grup", info.row.original)}
        deleteAction={deleteAssetGroup}
        deleteId={info.row.original.id}
        deletePermission="delete_asset_groups"
      />
    ),
  }),
]

export function AssetGroupTable({
  data,
  total,
  page,
  pageSize,
}: {
  data: AssetGroupData[]
  total: number
  page: number
  pageSize: number
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      serverPagination={{ total, page, pageSize }}
      searchColumn="name"
      searchPlaceholder="Cari grup aset..."
    />
  )
}
