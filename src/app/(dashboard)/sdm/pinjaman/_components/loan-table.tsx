"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteEmployeeLoan } from "@/actions/hrm.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface LoanData {
  id: number
  employee: { name: string }
  loanDate: string
  totalAmount: number
  monthlyInstallment: number
  remainingAmount: number
  status: string
}

const columnHelper = createColumnHelper<LoanData>()

const columns = [
  columnHelper.accessor("employee", {
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/sdm/pinjaman/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue().name}
      </Link>
    ),
  }),
  columnHelper.accessor("loanDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("totalAmount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("monthlyInstallment", {
    header: "Angsuran/Bulan",
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
        viewHref={`/sdm/pinjaman/${info.row.original.id}`}
        deleteAction={deleteEmployeeLoan}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface LoanTableProps {
  data: LoanData[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function LoanTable({ data, toolbar, filters }: LoanTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pinjaman karyawan"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("loan", ids)}
    />
  )
}
