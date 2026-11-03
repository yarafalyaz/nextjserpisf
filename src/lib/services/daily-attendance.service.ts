import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { parseWorkDays } from "@/lib/utils/work-days"
import { employmentDayWindow, isEmploymentDay } from "@/lib/services/attendance-summary.service"


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
        joinDate: true,
        employmentEndedAt: true,
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
  const dayKey = toLocalDateOnly(start)
  const absentEmployees = nationalHoliday ? [] : employees.filter((employee) => {
    // Putaran 86: hari di luar jendela masa kerja (sebelum joinDate /
    // sesudah employmentEndedAt) bukan absent — pola employmentDayWindow
    // yang sama dengan payroll; berhenti tak menonaktifkan otomatis,
    // sehingga karyawan berakhir dulu masuk daftar + notifikasi palsu.
    if (!isEmploymentDay(dayKey, employmentDayWindow(employee.joinDate, employee.employmentEndedAt))) return false
    if (attendedIds.has(employee.id) || leaveIds.has(employee.id)) return false
    if (employee.departmentId != null && holidayDepartments.has(employee.departmentId)) return false
    const schedule = employee.workSchedules[0]
      ?? employee.department?.workSchedules[0]
      ?? schedules[0]
    // Putaran 116: lewat util bersama. Versi lama `Number(value.trim())` tanpa
    // membuang token kosong: `Number("") === 0` = Minggu, jadi jadwal kosong
    // membuat karyawan hanya dinilai absen pada hari Minggu.
    const weekdays = parseWorkDays(schedule?.workDays)
    return weekdays.includes(start.getDay())
  })

  return { lateAttendanceCount, absentEmployees }
}
