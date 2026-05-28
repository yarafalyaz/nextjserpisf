"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteItemCategory } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface ItemCategory {
  id: number
  name: string
  description: string | null
}

const columnHelper = createColumnHelper<ItemCategory>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/kategori-barang/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/kategori-barang/${info.row.original.id}/edit`}
        deleteAction={deleteItemCategory}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ItemCategoryTableProps {
  data: ItemCategory[]
}

export function ItemCategoryTable({ data }: ItemCategoryTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kategori item"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("itemCategory", ids)}
    />
  )
}
