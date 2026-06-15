import { prisma } from "@/lib/db/prisma"

export interface AttendanceSummary {
  /** Total expected working days in the period (has schedule, not a holiday). */
  totalWorkingDays: number
  /** Working days that have elapsed in the period (up to today, has schedule, not a holiday). */
  workingDays: number
  presentDays: number
  leaveDays: number
  /** Holidays that fell on a scheduled working day within the period. */
  holidayDays: number
  /** Scheduled working days with no attendance and no approved leave = bolos. */
  absentDays: number
  /** baseSalary / totalWorkingDays (0 if no working days). */
  dailyRate: number
  /** absentDays * dailyRate. */
  absentDeduction: number
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Compute attendance-based payroll figures for an employee within a period.
 *
 * Rules:
 * - A "working day" is a calendar day whose weekday has an active WorkSchedule
 *   (department-specific or global) AND is NOT a public holiday or a holiday for
 *   the employee's department.
 * - Holidays that land on a working day are days off (never counted as absent).
 * - A working day with no check-in and no approved leave is "bolos" (absent).
 * - Only days up to (and including) today are evaluated, so future days in the
 *   period are never counted as absent.
 */
export async function calculateAttendanceSummary(
  employeeId: number,
  startDate: Date,
  endDate: Date
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
    select: { id: true, departmentId: true, baseSalary: true },
  })
  if (!employee) return empty

  // Which weekdays are working days? (schedule assigned to employee, dept-specific, or global)
  const allSchedules = await prisma.workSchedule.findMany({
    where: { isActive: true },
    select: { workDays: true, employees: { select: { id: true } }, departments: { select: { id: true } } },
  })
  const relevant = allSchedules.filter(
    (s) =>
      s.employees.some((e) => e.id === employee.id) ||
      (s.employees.length === 0 &&
        (s.departments.length === 0 ||
          (employee.departmentId != null && s.departments.some((d) => d.id === employee.departmentId))))
  )
  const workingWeekdays = new Set(
    relevant.flatMap((s) =>
      s.workDays
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d !== "") // drop empty tokens (empty string / trailing comma) so Number("") !== 0 (Sunday)
        .map((d) => Number(d))
        .filter((n) => !Number.isNaN(n))
    )
  )
  // No schedule configured at all → cannot determine working days; skip deduction.
  if (workingWeekdays.size === 0) return empty

  const rangeStart = new Date(startDate)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(endDate)
  rangeEnd.setHours(23, 59, 59, 999)

  // Evaluate only up to today (future working days are not "absent" yet).
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const evalEnd = rangeEnd < today ? rangeEnd : today

  const [holidays, deptHolidays, attendances, leaves] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
    employee.departmentId
      ? prisma.departmentHoliday.findMany({
          where: { departmentId: employee.departmentId, date: { gte: rangeStart, lte: rangeEnd } },
          select: { date: true },
        })
      : Promise.resolve([] as { date: Date }[]),
    prisma.attendance.findMany({
      where: { employeeId, date: { gte: rangeStart, lte: rangeEnd }, checkIn: { not: null } },
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

  const holidaySet = new Set([...holidays, ...deptHolidays].map((h) => dateKey(new Date(h.date))))
  const presentSet = new Set(attendances.map((a) => dateKey(new Date(a.date))))

  // Expand approved leave ranges into a set of date keys.
  const leaveSet = new Set<string>()
  for (const lv of leaves) {
    const s = new Date(lv.startDate)
    s.setHours(0, 0, 0, 0)
    const e = new Date(lv.endDate)
    e.setHours(0, 0, 0, 0)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      leaveSet.add(dateKey(d))
    }
  }

  let totalWorkingDays = 0
  let workingDays = 0
  let presentDays = 0
  let leaveDays = 0
  let holidayDays = 0
  let absentDays = 0

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    if (!workingWeekdays.has(d.getDay())) continue // weekend / non-working weekday
    const key = dateKey(d)
    if (holidaySet.has(key)) {
      // tanggal merah on a working day = day off, not counted as a working day.
      // Only count it in holidayDays for the elapsed portion of the period.
      if (d <= evalEnd) holidayDays++
      continue
    }

    // Total expected working days span the WHOLE period — this is the divisor
    // for a fixed monthly salary's daily rate. Using only elapsed working days
    // would inflate the daily rate when the summary is generated mid-period
    // (e.g. dividing a month's salary by the few days worked so far), grossly
    // overstating each absent day's deduction.
    totalWorkingDays++

    // Present/leave/absent are only meaningful for days that have elapsed;
    // future working days are not "absent" yet.
    if (d > evalEnd) continue
    workingDays++
    if (presentSet.has(key)) presentDays++
    else if (leaveSet.has(key)) leaveDays++
    else absentDays++ // bolos
  }

  const baseSalary = Number(employee.baseSalary || 0)
  const dailyRate = totalWorkingDays > 0 ? baseSalary / totalWorkingDays : 0
  const absentDeduction = Math.round(absentDays * dailyRate)

  return { totalWorkingDays, workingDays, presentDays, leaveDays, holidayDays, absentDays, dailyRate, absentDeduction }
}
