"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBank } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Bank {
  id: number
  name: string
  code: string | null
}

const columnHelper = createColumnHelper<Bank>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/bank/${info.row.original.id}`} className="text-primary hover:underline font-medium">
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
        editHref={`/master/bank/${info.row.original.id}/ubah`}
        deleteAction={deleteBank}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface BankTableProps {
  data: Bank[]
}

export function BankTable({ data }: BankTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar bank"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("bank", ids)}
    />
  )
}
