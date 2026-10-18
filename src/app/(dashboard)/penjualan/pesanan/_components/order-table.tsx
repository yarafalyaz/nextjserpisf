"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { deleteSalesOrder } from "@/actions/sales.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface SalesOrder {
  id: number
  slug: string | null
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
      <Link href={entityHref("/penjualan/pesanan", info.row.original)} className="text-foreground hover:underline font-mono">
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
        viewHref={entityHref("/penjualan/pesanan", info.row.original)}
        deleteAction={deleteSalesOrder}
        deleteId={info.row.original.id}
        editPermission="edit_sales_orders"
        deletePermission="delete_sales_orders"
      />
    ),
  }),
]

interface OrderTableProps {
  data: SalesOrder[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function OrderTable({ data, total, page, pageSize, toolbar, filters }: OrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pesanan penjualan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("salesOrder", ids)}
    />
  )
}
