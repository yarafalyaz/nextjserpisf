"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTax } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Tax {
  id: number
  name: string
  slug: string | null
  rate: number | string
}

const columnHelper = createColumnHelper<Tax>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/master/pajak", info.row.original)} className="text-foreground hover:underline font-medium">
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
        editHref={entityEditHref("/master/pajak", info.row.original)}
        deleteAction={deleteTax}
        deleteId={info.row.original.id}
        editPermission="edit_taxes"
        deletePermission="delete_taxes"
      />
    ),
  }),
]

interface TaxTableProps {
  data: Tax[]
  total: number
  page: number
  pageSize: number
}

export function TaxTable({ data, total, page, pageSize }: TaxTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pajak"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama pajak..."
      onBulkDelete={(ids) => bulkDelete("tax", ids)}
    />
  )
}
