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
import { entityHref } from "@/lib/utils/entity-url"

interface LoanData {
  id: number
  slug: string | null
  employee: { name: string }
  loanDate: string
  totalAmount: number
  monthlyInstallment: number
  remainingAmount: number
  status: string
  channel?: string | null
}

const columnHelper = createColumnHelper<LoanData>()

const columns = [
  columnHelper.accessor("employee", {
    id: "employee",
    header: "Karyawan",
    cell: (info) => (
      <Link href={entityHref("/sdm/pinjaman", info.row.original)} className="text-foreground hover:underline font-medium">
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
  columnHelper.accessor("channel", {
    header: "Kanal",
    // Label kanal verbatim dari loader loadEmployeeLoanChannels (Q-LS-3b).
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/sdm/pinjaman", info.row.original)}
        deleteAction={deleteEmployeeLoan}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface LoanTableProps {
  data: LoanData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
  showActions?: boolean
  showEmployeeColumn?: boolean
  /** Permukaan baca-saja (mis. pengajuan mandiri): tanpa seleksi massal/hapus. */
  readOnly?: boolean
}

export function LoanTable({ data, total, page, pageSize, toolbar, filters, showActions = true, showEmployeeColumn = true, readOnly = false }: LoanTableProps) {
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
      serverPagination={{ total, page, pageSize }}
      selectable={!readOnly}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={readOnly ? undefined : (ids) => bulkDelete("loan", ids)}
    />
  )
}
