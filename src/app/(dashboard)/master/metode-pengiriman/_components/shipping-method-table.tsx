"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteShippingMethod } from "@/actions/method.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface ShippingMethod {
  id: number
  code: string
  name: string
  isActive: boolean
}

const columnHelper = createColumnHelper<ShippingMethod>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/metode-pengiriman/${info.row.original.id}/ubah`} className="text-foreground hover:underline font-medium">
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
        editHref={`/master/metode-pengiriman/${info.row.original.id}/ubah`}
        deleteAction={deleteShippingMethod}
        deleteId={info.row.original.id}
        editPermission="edit_shipping_methods"
        deletePermission="delete_shipping_methods"
      />
    ),
  }),
]

export function ShippingMethodTable({ data }: { data: ShippingMethod[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar metode pengiriman"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete("shippingMethod", ids)}
    />
  )
}
