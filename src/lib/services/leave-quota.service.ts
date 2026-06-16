import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"

type Db = Prisma.TransactionClient | typeof prisma

/** Jatah cuti tahunan (hari kerja) per tahun kalender. */
export const ANNUAL_LEAVE_QUOTA = 12

/**
 * Tipe cuti yang MEMOTONG jatah tahunan. Hanya "annual" (Cuti Tahunan).
 * Sakit / melahirkan / keperluan pribadi / tanpa gaji tidak memotong jatah,
 * sesuai praktik umum ketenagakerjaan Indonesia. Daftar tipe didefinisikan di
 * leave-form.tsx (annual|sick|personal|maternity|unpaid).
 */
export const QUOTA_LEAVE_TYPES = new Set(["annual"])

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Build a per-day "is this a working day?" predicate for an employee over a
 * date range, applying the same WorkSchedule precedence (employee > department
 * > global) and holiday exclusion (national Holiday + department holiday) used
 * by calculateAttendanceSummary. Fetches the schedule + holidays ONCE so the
 * returned closure can be reused across many leave ranges without re-querying.
 *
 * Fallback: if no WorkSchedule is configured at all, default to Mon–Fri (1–5).
 * Returning "no working days" instead would make every leave count as 0 days
 * and silently grant unlimited annual leave — the opposite of the intent.
 */
async function buildWorkingDayChecker(
  db: Db,
  employeeId: number,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{
  isWorkingDay: (d: Date) => boolean
  usedScheduleFallback: boolean
}> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true },
  })

  const start = new Date(rangeStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(rangeEnd)
  end.setHours(23, 59, 59, 999)

  // Resolve the applicable WorkSchedule (mirrors attendance-summary.service).
  const candidates = employee
    ? await db.workSchedule.findMany({
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
    : []

  const employeeSchedule = candidates.find((s) => s.employees.length > 0)
  const deptSchedule =
    employee?.departmentId != null
      ? candidates.find(
          (s) => s._count.employees === 0 && s.departments.length > 0,
        )
      : undefined
  const globalSchedule = candidates.find(
    (s) => s._count.employees === 0 && s._count.departments === 0,
  )
  const relevantSchedule = employeeSchedule ?? deptSchedule ?? globalSchedule

  let workingWeekdays = new Set(
    (relevantSchedule?.workDays || "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "")
      .map((d) => Number(d))
      .filter((n) => !Number.isNaN(n)),
  )
  let usedScheduleFallback = false
  if (workingWeekdays.size === 0) {
    // No schedule configured → assume a Mon–Fri work week so leave still draws
    // down quota. (Sun=0 ... Sat=6.)
    workingWeekdays = new Set([1, 2, 3, 4, 5])
    usedScheduleFallback = true
  }

  const [holidays, deptHolidays] = await Promise.all([
    db.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true },
    }),
    employee?.departmentId
      ? db.departmentHoliday.findMany({
          where: {
            departmentId: employee.departmentId,
            date: { gte: start, lte: end },
          },
          select: { date: true },
        })
      : Promise.resolve([] as { date: Date }[]),
  ])

  const holidaySet = new Set(
    [...holidays, ...deptHolidays].map((h) => dateKey(new Date(h.date))),
  )

  const isWorkingDay = (d: Date): boolean => {
    if (!workingWeekdays.has(d.getDay())) return false
    if (holidaySet.has(dateKey(d))) return false
    return true
  }

  return { isWorkingDay, usedScheduleFallback }
}

/**
 * Count the number of WORKING days within [startDate, endDate] (inclusive) for
 * an employee — weekend / non-scheduled weekdays and national/department
 * holidays are excluded. This is the unit used to draw down the annual quota.
 */
export async function countLeaveWorkingDays(
  employeeId: number,
  startDate: Date,
  endDate: Date,
  db: Db = prisma,
): Promise<number> {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  if (end < start) return 0

  const { isWorkingDay } = await buildWorkingDayChecker(
    db,
    employeeId,
    start,
    end,
  )

  let count = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(d)) count++
  }
  return count
}

export interface LeaveQuota {
  /** Calendar year this quota covers. */
  year: number
  /** 12 if the employee is eligible (tenure ≥ 1 year), else 0. */
  entitled: number
  /** Working days of annual leave already approved/pending this year. */
  used: number
  /** entitled - used, floored at 0. */
  remaining: number
  /** Tenure ≥ 1 year from joinDate (paid annual leave gate). */
  eligible: boolean
  /** Whole months of tenure as of the evaluation date. */
  tenureMonths: number
}

/**
 * Compute an employee's annual-leave quota state for a calendar year.
 *
 * Rules (confirmed with the product owner):
 * - 12 working days / calendar year (Jan–Dec), unused balance EXPIRES at
 *   year end (no carry-over).
 * - Only employees with tenure ≥ 1 year (from joinDate) are entitled; below
 *   that, entitled = 0 (paid annual leave is refused).
 * - "used" = working days of `annual` leave requests in [approved, pending]
 *   that fall within the year. pending counts so two in-flight requests can't
 *   both pass the check.
 *
 * Pass `excludeLeaveId` when editing an existing request so it isn't counted
 * against itself.
 */
export async function getLeaveQuota(
  employeeId: number,
  opts: { year?: number; now?: Date; excludeLeaveId?: number; db?: Db } = {},
): Promise<LeaveQuota> {
  const db = opts.db ?? prisma
  const now = opts.now ?? new Date()
  const year = opts.year ?? now.getFullYear()

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { joinDate: true },
  })

  // Tenure: eligible iff joined on or before one year ago.
  let eligible = false
  let tenureMonths = 0
  if (employee?.joinDate) {
    const join = new Date(employee.joinDate)
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(now.getFullYear() - 1)
    eligible = join.getTime() <= oneYearAgo.getTime()
    tenureMonths = Math.max(
      0,
      (now.getFullYear() - join.getFullYear()) * 12 +
        (now.getMonth() - join.getMonth()) -
        (now.getDate() < join.getDate() ? 1 : 0),
    )
  }

  const entitled = eligible ? ANNUAL_LEAVE_QUOTA : 0

  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

  // Annual leaves (approved or pending) overlapping this calendar year.
  const leaves = await db.leaveRequest.findMany({
    where: {
      employeeId,
      type: { in: Array.from(QUOTA_LEAVE_TYPES) },
      status: { in: ["approved", "pending"] },
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
      ...(opts.excludeLeaveId ? { id: { not: opts.excludeLeaveId } } : {}),
    },
    select: { startDate: true, endDate: true },
  })

  let used = 0
  if (leaves.length > 0) {
    const { isWorkingDay } = await buildWorkingDayChecker(
      db,
      employeeId,
      yearStart,
      yearEnd,
    )
    for (const lv of leaves) {
      // Clip each leave to the year boundary, then count working days.
      const s = new Date(lv.startDate)
      s.setHours(0, 0, 0, 0)
      const e = new Date(lv.endDate)
      e.setHours(0, 0, 0, 0)
      const from = s < yearStart ? new Date(yearStart) : s
      const to = e > yearEnd ? new Date(yearEnd) : e
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (isWorkingDay(d)) used++
      }
    }
  }

  return {
    year,
    entitled,
    used,
    remaining: Math.max(0, entitled - used),
    eligible,
    tenureMonths,
  }
}
