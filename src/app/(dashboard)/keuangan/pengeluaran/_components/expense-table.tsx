"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteExpense, approveExpense } from "@/actions/finance.actions"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface ExpenseData {
  id: number
  documentNo: string
  date: string
  description: string | null
  categoryName: string | null
  vendorName: string | null
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
  columnHelper.accessor("categoryName", {
    header: "Kategori",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("vendorName", {
    header: "Vendor",
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
    cell: (info) => {
      const row = info.row.original
      // Only pre-approval rows can be approved. The action calls approveExpense
      // (not the generic workflow route) so the petty-cash sync runs.
      const canApprove = row.status === "draft" || row.status === "pending"
      return (
        <ActionDropdown
          viewHref={`/keuangan/pengeluaran/${row.id}`}
          deleteAction={deleteExpense}
          deleteId={row.id}
          editPermission="edit_expenses"
          deletePermission="delete_expenses"
          {...(canApprove
            ? {
                processAction: approveExpense,
                processLabel: "Setujui",
                processPermission: "approve_expenses",
                processSuccessMessage: "Pengeluaran disetujui",
                processConfirmTitle: "Setujui pengeluaran ini?",
                processConfirmBody:
                  "Pengeluaran akan disetujui dan, bila dibayar dari kas kecil, kas kecil akan disinkronkan.",
              }
            : {})}
        />
      )
    },
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
