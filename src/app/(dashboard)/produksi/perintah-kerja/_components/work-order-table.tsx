"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteWorkOrder } from "@/actions/manufacturing.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface WorkOrder {
  id: number
  documentNo: string
  status: string
  customer: { name: string }
  date: Date | string
}

const columnHelper = createColumnHelper<WorkOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. WO",
    cell: (info) => (
      <Link href={`/produksi/perintah-kerja/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
  }),
  columnHelper.accessor("date", {
    header: "Tanggal Mulai",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/produksi/perintah-kerja/${info.row.original.id}`}
        deleteAction={deleteWorkOrder}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface WorkOrderTableProps {
  data: WorkOrder[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function WorkOrderTable({ data, toolbar, filters }: WorkOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar perintah kerja"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("workOrder", ids)}
    />
  )
}
