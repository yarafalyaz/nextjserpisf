"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePettyCash } from "@/actions/finance.actions"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface PettyCashData {
  id: number
  documentNo: string
  date: string
  type: string
  description: string | null
  amount: number
  balanceAfter: number
}

const columnHelper = createColumnHelper<PettyCashData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/keuangan/kas-kecil/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("balanceAfter", {
    header: "Saldo Setelah",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/kas-kecil/${info.row.original.id}`}
        deleteAction={deletePettyCash}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface PettyCashTableProps {
  data: PettyCashData[]
}

export function PettyCashTable({ data }: PettyCashTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar petty cash"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("pettyCash", ids)}
    />
  )
}
