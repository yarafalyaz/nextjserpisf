"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { Chip } from "@heroui/react"
import { MapPin, Clock } from "lucide-react"

interface AttendanceData {
  id: number
  employee: { name: string }
  date: string
  checkIn: string | null
  checkOut: string | null
  status: string
  checkInLatitude: number | null
  checkInLongitude: number | null
  checkOutLatitude: number | null
  checkOutLongitude: number | null
  overtimeMinutes: number | null
  overtimeApproved: boolean
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
    id: "gps",
    header: "GPS",
    cell: (info) => {
      const row = info.row.original
      const hasCheckInGps = row.checkInLatitude !== null && row.checkInLongitude !== null
      const hasCheckOutGps = row.checkOutLatitude !== null && row.checkOutLongitude !== null
      if (!hasCheckInGps && !hasCheckOutGps) return <span className="text-muted">-</span>
      return (
        <Chip size="sm" variant="soft" color="success">
          <span className="inline-flex items-center gap-1"><MapPin size={12} />{hasCheckInGps && hasCheckOutGps ? "In/Out" : hasCheckInGps ? "In" : "Out"}</span>
        </Chip>
      )
    },
  }),
  columnHelper.display({
    id: "overtime",
    header: "Lembur",
    cell: (info) => {
      const row = info.row.original
      if (!row.overtimeMinutes || row.overtimeMinutes <= 0) return <span className="text-muted">-</span>
      const jam = Math.floor(row.overtimeMinutes / 60)
      const menit = row.overtimeMinutes % 60
      const label = jam > 0 ? (menit > 0 ? `${jam} jam ${menit} menit` : `${jam} jam`) : `${menit} menit`
      return (
        <Chip size="sm" variant="soft" color={row.overtimeApproved ? "success" : "warning"}>
          <span className="inline-flex items-center gap-1"><Clock size={12} />{label}</span>
        </Chip>
      )
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
