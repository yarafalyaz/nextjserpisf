"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/shadcn/badge"
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
  lateMinutes?: number | null
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
    header: "Masuk",
    cell: (info) => formatTime(info.getValue()),
  }),
  columnHelper.accessor("checkOut", {
    header: "Pulang",
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
      if (!hasCheckInGps && !hasCheckOutGps) return <span className="text-muted-foreground">-</span>
      return (
        <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          <span className="inline-flex items-center gap-1"><MapPin size={12} />{hasCheckInGps && hasCheckOutGps ? "Masuk/Pulang" : hasCheckInGps ? "Masuk" : "Pulang"}</span>
        </Badge>
      )
    },
  }),
  columnHelper.display({
    id: "overtime",
    header: "Lembur",
    cell: (info) => {
      const row = info.row.original
      if (!row.overtimeMinutes || row.overtimeMinutes <= 0) return <span className="text-muted-foreground">-</span>
      const jam = Math.floor(row.overtimeMinutes / 60)
      const menit = row.overtimeMinutes % 60
      const label = jam > 0 ? (menit > 0 ? `${jam} jam ${menit} menit` : `${jam} jam`) : `${menit} menit`
      return (
        <Badge
          variant="outline"
          className={
            row.overtimeApproved
              ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
          }
        >
          <span className="inline-flex items-center gap-1"><Clock size={12} />{label}</span>
        </Badge>
      )
    },
  }),
  columnHelper.display({
    id: "late",
    header: "Terlambat",
    cell: (info) => {
      const lateMinutes = info.row.original.lateMinutes ?? 0
      if (lateMinutes <= 0) return <span className="text-muted-foreground">-</span>
      return <span className="text-warning font-medium">{lateMinutes} mnt</span>
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/absensi/${info.row.original.id}`}
        editPermission="edit_attendance"
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
      searchColumn="employee"
      searchPlaceholder="Cari nama karyawan..."
    />
  )
}
