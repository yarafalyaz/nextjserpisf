"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDeliveryOrder } from "@/actions/sales.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface DeliveryOrder {
  id: number
  documentNo: string
  doNumber?: string | null
  salesOrder: { documentNo: string; customer: { name: string } }
  date: Date | string
  status: string
}

const columnHelper = createColumnHelper<DeliveryOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/penjualan/surat-jalan/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("doNumber", {
    header: "No. DO",
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="font-mono">{val}</span> : <span className="text-muted-foreground">-</span>
    },
  }),
  columnHelper.accessor((row) => row.salesOrder.documentNo, {
    id: "soDocumentNo",
    header: "SO Ref",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.salesOrder.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
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
        deleteAction={deleteDeliveryOrder}
        deleteId={info.row.original.id}
        deletePermission="delete_delivery_orders"
      />
    ),
  }),
]

interface DeliveryOrderTableProps {
  data: DeliveryOrder[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function DeliveryOrderTable({ data, toolbar, filters }: DeliveryOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar delivery order"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("deliveryOrder", ids)}
    />
  )
}
