"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteInventoryTransfer } from "@/actions/inventory.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface Warehouse {
  name: string
}

interface InventoryTransfer {
  id: number
  documentNo: string
  slug: string | null
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
      <Link href={entityHref("/inventaris/transfer", info.row.original)} className="text-foreground hover:underline font-mono">
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
      // F-2026-10-22-081-S §6: processed belum diterima = "Dalam Perjalanan".
      return <StatusChip status={val} customLabel={val === "processed" ? "Dalam Perjalanan" : undefined} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/inventaris/transfer", info.row.original)}
        deleteAction={deleteInventoryTransfer}
        deleteId={info.row.original.id}
        editPermission="edit_inventory_transfers"
        deletePermission="delete_inventory_transfers"
      />
    ),
  }),
]

interface TransferTableProps {
  data: InventoryTransfer[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function TransferTable({ data, total, page, pageSize, toolbar, filters }: TransferTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar transfer inventaris"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("stockTransfer", ids)}
    />
  )
}
