"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"

interface AttendanceData {
  id: number
  employee: { name: string }
  date: string
  checkIn: string | null
  checkOut: string | null
  status: string
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "-"
  const d = new Date(isoString)
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

const columnHelper = createColumnHelper<AttendanceData>()

const columns = [
  columnHelper.accessor("employee", {
    header: "Karyawan",
    cell: (info) => <span className="font-medium">{info.getValue().name}</span>,
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("checkIn", {
    header: "Check In",
    cell: (info) => formatTime(info.getValue()),
  }),
  columnHelper.accessor("checkOut", {
    header: "Check Out",
    cell: (info) => formatTime(info.getValue()),
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
        viewHref={`/hrm/attendance/${info.row.original.id}`}
      />
    ),
  }),
]

interface AttendanceTableProps {
  data: AttendanceData[]
}

export function AttendanceTable({ data }: AttendanceTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar absensi"
      pageSize={20}
      selectable={false}
    />
  )
}
