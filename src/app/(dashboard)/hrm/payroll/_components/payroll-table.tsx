"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrency } from "@/lib/utils/format"

interface PayrollData {
  id: number
  documentNo: string
  period: string
  totalAmount: number
  status: string
}

const columnHelper = createColumnHelper<PayrollData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("period", {
    header: "Periode",
    cell: (info) => (
      <Link href={`/hrm/payroll/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("totalAmount", {
    header: "Total",
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
        viewHref={`/hrm/payroll/${info.row.original.id}`}
      />
    ),
  }),
]

interface PayrollTableProps {
  data: PayrollData[]
}

export function PayrollTable({ data }: PayrollTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar payroll"
      pageSize={20}
      selectable={false}
    />
  )
}
