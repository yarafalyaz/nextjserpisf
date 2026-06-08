"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteStockAdjustment } from "@/actions/inventory.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface AdjustmentItem {
  id: number
}

interface Warehouse {
  name: string
}

interface StockAdjustment {
  id: number
  documentNo: string
  warehouse: Warehouse
  date: string | Date
  reason: string | null
  items: AdjustmentItem[]
  status: string
}

const columnHelper = createColumnHelper<StockAdjustment>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/inventaris/penyesuaian/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("warehouse.name", {
    header: "Gudang",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("reason", {
    header: "Alasan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("items", {
    header: "Item",
    cell: (info) => `${info.getValue().length} item`,
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
        viewHref={`/inventaris/penyesuaian/${info.row.original.id}`}
        deleteAction={deleteStockAdjustment}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface AdjustmentTableProps {
  data: StockAdjustment[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function AdjustmentTable({ data, toolbar, filters }: AdjustmentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar penyesuaian stok"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("stockAdjustment", ids)}
    />
  )
}
