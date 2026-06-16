"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"

export interface LeaveBalanceRow {
  // DataTable requires a stable `id` per row; we key on employeeId.
  id: number
  employeeId: number
  name: string
  employeeNo: string
  department: string | null
  joinDate: string
  entitled: number
  used: number
  remaining: number
  eligible: boolean
  tenureMonths: number
}

const columnHelper = createColumnHelper<LeaveBalanceRow>()

function tenureLabel(months: number): string {
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years > 0 && rem > 0) return `${years} thn ${rem} bln`
  if (years > 0) return `${years} thn`
  return `${rem} bln`
}

const columns = [
  columnHelper.accessor("name", {
    header: "Karyawan",
    cell: (info) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{info.getValue()}</span>
        <span className="text-xs text-muted-foreground">{info.row.original.employeeNo}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.department ?? "-", {
    id: "department",
    header: "Departemen",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "tenure",
    header: "Masa Kerja",
    cell: (info) => tenureLabel(info.row.original.tenureMonths),
  }),
  columnHelper.accessor("entitled", {
    header: "Jatah",
    cell: (info) => `${info.getValue()} hari`,
  }),
  columnHelper.accessor("used", {
    header: "Terpakai",
    cell: (info) => `${info.getValue()} hari`,
  }),
  columnHelper.accessor("remaining", {
    header: "Sisa",
    cell: (info) => {
      const row = info.row.original
      if (!row.eligible) {
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-warning/40 bg-warning/10 text-warning">
            Belum 1 tahun
          </span>
        )
      }
      const remaining = info.getValue()
      return (
        <span className={`font-semibold ${remaining > 0 ? "text-success" : "text-destructive"}`}>
          {remaining} hari
        </span>
      )
    },
  }),
]

export function LeaveBalanceTable({
  data,
  toolbar,
}: {
  data: LeaveBalanceRow[]
  toolbar?: React.ReactNode
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Saldo cuti karyawan"
      pageSize={20}
      toolbar={toolbar}
    />
  )
}
