"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"

interface Item {
  name: string
}

interface Warehouse {
  name: string
}

interface StockMove {
  id: number
  documentNo: string
  createdAt: Date | string
  item: Item
  warehouse: Warehouse | null
  qty: number | string
  impact: string
  referenceType: string | null
  status: string | null
}

const columnHelper = createColumnHelper<StockMove>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/inventaris/mutasi-stok/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Tgl. Transaksi",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("impact", {
    header: "Dampak",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.accessor("item.name", {
    header: "Item",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("qty", {
    header: "Jml",
    cell: (info) => Number(info.getValue()),
  }),
  columnHelper.accessor("referenceType", {
    header: "Referensi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("warehouse.name", {
    header: "Gudang",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      if (!val) return "-"
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/inventaris/mutasi-stok/${info.row.original.id}`}
      />
    ),
  }),
]

interface StockMoveTableProps {
  data: StockMove[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function StockMoveTable({ data, toolbar, filters }: StockMoveTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar mutasi stok"
      pageSize={20}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
