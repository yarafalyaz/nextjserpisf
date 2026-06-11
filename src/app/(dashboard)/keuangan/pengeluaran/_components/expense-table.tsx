"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteExpense } from "@/actions/finance.actions"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface ExpenseData {
  id: number
  documentNo: string
  date: string
  description: string | null
  category: string | null
  amount: number
  status: string
}

const columnHelper = createColumnHelper<ExpenseData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/keuangan/pengeluaran/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("category", {
    header: "Kategori",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
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
        viewHref={`/keuangan/pengeluaran/${info.row.original.id}`}
        deleteAction={deleteExpense}
        deleteId={info.row.original.id}
        editPermission="edit_expenses"
        deletePermission="delete_expenses"
      />
    ),
  }),
]

interface ExpenseTableProps {
  data: ExpenseData[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function ExpenseTable({ data, toolbar, filters }: ExpenseTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar expense"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("expense", ids)}
    />
  )
}
