"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteItemGroup } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface ItemGroup {
  id: number
  code: string
  name: string
  slug: string | null
  description: string | null
  isActive: boolean
  _count?: { items: number }
}

const columnHelper = createColumnHelper<ItemGroup>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama Grup",
    cell: (info) => (
      <Link
        href={entityHref("/master/grup-barang", info.row.original)}
        className="text-foreground hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "items",
    header: "Jumlah Barang",
    enableSorting: false,
    cell: (info) => <span>{info.row.original._count?.items ?? 0}</span>,
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (info.getValue() ? "Aktif" : "Nonaktif"),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={entityEditHref("/master/grup-barang", info.row.original)}
        deleteAction={deleteItemGroup}
        deleteId={info.row.original.id}
        editPermission="edit_item_groups"
        deletePermission="delete_item_groups"
      />
    ),
  }),
]

interface ItemGroupTableProps {
  data: ItemGroup[]
  total: number
  page: number
  pageSize: number
}

export function ItemGroupTable({ data, total, page, pageSize }: ItemGroupTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar grup barang"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama grup..."
      onBulkDelete={(ids) => bulkDelete("itemGroup", ids)}
    />
  )
}
