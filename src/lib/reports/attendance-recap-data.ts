/**
 * Loader read-only rekap kehadiran per karyawan per periode
 * (F-2026-10-25-044-S, AC-ATT-B2/B3/B4; vonis F-2026-10-25-045-V).
 *
 * Izin ditegakkan pemanggil (`requirePermission("view_attendance")`,
 * reuse Q-ATT-3); loader menerima `HrScope` yang sudah diputus server
 * dari `getHrScope` fail-closed dan menerapkannya ke SEMUA query
 * terikat karyawan (Employee, Attendance, LeaveRequest). Filter
 * departemen hanya MENYEMPITKAN scope, tidak pernah memperluas
 * (BR-ATT-06, pola overtime-recap-data).
 *
 * Populasi = karyawan dalam scope (termasuk nonaktif/berhenti tengah
 * periode, EC-6; departemen null = "Tanpa departemen", EC-7) digabung
 * karyawan yang punya baris Attendance/LeaveRequest dalam periode —
 * karyawan tanpa data tampil kosong jujur (ember rekod 0), bukan
 * hilang dan bukan angka karangan.
 *
 * Definisi hari kerja diturunkan di sini mengikuti precedence existing
 * `attendance-summary.service.ts` persis (jadwal karyawan > departemen >
 * global; Holiday + DepartmentHoliday departemen karyawan) TANPA
 * memanggil/mengubah service payroll itu (beku, vonis Putusan 1/3,
 * AC-ATT-V5). Beda satu-satunya yang disengaja spec BR-ATT-04: karyawan
 * tanpa jadwal terikat ditandai `hasSchedule=false` dan fallback
 * Senin–Jumat generik TIDAK diterapkan diam-diam ke orangnya (service
 * payroll tetap menerapkan fallback untuk angka slipnya sendiri).
 * Jadwal dengan workDays kosong/rusak diperlakukan sama seperti service:
 * fallback Senin–Jumat, dan tetap dianggap terjadwal (paritas service).
 *
 * Select TIDAK memuat baseSalary/komponen gaji apa pun (BR-ATT-05/06,
 * vonis Putusan 2). Periode memakai kolom `date` (BR-ATT-07).
 * Baca-saja murni: nol tulis (BR-ATT-10).
 */

