import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"

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
    select: { id: true, departmentId: true, baseSalary: true },
  })
  if (!employee) return empty

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

  let weekdays = new Set(
    (schedule?.workDays ?? "")
      .split(",")
      .map((day) => Number(day.trim()))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )
  if (weekdays.size === 0) weekdays = new Set([1, 2, 3, 4, 5])

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
