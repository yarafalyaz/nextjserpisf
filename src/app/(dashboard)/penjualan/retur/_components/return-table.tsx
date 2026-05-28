"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface SalesReturn {
  id: number
  documentNo: string
  date: Date | string
  reason: string | null
  status: string
}

const columnHelper = createColumnHelper<SalesReturn>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/penjualan/retur/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("reason", {
    header: "Alasan",
    cell: (info) => info.getValue() || "-",
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
        viewHref={`/penjualan/retur/${info.row.original.id}`}
      />
    ),
  }),
]

interface ReturnTableProps {
  data: SalesReturn[]
}

export function ReturnTable({ data }: ReturnTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar retur penjualan"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("salesReturn", ids)}
    />
  )
}
