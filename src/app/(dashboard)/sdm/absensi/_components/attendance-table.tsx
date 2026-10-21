"use client"

import { createColumnHelper } from "@/lib/table"
import { useMemo } from "react"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteAttendance } from "@/actions/hrm.actions"
import {
  ATTENDANCE_STATUS_TONES,
  attendanceStatusLabel,
} from "./attendance-labels"

/**
 * Baris absensi sudah dinormalkan di halaman (label tanggal & jam WIB, angka
 * keterlambatan) supaya komponen klien tidak perlu tahu konvensi waktu absensi —
 * `attendance.date` adalah tengah malam UTC hari WIB, sedangkan `checkIn`/`checkOut`
 * adalah instan UTC dari jam dinding WIB.
 */
export interface AttendanceRow {
  id: number
  employeeName: string
  employeeNo: string
  dateLabel: string
  checkInLabel: string
  checkOutLabel: string
  lateMinutes: number
  status: string
  notes: string | null
}

const columnHelper = createColumnHelper<AttendanceRow>()

const columns = [
  columnHelper.accessor((row) => row.employeeName, {
    id: "employeeName",
    header: "Karyawan",
    cell: (info) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{info.getValue()}</span>
        <span className="text-xs text-muted-foreground">{info.row.original.employeeNo}</span>
      </div>
    ),
  }),
  columnHelper.accessor("dateLabel", {
    id: "dateLabel",
    header: "Tanggal",
  }),
  columnHelper.accessor("checkInLabel", {
    id: "checkInLabel",
    header: "Jam Masuk",
  }),
  columnHelper.accessor("checkOutLabel", {
    id: "checkOutLabel",
    header: "Jam Keluar",
  }),
  columnHelper.accessor("lateMinutes", {
    id: "lateMinutes",
    header: "Terlambat",
    cell: (info) => {
      const minutes = Number(info.getValue())
      return minutes > 0 ? `${minutes} menit` : "-"
    },
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    cell: (info) => {
      const status = info.getValue()
      return (
        <StatusChip
          status={status}
          customLabel={attendanceStatusLabel(status)}
          customTone={ATTENDANCE_STATUS_TONES[status]}
        />
      )
    },
  }),
  columnHelper.accessor("notes", {
    id: "notes",
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/sdm/absensi/${info.row.original.id}/ubah`}
        editPermission="edit_attendance"
        deleteAction={deleteAttendance}
        deleteId={info.row.original.id}
        deletePermission="manage_attendance"
      />
    ),
  }),
]

interface AttendanceTableProps {
  data: AttendanceRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
  showActions?: boolean
}

export function AttendanceTable({
  data,
  total,
  page,
  pageSize,
  toolbar,
  filters,
  showActions = true,
}: AttendanceTableProps) {
  const visibleColumns = useMemo(() => {
    if (showActions) return columns
    // `id` hanya ada pada objek kolom yang mendeklarasikannya (termasuk kolom aksi).
    return columns.filter((column) => (column as { id?: string }).id !== "actions")
  }, [showActions])

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Daftar absensi"
      serverPagination={{ total, page, pageSize }}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
