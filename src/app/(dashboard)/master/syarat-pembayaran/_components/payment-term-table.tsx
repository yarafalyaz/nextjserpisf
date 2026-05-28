"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePaymentTerm } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface PaymentTerm {
  id: number
  name: string
  code: string
  days: number
  isActive: boolean
}

const columnHelper = createColumnHelper<PaymentTerm>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <Link href={`/master/syarat-pembayaran/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("days", {
    header: "Hari",
    cell: (info) => <span>{info.getValue()} hari</span>,
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <span className={`badge ${info.getValue() ? "badge-success" : "badge-secondary"}`}>
        {info.getValue() ? "Aktif" : "Nonaktif"}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/syarat-pembayaran/${info.row.original.id}/edit`}
        deleteAction={deletePaymentTerm}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface PaymentTermTableProps {
  data: PaymentTerm[]
}

export function PaymentTermTable({ data }: PaymentTermTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar termin pembayaran"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("paymentTerm", ids)}
    />
  )
}