import { prisma } from "@/lib/db/prisma"
import { hrEmployeeScopeWhere, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import {
  buildAttendanceRecap,
  type AttendanceRecap,
  type AttendanceRecapEmployeeInput,
} from "@/lib/reports/attendance-recap"

export interface AttendanceRecapFilters {
  /** Awal periode (inklusif) menurut kolom `date` Attendance. */
  periodStart: Date
  /** Akhir periode (inklusif) menurut kolom `date` Attendance. */
  periodEnd: Date
  departmentId?: number | null
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(end)
  last.setHours(0, 0, 0, 0)
  while (cursor <= last) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

interface ScheduleCandidate {
  workDays: string
  employeeIds: number[]
  departmentIds: number[]
}

/** Precedence existing: karyawan > departemen > global (service :60-71). */
function pickSchedule(
  candidates: readonly ScheduleCandidate[],
  employeeId: number,
  departmentId: number | null,
): ScheduleCandidate | null {
  return (
    candidates.find((c) => c.employeeIds.includes(employeeId)) ??
    (departmentId != null
      ? candidates.find(
          (c) => c.employeeIds.length === 0 && c.departmentIds.includes(departmentId),
        )
      : undefined) ??
    candidates.find((c) => c.employeeIds.length === 0 && c.departmentIds.length === 0) ??
    null
  )
}

function parseWeekdays(workDays: string): Set<number> {
  const cached = weekdayCache.get(workDays)
  if (cached) return cached
  const weekdays = new Set(
    workDays
      .split(",")
      .map((day) => Number(day.trim()))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )
  // Paritas service: workDays kosong -> fallback Senin-Jumat.
  const parsed = weekdays.size === 0 ? new Set([1, 2, 3, 4, 5]) : weekdays
  weekdayCache.set(workDays, parsed)
  return parsed
}
const weekdayCache = new Map<string, Set<number>>()

export async function loadAttendanceRecap(
  scope: HrScope,
  filters: AttendanceRecapFilters,
  today: Date = new Date(),
): Promise<AttendanceRecap> {
  const rangeStart = new Date(filters.periodStart)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(filters.periodEnd)
  rangeEnd.setHours(23, 59, 59, 999)
  const period = { gte: rangeStart, lte: rangeEnd }

  const employeeWhere: Record<string, unknown> = {
    ...hrEmployeeScopeWhere(scope),
  }
  if (filters.departmentId != null) {
    if (scope.kind === "all") {
      employeeWhere.departmentId = filters.departmentId
    } else {
      // Irisan AND: departemen asing bertemu scope = nol baris.
      employeeWhere.AND = [{ departmentId: filters.departmentId }]
    }
  }

  const attendanceWhere: Record<string, unknown> = {
    ...hrScopeWhere(scope),
    date: period,
  }
  const leaveWhere: Record<string, unknown> = {
    ...hrScopeWhere(scope),
    status: "approved",
    startDate: { lte: rangeEnd },
    endDate: { gte: rangeStart },
  }
  if (filters.departmentId != null && scope.kind !== "all") {
    attendanceWhere.AND = [{ employee: { departmentId: filters.departmentId } }]
    leaveWhere.AND = [{ employee: { departmentId: filters.departmentId } }]
  } else if (filters.departmentId != null) {
    attendanceWhere.employee = { departmentId: filters.departmentId }
    leaveWhere.employee = { departmentId: filters.departmentId }
  }

  const [employees, attendances, leaves, schedules, holidays, departmentHolidays] =
    await Promise.all([
      prisma.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          name: true,
          departmentId: true,
          department: { select: { name: true } },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prisma.attendance.findMany({
        where: attendanceWhere,
        select: {
          employeeId: true,
          date: true,
          checkIn: true,
          status: true,
          lateMinutes: true,
          overtimeMinutes: true,
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      }),
      prisma.leaveRequest.findMany({
        where: leaveWhere,
        select: { employeeId: true, startDate: true, endDate: true },
      }),
      prisma.workSchedule.findMany({
        where: { isActive: true },
        select: {
          workDays: true,
          employees: { select: { id: true } },
          departments: { select: { id: true } },
        },
      }),
      prisma.holiday.findMany({
        where: { date: period },
        select: { date: true },
      }),
      prisma.departmentHoliday.findMany({
        where: { date: period },
        select: { departmentId: true, date: true },
      }),
    ])

  const candidates: ScheduleCandidate[] = schedules.map((s) => ({
    workDays: s.workDays,
    employeeIds: s.employees.map((e) => e.id),
    departmentIds: s.departments.map((d) => d.id),
  }))

  const globalHolidayKeys = new Set(holidays.map((h) => toLocalDateOnly(h.date)))
  const deptHolidayKeys = new Map<number, Set<string>>()
  for (const h of departmentHolidays) {
    const set = deptHolidayKeys.get(h.departmentId) ?? new Set<string>()
    set.add(toLocalDateOnly(h.date))
    deptHolidayKeys.set(h.departmentId, set)
  }

  const recordsByEmployee = new Map<
    number,
    { date: Date; status: string; hasCheckIn: boolean; lateMinutes: number; overtimeMinutes: number | null }[]
  >()
  for (const row of attendances) {
    const list = recordsByEmployee.get(row.employeeId) ?? []
    list.push({
      date: row.date,
      status: row.status,
      hasCheckIn: row.checkIn != null,
      lateMinutes: row.lateMinutes,
      overtimeMinutes: row.overtimeMinutes,
    })
    recordsByEmployee.set(row.employeeId, list)
  }
  // Karyawan berbaris dalam periode tetapi di luar daftar Employee scope
  // (tidak terjadi bila scope konsisten) tidak diciptakan dari udara:
  // populasi rekap = daftar Employee dalam scope di atas.

  const leaveDaysByEmployee = new Map<number, Date[]>()
  for (const leave of leaves) {
    const from = new Date(
      Math.max(new Date(leave.startDate).setHours(0, 0, 0, 0), rangeStart.getTime()),
    )
    const to = new Date(
      Math.min(new Date(leave.endDate).setHours(0, 0, 0, 0), rangeEnd.getTime()),
    )
    const list = leaveDaysByEmployee.get(leave.employeeId) ?? []
    for (const day of eachDay(from, to)) list.push(day)
    leaveDaysByEmployee.set(leave.employeeId, list)
  }

  const periodDays = eachDay(rangeStart, rangeEnd)

  const inputs: AttendanceRecapEmployeeInput[] = employees.map((employee) => {
    const schedule = pickSchedule(candidates, employee.id, employee.departmentId)
    const holidayKeys = new Set(globalHolidayKeys)
    if (employee.departmentId != null) {
      for (const key of deptHolidayKeys.get(employee.departmentId) ?? []) {
        holidayKeys.add(key)
      }
    }
    const scheduledDays = schedule
      ? periodDays.filter((day) => parseWeekdays(schedule.workDays).has(day.getDay()))
      : []
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name ?? null,
      hasSchedule: schedule != null,
      scheduledDays,
      holidayDays: periodDays.filter((day) => holidayKeys.has(toLocalDateOnly(day))),
      records: recordsByEmployee.get(employee.id) ?? [],
      approvedLeaveDays: leaveDaysByEmployee.get(employee.id) ?? [],
    }
  })

  return buildAttendanceRecap(inputs, today)
}
