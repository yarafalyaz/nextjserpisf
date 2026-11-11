"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { deleteSalesOrder, bulkDeleteDraftSalesOrders } from "@/actions/sales.actions"
import { entityHref } from "@/lib/utils/entity-url"
import { useBulkDeleteSessionUser } from "@/components/ui/data-table-bulk-select"

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
      <Link
        href={entityHref("/penjualan/pesanan", info.row.original)}
        className="font-mono text-xs font-semibold text-foreground hover:underline"
      >
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
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("grandTotal", {
    header: () => <div className="text-right">Total</div>,
    cell: (info) => (
      <div className="text-right font-mono tabular-nums font-medium text-foreground">
        {formatCurrencyExact(Number(info.getValue()))}
      </div>
    ),
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
  const bulkDeleteUser = useBulkDeleteSessionUser()

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pesanan penjualan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={async (ids) => {
        const res = await bulkDeleteDraftSalesOrders(ids)
        if (res.success) {
          return { success: true }
        }
        return { success: false, message: res.error }
      }}
      bulkDeletePermission="delete_sales_orders"
      bulkDeleteUser={bulkDeleteUser}
    />
  )
}
