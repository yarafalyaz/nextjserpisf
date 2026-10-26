"use client"

import { createColumnHelper } from "@/lib/table"
import { useMemo } from "react"
import { DataTable } from "@/components/ui/data-table"
import {
  LEAVE_BALANCE_INACTIVE_LABEL,
  LEAVE_BALANCE_NOT_ELIGIBLE_LABEL,
  LEAVE_BALANCE_NO_DEPARTMENT_LABEL,
} from "@/lib/reports/leave-balance"

export interface LeaveBalanceRow {
  // DataTable requires a stable `id` per row; we key on employeeId.
  id: number
  employeeId: number
  name: string
  employeeNo: string
  departmentId: number | null
  department: string | null
  joinDate: string
  isActive: boolean
  entitled: number
  used: number
  usedApproved: number
  usedPending: number
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
    id: "employeeName",
    header: "Karyawan",
    cell: (info) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{info.getValue()}</span>
        <span className="text-xs text-muted-foreground">{info.row.original.employeeNo}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.department ?? LEAVE_BALANCE_NO_DEPARTMENT_LABEL, {
    id: "department",
    header: "Departemen",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("isActive", {
    id: "status",
    header: "Status",
    cell: (info) =>
      info.getValue() ? (
        <span className="text-muted-foreground">Aktif</span>
      ) : (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-default bg-muted text-muted-foreground">
          {LEAVE_BALANCE_INACTIVE_LABEL}
        </span>
      ),
  }),
  columnHelper.display({
    id: "tenure",
    header: "Masa Kerja",
    cell: (info) => {
      const row = info.row.original
      if (!row.eligible) {
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-warning/40 bg-warning/10 text-warning">
            {LEAVE_BALANCE_NOT_ELIGIBLE_LABEL}
          </span>
        )
      }
      return tenureLabel(row.tenureMonths)
    },
  }),
  columnHelper.accessor("entitled", {
    header: "Jatah",
    cell: (info) => `${info.getValue()} hari`,
  }),
  columnHelper.accessor("usedApproved", {
    header: "Terpakai Disetujui",
    cell: (info) => `${info.getValue()} hari`,
  }),
  columnHelper.accessor("usedPending", {
    header: "Terpakai Menunggu",
    cell: (info) => `${info.getValue()} hari`,
  }),
  columnHelper.accessor("remaining", {
    header: "Sisa",
    cell: (info) => {
      const row = info.row.original
      if (!row.eligible) {
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-warning/40 bg-warning/10 text-warning">
            {LEAVE_BALANCE_NOT_ELIGIBLE_LABEL}
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
  showIdentityColumns = true,
}: {
  data: LeaveBalanceRow[]
  toolbar?: React.ReactNode
  /** BR-LVB-14: diputus server dari scope efektif, bukan izin edit/delete. */
  showIdentityColumns?: boolean
}) {
  const visibleColumns = useMemo(() => {
    if (!showIdentityColumns) return columns.filter((c) => c.id !== "employeeName" && c.id !== "department")
    return columns
  }, [showIdentityColumns])

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Saldo cuti karyawan"
      pageSize={20}
      toolbar={toolbar}
    />
  )
}
