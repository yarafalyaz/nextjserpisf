"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteInventoryTransfer } from "@/actions/inventory.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface Warehouse {
  name: string
}

interface InventoryTransfer {
  id: number
  documentNo: string
  sourceWarehouse: Warehouse
  destinationWarehouse: Warehouse
  date: string | Date
  status: string
}

const columnHelper = createColumnHelper<InventoryTransfer>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/inventaris/transfer/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("sourceWarehouse.name", {
    header: "Dari",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("destinationWarehouse.name", {
    header: "Ke",
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
        viewHref={`/inventaris/transfer/${info.row.original.id}`}
        deleteAction={deleteInventoryTransfer}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface TransferTableProps {
  data: InventoryTransfer[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function TransferTable({ data, toolbar, filters }: TransferTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar transfer inventaris"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("stockTransfer", ids)}
    />
  )
}
