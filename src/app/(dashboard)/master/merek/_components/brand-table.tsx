"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBrand } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Brand {
  id: number
  name: string
  _count: { items: number }
}

const columnHelper = createColumnHelper<Brand>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Brand",
    cell: (info) => (
      <Link href={`/master/merek/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("_count.items", {
    header: "Jumlah Item",
    cell: (info) => info.getValue() || 0,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/merek/${info.row.original.id}/edit`}
        deleteAction={deleteBrand}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface BrandTableProps {
  data: Brand[]
}

export function BrandTable({ data }: BrandTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar brand"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("brand", ids)}
    />
  )
}
