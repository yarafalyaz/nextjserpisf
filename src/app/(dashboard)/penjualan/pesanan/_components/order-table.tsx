"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface SalesOrder {
  id: number
  documentNo: string
  customer: { name: string }
  date: Date | string
  grandTotal: number | string
  status: string
}

const columnHelper = createColumnHelper<SalesOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/penjualan/pesanan/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("grandTotal", {
    header: "Total",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/penjualan/pesanan/${info.row.original.id}`}
        editPermission="edit_sales_orders"
        deletePermission="delete_sales_orders"
      />
    ),
  }),
]

interface OrderTableProps {
  data: SalesOrder[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function OrderTable({ data, toolbar, filters }: OrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar sales order"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("salesOrder", ids)}
    />
  )
}
