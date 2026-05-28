"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBudget } from "@/actions/finance.actions"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface BudgetData {
  id: number
  name: string
  amount: number
  startDate: string
  endDate: string
}

const columnHelper = createColumnHelper<BudgetData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/keuangan/anggaran/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("startDate", {
    header: "Mulai",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("endDate", {
    header: "Selesai",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/anggaran/${info.row.original.id}`}
        deleteAction={deleteBudget}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface BudgetTableProps {
  data: BudgetData[]
}

export function BudgetTable({ data }: BudgetTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar budget"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("budget", ids)}
    />
  )
}
