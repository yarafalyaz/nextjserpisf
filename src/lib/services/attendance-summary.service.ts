import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { parseWorkDays } from "@/lib/utils/work-days"

export interface AttendanceSummary {
  totalWorkingDays: number
  workingDays: number
  presentDays: number
  leaveDays: number
  holidayDays: number
  absentDays: number
  dailyRate: number
  absentDeduction: number
}


/**
 * Kunci hari (date-only lokal) pertama & terakhir masa kerja dalam periode,
 * atau null bila karyawan tidak bekerja sama sekali pada periode itu.
 * Hari sebelum joinDate / sesudah employmentEndedAt (hari terakhir
 * bekerja, inklusif) BUKAN hari kerja karyawan: menghitungnya sebagai
 * absent memotong gaji dua kali — gaji pokok sudah diprorate ke masa
 * kerja oleh payroll-prorate.service.
 */
export function employmentDayWindow(
  joinDate: Date | null | undefined,
  employmentEndedAt: Date | null | undefined,
): { firstKey: string | null; lastKey: string | null } {
  return {
    firstKey: joinDate ? toLocalDateOnly(joinDate) : null,
    lastKey: employmentEndedAt ? toLocalDateOnly(employmentEndedAt) : null,
  }
}

/** True bila kunci hari berada di dalam jendela masa kerja. */
export function isEmploymentDay(
  dayKey: string,
  window: { firstKey: string | null; lastKey: string | null },
): boolean {
  if (window.firstKey && dayKey < window.firstKey) return false
  if (window.lastKey && dayKey > window.lastKey) return false
  return true
}

export async function calculateAttendanceSummary(
  employeeId: number,
  startDate: Date,
  endDate: Date,
): Promise<AttendanceSummary> {
  const empty: AttendanceSummary = {
    totalWorkingDays: 0,
    workingDays: 0,
    presentDays: 0,
    leaveDays: 0,
    holidayDays: 0,
    absentDays: 0,
    dailyRate: 0,
    absentDeduction: 0,
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true, baseSalary: true, joinDate: true, employmentEndedAt: true },
  })
  if (!employee) return empty
  const employmentWindow = employmentDayWindow(employee.joinDate, employee.employmentEndedAt)

  const candidates = await prisma.workSchedule.findMany({
    where: {
      isActive: true,
      OR: [
        { employees: { some: { id: employee.id } } },
        ...(employee.departmentId != null
          ? [{ departments: { some: { id: employee.departmentId } } }]
          : []),
        { employees: { none: {} }, departments: { none: {} } },
      ],
    },
    select: {
      workDays: true,
      _count: { select: { employees: true, departments: true } },
      employees: { where: { id: employee.id }, select: { id: true } },
      departments:
        employee.departmentId != null
          ? { where: { id: employee.departmentId }, select: { id: true } }
          : { select: { id: true } },
    },
  })

  const schedule =
    candidates.find((candidate) => candidate.employees.length > 0) ??
    (employee.departmentId != null
      ? candidates.find(
          (candidate) =>
            candidate._count.employees === 0 && candidate.departments.length > 0,
        )
      : undefined) ??
    candidates.find(
      (candidate) =>
        candidate._count.employees === 0 && candidate._count.departments === 0,
    )

  // Putaran 116: penguraian lewat util bersama (satu jalur untuk semua pembaca
  // `workDays`); util itu memuat aturan "token kosong dibuang sebelum Number()"
  // dan fallback Senin–Jumat.
  const weekdays = new Set(parseWorkDays(schedule?.workDays))

  const rangeStart = new Date(startDate)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(endDate)
  rangeEnd.setHours(23, 59, 59, 999)
  const evalEnd = new Date(Math.min(rangeEnd.getTime(), new Date().setHours(23, 59, 59, 999)))

  const [holidays, departmentHolidays, attendances, leaves] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
    employee.departmentId
      ? prisma.departmentHoliday.findMany({
          where: {
            departmentId: employee.departmentId,
            date: { gte: rangeStart, lte: rangeEnd },
          },
          select: { date: true },
        })
      : Promise.resolve([] as { date: Date }[]),
    prisma.attendance.findMany({
      where: {
        employeeId,
        date: { gte: rangeStart, lte: rangeEnd },
        checkIn: { not: null },
      },
      select: { date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: "approved",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: { startDate: true, endDate: true },
    }),
  ])

  const holidaySet = new Set(
    [...holidays, ...departmentHolidays].map((holiday) => toLocalDateOnly(holiday.date)),
  )
  const presentSet = new Set(attendances.map((attendance) => toLocalDateOnly(attendance.date)))
  const leaveSet = new Set<string>()
  for (const leave of leaves) {
    const from = new Date(Math.max(new Date(leave.startDate).setHours(0, 0, 0, 0), rangeStart.getTime()))
    const to = new Date(Math.min(new Date(leave.endDate).setHours(0, 0, 0, 0), rangeEnd.getTime()))
    for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      leaveSet.add(toLocalDateOnly(day))
    }
  }

  let totalWorkingDays = 0
  let workingDays = 0
  let presentDays = 0
  let leaveDays = 0
  let holidayDays = 0
  let absentDays = 0
  for (const day = new Date(rangeStart); day <= rangeEnd; day.setDate(day.getDate() + 1)) {
    if (!weekdays.has(day.getDay())) continue
    const key = toLocalDateOnly(day)
    // Di luar masa kerja: bukan absent, bukan hari kerja — lewati total.
    if (!isEmploymentDay(key, employmentWindow)) continue
    if (holidaySet.has(key)) {
      if (day <= evalEnd) holidayDays++
      continue
    }
    totalWorkingDays++
    if (day > evalEnd) continue
    workingDays++
    if (presentSet.has(key)) presentDays++
    else if (leaveSet.has(key)) leaveDays++
    else absentDays++
  }

  const dailyRate = totalWorkingDays > 0 ? Number(employee.baseSalary || 0) / totalWorkingDays : 0
  return {
    totalWorkingDays,
    workingDays,
    presentDays,
    leaveDays,
    holidayDays,
    absentDays,
    dailyRate,
    absentDeduction: Math.round(absentDays * dailyRate),
  }
}
