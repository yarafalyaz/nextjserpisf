"use client"

import { createColumnHelper } from "@/lib/table"
import { useMemo } from "react"
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
    id: "employee",
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
  showActions?: boolean
  showEmployeeColumn?: boolean
}

export function LoanTable({ data, toolbar, filters, showActions = true, showEmployeeColumn = true }: LoanTableProps) {
  const visibleColumns = useMemo(() => {
    let cols = columns
    if (!showActions) cols = cols.filter((c: any) => c.id !== "actions")
    if (!showEmployeeColumn) cols = cols.filter((c: any) => c.id !== "employee")
    return cols
  }, [showActions, showEmployeeColumn])

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Daftar pinjaman"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("loan", ids)}
    />
  )
}
