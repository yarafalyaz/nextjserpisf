"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBank } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Bank {
  id: number
  name: string
  slug: string | null
  code: string | null
}

const columnHelper = createColumnHelper<Bank>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/master/bank", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue() || "-"}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={entityEditHref("/master/bank", info.row.original)}
        deleteAction={deleteBank}
        deleteId={info.row.original.id}
        editPermission="edit_banks"
        deletePermission="delete_banks"
      />
    ),
  }),
]

interface BankTableProps {
  data: Bank[]
  total: number
  page: number
  pageSize: number
}

export function BankTable({ data, total, page, pageSize }: BankTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar bank"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode bank..."
      onBulkDelete={(ids) => bulkDelete("bank", ids)}
    />
  )
}
