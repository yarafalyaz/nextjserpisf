"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteEmployeeLoan } from "@/actions/hrm.actions"
import { formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface LoanData {
  id: number
  employee: { name: string }
  amount: number
  installmentAmount: number
  remainingAmount: number
  status: string
}

const columnHelper = createColumnHelper<LoanData>()

const columns = [
  columnHelper.accessor("employee", {
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/hrm/loans/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue().name}
      </Link>
    ),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("installmentAmount", {
    header: "Angsuran",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("remainingAmount", {
    header: "Sisa",
    cell: (info) => formatCurrency(info.getValue()),
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
        viewHref={`/hrm/loans/${info.row.original.id}`}
        deleteAction={deleteEmployeeLoan}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface LoanTableProps {
  data: LoanData[]
}

export function LoanTable({ data }: LoanTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pinjaman karyawan"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("loan", ids)}
    />
  )
}
