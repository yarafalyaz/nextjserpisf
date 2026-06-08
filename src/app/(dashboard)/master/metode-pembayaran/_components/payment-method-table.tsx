"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePaymentMethod } from "@/actions/method.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface PaymentMethod {
  id: number
  code: string
  name: string
  isActive: boolean
}

const columnHelper = createColumnHelper<PaymentMethod>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/metode-pembayaran/${info.row.original.id}/ubah`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <span className={`status-badge status-${info.getValue() ? "active" : "inactive"}`}>
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
        editHref={`/master/metode-pembayaran/${info.row.original.id}/ubah`}
        deleteAction={deletePaymentMethod}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

export function PaymentMethodTable({ data }: { data: PaymentMethod[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar metode pembayaran"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete("paymentMethod", ids)}
    />
  )
}
