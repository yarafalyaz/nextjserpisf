"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePurchaseOrder } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface PurchaseOrder {
  id: number
  slug: string | null
  documentNo: string
  date: Date | string
  grandTotal: number | string
  status: string
  vendor: { name: string }
}

const columnHelper = createColumnHelper<PurchaseOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={entityHref("/pembelian/pesanan", info.row.original)} className="text-foreground hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tgl. Pesanan",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "vendorName",
    header: "Vendor",
    cell: (info) => info.row.original.vendor.name,
  }),
  columnHelper.accessor("grandTotal", {
    header: "Total",
    cell: (info) => formatCurrency(Number(info.getValue())),
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
        viewHref={entityHref("/pembelian/pesanan", info.row.original)}
        deleteAction={deletePurchaseOrder}
        deleteId={info.row.original.id}
        editPermission="edit_purchase_orders"
        deletePermission="delete_purchase_orders"
      />
    ),
  }),
]

interface PurchaseOrderTableProps {
  data: PurchaseOrder[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function PurchaseOrderTable({ data, total, page, pageSize, toolbar, filters }: PurchaseOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pesanan pembelian"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("purchaseOrder", ids)}
    />
  )
}
