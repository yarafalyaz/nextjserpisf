"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate, formatReferenceType, referenceHref } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

interface Item {
  name: string
}

interface Warehouse {
  name: string
}

interface StockMove {
  id: number
  documentNo: string
  slug: string | null
  createdAt: Date | string
  item: Item
  warehouse: Warehouse | null
  qty: number | string
  impact: string
  referenceType: string | null
  referenceId: number | null
  referenceSlug?: string | null
  status: string | null
}

const columnHelper = createColumnHelper<StockMove>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={entityHref("/inventaris/mutasi-stok", info.row.original)} className="text-foreground hover:underline font-mono">
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
    header: "Barang",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("qty", {
    header: "Jml",
    cell: (info) => Number(info.getValue()),
  }),
  columnHelper.accessor("referenceType", {
    header: "Referensi",
    // AC-INV-009: tautan ke dokumen sumber bila rute dikenal; label polos bila
    // tidak (referenceHref daftar putih rute terbukti ada).
    cell: (info) => {
      const move = info.row.original
      const href = referenceHref(move.referenceType, move.referenceId, move.referenceSlug)
      const label = formatReferenceType(info.getValue())
      if (!href) return label
      return (
        <Link href={href} className="text-primary hover:underline">
          {label}
        </Link>
      )
    },
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
        viewHref={entityHref("/inventaris/mutasi-stok", info.row.original)}
      />
    ),
  }),
]

interface StockMoveTableProps {
  data: StockMove[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function StockMoveTable({ data, total, page, pageSize, toolbar, filters }: StockMoveTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar mutasi stok"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
