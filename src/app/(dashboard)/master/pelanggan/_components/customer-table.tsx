"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteCustomer } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Customer {
  id: number
  name: string
  code: string | null
  phone: string | null
  isActive: boolean
}

const columnHelper = createColumnHelper<Customer>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/pelanggan/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue() || "-"}</span>,
  }),
  columnHelper.accessor("phone", {
    header: "Telepon",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <StatusChip status={info.getValue() ? "Aktif" : "Nonaktif"} />
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/master/pelanggan/${info.row.original.id}`}
        editHref={`/master/pelanggan/${info.row.original.id}/edit`}
        deleteAction={deleteCustomer}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface CustomerTableProps {
  data: Customer[]
}

export function CustomerTable({ data }: CustomerTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar customer"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("customer", ids)}
    />
  )
}
