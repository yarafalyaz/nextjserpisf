"use client"

import {
  ATTENDANCE_RECAP_NO_DEPARTMENT_LABEL,
  ATTENDANCE_RECAP_NO_SCHEDULE_LABEL,
  type AttendanceRecap,
} from "@/lib/reports/attendance-recap"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"

/** Hari null dari payload = tidak diturunkan server (tanpa jadwal), bukan 0. */
function days(value: number | null): string {
  return value === null ? "-" : String(value)
}

type AttendanceRecapTableRow = AttendanceRecap["employees"][number] & { id: number }

const columnHelper = createColumnHelper<AttendanceRecapTableRow>()

const columns = [
  columnHelper.accessor("employeeName", {
    header: "Karyawan",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const employee = info.row.original
      return (
        <span>
          {employee.employeeName ?? `Karyawan #${employee.employeeId}`}
          {employee.hasSchedule ? null : (
            <span className="text-muted-foreground"> ({ATTENDANCE_RECAP_NO_SCHEDULE_LABEL})</span>
          )}
        </span>
      )
    },
  }),
  columnHelper.accessor("departmentName", {
    header: "Departemen",
    cell: (info) => info.getValue() ?? ATTENDANCE_RECAP_NO_DEPARTMENT_LABEL,
  }),
  columnHelper.accessor("scheduledWorkDays", {
    header: "Hari kerja terjadwal",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{days(info.getValue())}</span>,
  }),
  columnHelper.accessor("scheduledEvaluatedDays", {
    header: "Hari terevaluasi",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{days(info.getValue())}</span>,
  }),
  columnHelper.accessor("presentDays", {
    header: "Hadir",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("sickDays", {
    header: "Sakit",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("leaveDays", {
    header: "Cuti/Izin",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("absentDays", {
    header: "Alpa tercatat",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("halfDayDays", {
    header: "Setengah hari",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("otherStatusDays", {
    header: "Status lain",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("noRecordDays", {
    header: "Tanpa rekod",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{days(info.getValue())}</span>,
  }),
  columnHelper.accessor("lateEventCount", {
    header: "Kali telat",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("totalLateMinutes", {
    header: "Menit telat",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("totalOvertimeMinutes", {
    header: "Menit lembur tercatat",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
]

/**
 * Rekap kehadiran per karyawan per periode (F-2026-10-25-044-S).
 *
 * Murni presentasi payload `loadAttendanceRecap` server: notice, ember
 * hari per karyawan, dan total ditempel verbatim — UI tidak
 * mengklasifikasi status, tidak menjumlah, dan tidak menampilkan
 * nominal uang apa pun (BR-ATT-05: rekap bukan dasar potongan).
 * Karyawan tanpa jadwal (`hasSchedule=false`) tampil berlabel server
 * "Tanpa jadwal" dengan hari terjadwal "—" (BR-ATT-04), bukan 0.
 */
export function AttendanceRecapTable({ recap }: Readonly<{ recap: AttendanceRecap }>) {
  const { totals } = recap
  const isEmpty = recap.employees.length === 0

  return (
    <section aria-label="Rekap kehadiran per karyawan" className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{recap.notice}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Ringkasan rekap kehadiran">
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Karyawan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.employeeCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hari hadir</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.presentDays}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Alpa tercatat</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.absentDays}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tanpa rekod</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.noRecordDays}</p>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState title="Tidak ada karyawan dalam cakupan pada periode dan filter ini." className="py-10" />
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Per karyawan</h2>
          <DataTable
            data={recap.employees.map((employee) => ({
              ...employee,
              id: employee.employeeId,
            }))}
            columns={columns}
            ariaLabel="Rekap kehadiran per karyawan"
            selectable={false}
            enableColumnToggle={false}
            enableExport={false}
            pageSize={50}
          />
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default bg-muted/30 px-4 py-3 text-xs">
            <span className="font-bold text-foreground uppercase tracking-wider">Total</span>
            <div className="flex flex-wrap items-center gap-4">
              <span>Terjadwal: <strong className="font-mono tabular-nums">{totals.scheduledWorkDays}</strong></span>
              <span>Terevaluasi: <strong className="font-mono tabular-nums">{totals.scheduledEvaluatedDays}</strong></span>
              <span>Hadir: <strong className="font-mono tabular-nums">{totals.presentDays}</strong></span>
              <span>Sakit: <strong className="font-mono tabular-nums">{totals.sickDays}</strong></span>
              <span>Cuti/Izin: <strong className="font-mono tabular-nums">{totals.leaveDays}</strong></span>
              <span>Alpa: <strong className="font-mono tabular-nums">{totals.absentDays}</strong></span>
              <span>Setengah hari: <strong className="font-mono tabular-nums">{totals.halfDayDays}</strong></span>
              <span>Lain: <strong className="font-mono tabular-nums">{totals.otherStatusDays}</strong></span>
              <span>Tanpa rekod: <strong className="font-mono tabular-nums">{totals.noRecordDays}</strong></span>
              <span>Kali telat: <strong className="font-mono tabular-nums">{totals.lateEventCount}</strong></span>
              <span>Menit telat: <strong className="font-mono tabular-nums">{totals.totalLateMinutes}</strong></span>
              <span>Menit lembur: <strong className="font-mono tabular-nums">{totals.totalOvertimeMinutes}</strong></span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
