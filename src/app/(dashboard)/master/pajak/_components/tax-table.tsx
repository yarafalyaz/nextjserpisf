"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTax } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Tax {
  id: number
  name: string
  rate: number | string
}

const columnHelper = createColumnHelper<Tax>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/pajak/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("rate", {
    header: "Rate (%)",
    cell: (info) => `${Number(info.getValue())}%`,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/pajak/${info.row.original.id}/ubah`}
        deleteAction={deleteTax}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface TaxTableProps {
  data: Tax[]
}

export function TaxTable({ data }: TaxTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pajak"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama pajak..."
      onBulkDelete={(ids) => bulkDelete("tax", ids)}
    />
  )
}
