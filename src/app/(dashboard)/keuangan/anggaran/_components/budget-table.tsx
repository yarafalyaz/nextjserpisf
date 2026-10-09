"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBudget } from "@/actions/finance.actions"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface BudgetData {
  id: number
  slug: string | null
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
      <Link href={entityHref("/keuangan/anggaran", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/keuangan/anggaran", info.row.original)}
        deleteAction={deleteBudget}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface BudgetTableProps {
  data: BudgetData[]
  total: number
  page: number
  pageSize: number
}

export function BudgetTable({ data, total, page, pageSize }: BudgetTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar budget"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama anggaran..."
      onBulkDelete={(ids) => bulkDelete("budget", ids)}
    />
  )
}
