import { describe, it, expect, vi, beforeEach } from "vitest"
import { calculateAttendanceSummary } from "../attendance-summary.service"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    workSchedule: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
  },
}))

describe("calculateAttendanceSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date("2024-05-10T12:00:00Z"))
  })

  it("should calculate daily rate using total working days in the period, not elapsed days", async () => {
    // 2024-05 has 31 days. May 1st is Wednesday.
    // Let's say working days are Mon-Fri (1,2,3,4,5).
    // May 2024 has 23 weekdays.
    
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 1,
      departmentId: null,
      baseSalary: 23_000_000,
    } as any)

    vi.mocked(prisma.workSchedule.findMany).mockResolvedValue([
      {
        isActive: true,
        workDays: "1,2,3,4,5",
        _count: { employees: 0, departments: 0 },
        employees: [],
        departments: [],
      } as any,
    ])

    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([]) // 0 attendances -> all absent
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    // Check period: May 1 to May 31.
    // Today is May 10 (8 working days elapsed).
    const start = new Date("2024-05-01T00:00:00Z")
    const end = new Date("2024-05-31T23:59:59Z")
    
    const result = await calculateAttendanceSummary(1, start, end)
    
    // total working days = 23.
    // Base salary = 23,000,000.
    // Daily rate SHOULD be 1,000,000.
    // Absent days up to May 10 = 8.
    // Deduction SHOULD be 8 * 1,000,000 = 8,000,000.
    // IF the bug is present, daily rate = 23,000,000 / 8 = 2,875,000.
    // Deduction = 23,000,000.
    
    expect(result.dailyRate).toBe(1_000_000)
    expect(result.absentDays).toBe(8)
    expect(result.absentDeduction).toBe(8_000_000)
    // The JSDoc says workingDays counted up to today, so if that's kept:
    // workingDays up to today = 8.
    // BUT we need the period's total to calculate dailyRate correctly.
  })

  it("should not union the global schedule when a department-specific schedule exists", async () => {
    // Employee belongs to department 5.
    // Global default schedule: Mon-Sat (1,2,3,4,5,6).
    // Department 5 override schedule: Mon-Fri (1,2,3,4,5).
    // Precedence (matching resolveWorkSchedule) means the department override
    // wins outright — Saturdays are NOT working days for this department, so a
    // Saturday no-show must never be counted as absent or deducted.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 1,
      departmentId: 5,
      baseSalary: 23_000_000,
    } as any)

    vi.mocked(prisma.workSchedule.findMany).mockResolvedValue([
      // Company-wide default: Mon-Sat
      { isActive: true, workDays: "1,2,3,4,5,6", _count: { employees: 0, departments: 0 }, employees: [], departments: [] } as any,
      // Department 5 override: Mon-Fri
      { isActive: true, workDays: "1,2,3,4,5", _count: { employees: 0, departments: 1 }, employees: [], departments: [{ id: 5 }] } as any,
    ])

    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([]) // 0 attendances -> all absent
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    const start = new Date("2024-05-01T00:00:00Z")
    const end = new Date("2024-05-31T23:59:59Z")

    const result = await calculateAttendanceSummary(1, start, end)

    // Department schedule is Mon-Fri => 23 working days in May 2024.
    // If the global Mon-Sat schedule were (wrongly) unioned in, totalWorkingDays
    // would be 27 (4 Saturdays added) and Saturday May 4 would be marked absent.
    expect(result.totalWorkingDays).toBe(23)
    expect(result.dailyRate).toBe(1_000_000)
    // Up to May 10 (today): 8 Mon-Fri days elapsed and absent. Saturday May 4
    // must NOT be counted as an absent working day.
    expect(result.absentDays).toBe(8)
    expect(result.absentDeduction).toBe(8_000_000)
  })

  it("queries schedules with relation is-filters (N+1 fix: does not over-fetch full employee/department lists)", async () => {
    // Regression test for the N×M over-fetch that the pre-fix code did:
    // pulling every active WorkSchedule along with the FULL employees[] and
    // departments[] arrays, then filtering in JavaScript. The fixed code
    // pushes the filtering into the DB by adding an `OR` of relation
    // `is`-filters (employees.some(id = X), departments.some(id = Y), and
    // employees.none + departments.none for the global schedule). It still
    // selects a _count so the precedence guard `s.employees.length === 0`
    // (originally checking the unfiltered list) keeps the exact same
    // semantics. This test asserts the WHERE-clause shape so a future
    // refactor can't silently regress back to the unbounded over-fetch.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 42,
      departmentId: 5,
      baseSalary: 5_000_000,
    } as any)

    vi.mocked(prisma.workSchedule.findMany).mockResolvedValue([
      { workDays: "1,2,3,4,5", _count: { employees: 0, departments: 1 }, employees: [], departments: [{ id: 5 }] } as any,
    ])

    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    await calculateAttendanceSummary(42, new Date("2024-05-01"), new Date("2024-05-31"))

    const findManyCalls = vi.mocked(prisma.workSchedule.findMany).mock.calls
    expect(findManyCalls.length).toBe(1)
    const where = findManyCalls[0][0]?.where as { isActive: boolean; OR: any[] }

    expect(where.isActive).toBe(true)
    // The OR clause should be a relation is-filter, not a plain findMany
    // with no where-clause narrowing. Each branch must use a Prisma relation
    // filter, not a top-level IN array.
    expect(Array.isArray(where.OR)).toBe(true)
    expect(where.OR.length).toBe(3)

    // Branch 1: employees.some(id = 42) — employee-specific candidate
    expect(where.OR[0]).toEqual({ employees: { some: { id: 42 } } })

    // Branch 2: departments.some(id = 5) — department-specific candidate
    expect(where.OR[1]).toEqual({ departments: { some: { id: 5 } } })

    // Branch 3: global schedule — employees.none AND departments.none
    expect(where.OR[2]).toEqual({ employees: { none: {} }, departments: { none: {} } })
  })

  it("employee-specific schedule wins over department and global when all three exist", async () => {
    // Precedence sanity: when a single candidate set contains all three
    // precedence tiers, the employee-specific one (this employee is in
    // its employees[]) must win. Verifies the post-N+1-fix code still
    // selects the right schedule by reading the filtered employees[] not
    // the _count (which would treat any schedule-with-employees as
    // employee-specific even if THIS employee isn't in it).
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 7,
      departmentId: 3,
      baseSalary: 5_000_000,
    } as any)

    vi.mocked(prisma.workSchedule.findMany).mockResolvedValue([
      // Employee-specific: this employee IS attached, workDays Tue+Thu
      { workDays: "2,4", _count: { employees: 1, departments: 0 }, employees: [{ id: 7 }], departments: [] } as any,
      // Department 3: no employees at all, Mon-Fri
      { workDays: "1,2,3,4,5", _count: { employees: 0, departments: 1 }, employees: [], departments: [{ id: 3 }] } as any,
      // Global: Mon-Wed
      { workDays: "1,2,3", _count: { employees: 0, departments: 0 }, employees: [], departments: [] } as any,
    ])

    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    // Pick a period where the precedence matters: with the global schedule
    // Mon-Wed, May 6 (Monday) would be a working day. With the employee-
    // specific schedule (Tue+Thu), May 6 is NOT a working day. So the
    // expected behavior is: totalWorkingDays counts only Tue+Thu days.
    const result = await calculateAttendanceSummary(7, new Date("2024-05-01"), new Date("2024-05-31"))

    // May 2024 Tuesdays (7,14,21,28) + Thursdays (2,9,16,23,30) = 4+5 = 9 days.
    expect(result.totalWorkingDays).toBe(9)
  })

  it("department schedule with OTHER employees attached does not win via the global fallback", async () => {
    // Edge case the original code handled correctly and the over-fetch
    // refactor MUST preserve. Schedule S is "attached to department 3 and
    // also has employees 99,100 attached" — it is neither employee-specific
    // for our employee 7 (7 not in its employees[]), nor a clean
    // department schedule (has employees at all), nor a global schedule
    // (has a department). The original code's `s.employees.length === 0`
    // guard correctly excluded S from the department tier, so the
    // department-fallback never matched S. The fixed code uses
    // `_count.employees` (the UNFILTERED count) for that guard — this
    // test asserts the guard still works when S has _count.employees > 0
    // and the current employee is not in S's filtered employees[].
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 7,
      departmentId: 3,
      baseSalary: 5_000_000,
    } as any)

    vi.mocked(prisma.workSchedule.findMany).mockResolvedValue([
      // Schedule S: attached to dept 3, AND has employees 99,100 attached
      // (but NOT 7). The pre-fix code would fetch the full employees[]
      // and see length===2 !== 0, so the dept guard would correctly
      // exclude it. The refactor uses _count.employees (2) for the same
      // guard.
      { workDays: "1,2,3,4,5,6,7", _count: { employees: 2, departments: 1 }, employees: [], departments: [{ id: 3 }] } as any,
      // Global fallback: Mon-Fri
      { workDays: "1,2,3,4,5", _count: { employees: 0, departments: 0 }, employees: [], departments: [] } as any,
    ])

    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    const result = await calculateAttendanceSummary(7, new Date("2024-05-01"), new Date("2024-05-31"))

    // Should fall back to global (Mon-Fri = 23 working days in May 2024),
    // NOT to schedule S (which would be 31 working days).
    expect(result.totalWorkingDays).toBe(23)
  })
})
