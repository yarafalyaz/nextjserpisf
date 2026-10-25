import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"
import { toLocalDateOnly } from "@/lib/utils/date-only"

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

  const employeeSchedule = candidates.find((schedule) => schedule.employees.length > 0)
  const departmentSchedule = employee?.departmentId != null
    ? candidates.find((schedule) => schedule._count.employees === 0 && schedule.departments.length > 0)
    : undefined
  const globalSchedule = candidates.find(
    (schedule) => schedule._count.employees === 0 && schedule._count.departments === 0,
  )
  const schedule = employeeSchedule ?? departmentSchedule ?? globalSchedule
  let weekdays = new Set(
    (schedule?.workDays ?? "")
      .split(",")
      .map((day) => day.trim())
      .filter(Boolean)
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )
  const usedScheduleFallback = weekdays.size === 0
  if (usedScheduleFallback) weekdays = new Set([1, 2, 3, 4, 5])

  const [holidays, departmentHolidays] = await Promise.all([
    db.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true },
    }),
    employee?.departmentId
      ? db.departmentHoliday.findMany({
          where: { departmentId: employee.departmentId, date: { gte: start, lte: end } },
          select: { date: true },
        })
      : Promise.resolve([] as { date: Date }[]),
  ])
  const holidaySet = new Set(
    [...holidays, ...departmentHolidays].map((holiday) => toLocalDateOnly(holiday.date)),
  )
  return {
    isWorkingDay: (date) => weekdays.has(date.getDay()) && !holidaySet.has(toLocalDateOnly(date)),
    usedScheduleFallback,
  }
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

/**
 * Profil hari untuk tarif lembur: apakah tanggal ini hari kerja menurut
 * jadwal karyawan (preseden yang sama dengan penghitung cuti), dan
 * berapa hari kerja dalam seminggu polanya (5 atau 6 menentukan tabel
 * tarif hari istirahat). Minggu dihitung Senin–Minggu.
 */
export async function resolveDayKind(
  employeeId: number,
  date: Date,
  db: Db = prisma,
): Promise<{ isWorkingDay: boolean; workdaysPerWeek: number }> {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const dow = day.getDay()
  const monday = new Date(day)
  monday.setDate(day.getDate() + (dow === 0 ? -6 : 1 - dow))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const { isWorkingDay } = await buildWorkingDayChecker(db, employeeId, monday, sunday)
  let workdaysPerWeek = 0
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(d)) workdaysPerWeek++
  }
  return { isWorkingDay: isWorkingDay(day), workdaysPerWeek }
}

/**
 * Tipe cuti khusus statutori (UU 13/2003 Pasal 81 & 93) dengan batas
 * hari KALENDER per kejadian. Tipe ini tidak memotong jatah tahunan
 * (hanya "annual" yang memotong) — batasnya per peristiwa, bukan per
 * tahun. `pilgrimage` (ibadah haji) tanpa batas tetap: durasinya
 * mengikuti perjalanan ibadah, sekali seumur hubungan kerja.
 */
export const SPECIAL_LEAVE_DAY_CAPS: Record<string, number | null> = {
  marriage: 3,
  child_marriage: 2,
  child_circumcision: 2,
  child_baptism: 2,
  spouse_childbirth: 2,
  family_death_core: 2,
  family_death_household: 1,
  menstrual: 2,
  pilgrimage: null,
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
/** Tanggal kalender (tahun/bulan/hari) sebuah instant menurut WIB. */
function wibCalendarDate(d: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: get("year"), m: get("month"), d: get("day") }
}

export async function getLeaveQuota(
  employeeId: number,
  opts: { year?: number; now?: Date; excludeLeaveId?: number; db?: Db } = {},
): Promise<LeaveQuota> {
  const db = opts.db ?? prisma
  const now = opts.now ?? new Date()
  const year = opts.year ?? now.getFullYear()
  // Tenure is judged as of the END of the reported year (or `now` when the year
  // being reported IS the current year), so a historical/other-year quota is
  // evaluated with the tenure the employee actually had then — not today's.
  // Using `now` made `?tahun=2024` grant 12 days to employees not yet 1-year
  // eligible in 2024, and deny it to those who were.
  const asOf = year < now.getFullYear() ? new Date(year, 11, 31) : now

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { joinDate: true, leaveEligibilityStartDate: true, employmentStatus: true },
  })

  // Tenure: eligible iff the eligibility anchor is on or before one year
  // before `asOf`. The anchor defaults to joinDate; for ex-interns it is
  // the contract start (internship time does not count), and while the
  // employee is still an INTERN there is no entitlement at all.
  // Perbandingan TANGGAL kalender WIB (tanpa jam): TTD kontrak 1 Jan
  // 2026 berarti berhak tepat 1 Jan 2027, bukan sehari sesudahnya —
  // komponen jam pada nilai tersimpan tidak boleh menggeser batas.
  let eligible = false
  let tenureMonths = 0
  if (employee?.joinDate) {
    const anchor = employee.leaveEligibilityStartDate
      ? new Date(employee.leaveEligibilityStartDate)
      : new Date(employee.joinDate)
    const a = wibCalendarDate(anchor)
    const b = wibCalendarDate(asOf)
    const oneYearBefore = { y: b.y - 1, m: b.m, d: b.d }
    const anchorLteOneYearBefore =
      a.y < oneYearBefore.y ||
      (a.y === oneYearBefore.y &&
        (a.m < oneYearBefore.m ||
          (a.m === oneYearBefore.m && a.d <= oneYearBefore.d)))
    eligible =
      employee.employmentStatus !== "INTERN" && anchorLteOneYearBefore
    tenureMonths = Math.max(
      0,
      (b.y - a.y) * 12 + (b.m - a.m) - (b.d < a.d ? 1 : 0),
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
