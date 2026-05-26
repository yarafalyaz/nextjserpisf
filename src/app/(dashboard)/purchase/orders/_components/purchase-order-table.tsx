"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePurchaseOrder } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface PurchaseOrder {
  id: number
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
      <Link href={`/purchase/orders/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tgl. Order",
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
        viewHref={`/purchase/orders/${info.row.original.id}`}
        deleteAction={deletePurchaseOrder}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface PurchaseOrderTableProps {
  data: PurchaseOrder[]
}

export function PurchaseOrderTable({ data }: PurchaseOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar purchase order"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("purchaseOrder", ids)}
    />
  )
}
