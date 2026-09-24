import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"


/** Return today's late and absent counts using each employee's effective work calendar. */
export async function getDailyAttendanceMetrics(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const [employees, schedules, holidays, departmentHolidays, attendances, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        departmentId: true,
        workSchedules: { where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true, workDays: true } },
        department: { select: { id: true, name: true, workSchedules: { where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true, workDays: true } } } },
      },
    }),
    prisma.workSchedule.findMany({
      where: { isActive: true, employees: { none: {} }, departments: { none: {} } },
      orderBy: { id: "asc" },
      select: { id: true, workDays: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true } }),
    prisma.departmentHoliday.findMany({ where: { date: { gte: start, lt: end } }, select: { departmentId: true } }),
    prisma.attendance.findMany({ where: { date: { gte: start, lt: end } }, select: { employeeId: true, status: true, lateMinutes: true } }),
    prisma.leaveRequest.findMany({
      where: { status: "approved", startDate: { lt: end }, endDate: { gte: start } },
      select: { employeeId: true },
    }),
  ])

  const lateAttendanceCount = attendances.filter((a) => a.status === "late" || a.lateMinutes > 0).length
  const attendedIds = new Set(attendances.map((a) => a.employeeId))
  const leaveIds = new Set(leaves.map((leave) => leave.employeeId))
  const nationalHoliday = new Set(holidays.map((holiday) => toLocalDateOnly(holiday.date))).has(toLocalDateOnly(start))
  const holidayDepartments = new Set(departmentHolidays.map((holiday) => holiday.departmentId))
  const absentEmployees = nationalHoliday ? [] : employees.filter((employee) => {
    if (attendedIds.has(employee.id) || leaveIds.has(employee.id)) return false
    if (employee.departmentId != null && holidayDepartments.has(employee.departmentId)) return false
    const schedule = employee.workSchedules[0]
      ?? employee.department?.workSchedules[0]
      ?? schedules[0]
    const days = schedule?.workDays.split(",").map((value) => Number(value.trim()))
    const effectiveDays = days?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    const weekdays = effectiveDays?.length ? effectiveDays : [1, 2, 3, 4, 5]
    return weekdays.includes(start.getDay())
  })

  return { lateAttendanceCount, absentEmployees }
}
