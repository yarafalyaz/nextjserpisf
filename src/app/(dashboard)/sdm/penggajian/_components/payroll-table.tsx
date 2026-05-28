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
  employeeName: string | null
  baseSalary: number
  allowances: number
  deductions: number
  netSalary: number
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
  columnHelper.accessor("employeeName", {
    header: "Karyawan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("baseSalary", {
    header: "Gaji Pokok",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("allowances", {
    header: "Tunjangan",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("deductions", {
    header: "Potongan",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("netSalary", {
    header: "Gaji Bersih",
    cell: (info) => <span className="text-right block font-medium">{formatCurrency(info.getValue())}</span>,
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
