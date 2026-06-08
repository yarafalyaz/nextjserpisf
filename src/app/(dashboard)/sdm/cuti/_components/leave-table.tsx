"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteLeaveRequest } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface LeaveRequest {
  id: number
  employee: { name: string }
  type: string
  startDate: Date | string
  endDate: Date | string
  status: string
}

const leaveTypeLabels: Record<string, string> = {
  Annual: "Cuti Tahunan",
  Sick: "Cuti Sakit",
  Unpaid: "Cuti Tanpa Gaji",
  Maternity: "Cuti Melahirkan",
}

function calculateDays(startDate: Date | string, endDate: Date | string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

const columnHelper = createColumnHelper<LeaveRequest>()

const columns = [
  columnHelper.accessor((row) => row.employee.name, {
    id: "employeeName",
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/sdm/cuti/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("type", {
    header: "Tipe Cuti",
    cell: (info) => {
      const val = info.getValue()
      return <span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary">{leaveTypeLabels[val] || val}</span>
    },
  }),
  columnHelper.accessor("startDate", {
    header: "Mulai",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("endDate", {
    header: "Selesai",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "totalDays",
    header: "Total Hari Kerja",
    cell: (info) => {
      const { startDate, endDate } = info.row.original
      if (!startDate || !endDate) return "-"
      const days = calculateDays(startDate, endDate)
      return `${days} hari`
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/cuti/${info.row.original.id}`}
        deleteAction={deleteLeaveRequest}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface LeaveTableProps {
  data: LeaveRequest[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function LeaveTable({ data, toolbar, filters }: LeaveTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar cuti"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("leave", ids)}
    />
  )
}
