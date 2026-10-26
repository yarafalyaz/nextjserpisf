import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader rekap kehadiran (F-2026-10-25-044-S, AC-ATT-B2/B4).
 * Scope HR diterapkan ke SEMUA query terikat karyawan, periode kolom
 * `date`, filter departemen hanya menyempitkan, select tanpa gaji,
 * precedence jadwal existing, tanpa jadwal -> hasSchedule false.
 */

const mocks = vi.hoisted(() => ({
  employeeFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  leaveFindMany: vi.fn(),
  scheduleFindMany: vi.fn(),
  holidayFindMany: vi.fn(),
  deptHolidayFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findMany: mocks.employeeFindMany },
    attendance: { findMany: mocks.attendanceFindMany },
    leaveRequest: { findMany: mocks.leaveFindMany },
    workSchedule: { findMany: mocks.scheduleFindMany },
    holiday: { findMany: mocks.holidayFindMany },
    departmentHoliday: { findMany: mocks.deptHolidayFindMany },
  },
}))

import { loadAttendanceRecap } from "../attendance-recap-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00`)
const PERIOD = { periodStart: d("2026-10-05"), periodEnd: d("2026-10-09") }
const TODAY = d("2026-10-07")

function employeeRow(overrides: Record<string, unknown> = {}) {
  return { id: 1, name: "Budi", departmentId: 10, department: { name: "Bengkel" }, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.employeeFindMany.mockResolvedValue([employeeRow()])
  mocks.attendanceFindMany.mockResolvedValue([])
  mocks.leaveFindMany.mockResolvedValue([])
  // Jadwal global Sen-Jum.
  mocks.scheduleFindMany.mockResolvedValue([
    { workDays: "1,2,3,4,5", employees: [], departments: [] },
  ])
  mocks.holidayFindMany.mockResolvedValue([])
  mocks.deptHolidayFindMany.mockResolvedValue([])
})

describe("loadAttendanceRecap — rantai loader F-044-S", () => {
  it("scope all: semua where tanpa kunci scope; select tanpa baseSalary; periode kolom date", async () => {
    await loadAttendanceRecap({ kind: "all" }, PERIOD, TODAY)
    const empArg = mocks.employeeFindMany.mock.calls[0][0]
    expect(empArg.where).toEqual({})
    expect(JSON.stringify(empArg.select)).not.toContain("baseSalary")
    const attArg = mocks.attendanceFindMany.mock.calls[0][0]
    expect(attArg.where.date.gte).toEqual(d("2026-10-05"))
    expect(attArg.where.date.lte.getHours()).toBe(23)
    expect(JSON.stringify(attArg.select)).not.toContain("baseSalary")
    const leaveArg = mocks.leaveFindMany.mock.calls[0][0]
    expect(leaveArg.where.status).toBe("approved")
  })

  it("scope self fail-closed (employeeId -1): where mengunci di employee/attendance/leave", async () => {
    const scope: HrScope = { kind: "self", employeeId: -1 }
    mocks.employeeFindMany.mockResolvedValue([])
    await loadAttendanceRecap(scope, PERIOD, TODAY)
    expect(mocks.employeeFindMany.mock.calls[0][0].where).toEqual({ id: -1 })
    expect(mocks.attendanceFindMany.mock.calls[0][0].where.employeeId).toBe(-1)
    expect(mocks.leaveFindMany.mock.calls[0][0].where.employeeId).toBe(-1)
  })

  it("scope department: employee by departmentId; attendance/leave lewat relasi employee", async () => {
    await loadAttendanceRecap({ kind: "department", departmentId: 10, employeeId: 7 }, PERIOD, TODAY)
    expect(mocks.employeeFindMany.mock.calls[0][0].where).toEqual({ departmentId: 10 })
    expect(mocks.attendanceFindMany.mock.calls[0][0].where.employee).toEqual({ departmentId: 10 })
  })

  it("filter departemen asing tidak memperluas scope department/self (irisan AND)", async () => {
    await loadAttendanceRecap(
      { kind: "department", departmentId: 10, employeeId: 7 },
      { ...PERIOD, departmentId: 99 },
      TODAY,
    )
    const empWhere = mocks.employeeFindMany.mock.calls[0][0].where
    expect(empWhere.departmentId).toBe(10)
    expect(empWhere.AND).toEqual([{ departmentId: 99 }])
    const attWhere = mocks.attendanceFindMany.mock.calls[0][0].where
    expect(attWhere.employee).toEqual({ departmentId: 10 })
    expect(attWhere.AND).toEqual([{ employee: { departmentId: 99 } }])
  })

  it("precedence jadwal: karyawan > departemen > global (paritas service payroll)", async () => {
    mocks.scheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [], departments: [] }, // global Sen-Jum
      { workDays: "1,2,3,4,5,6", employees: [], departments: [{ id: 10 }] }, // dept +Sab
      { workDays: "0,6", employees: [{ id: 1 }], departments: [] }, // karyawan Sab-Min
    ])
    // Periode hanya berisi Sab 2026-10-10 s/d Min 2026-10-11 agar beda jadwal terlihat.
    const recap = await loadAttendanceRecap(
      { kind: "all" },
      { periodStart: d("2026-10-10"), periodEnd: d("2026-10-11") },
      d("2026-10-11"),
    )
    expect(recap.employees[0].hasSchedule).toBe(true)
    expect(recap.employees[0].scheduledWorkDays).toBe(2) // jadwal karyawan Sab-Min menang
  })

  it("tanpa jadwal terikat sama sekali -> hasSchedule false, hari kerja null (BR-ATT-04)", async () => {
    mocks.scheduleFindMany.mockResolvedValue([])
    const recap = await loadAttendanceRecap({ kind: "all" }, PERIOD, TODAY)
    expect(recap.employees[0].hasSchedule).toBe(false)
    expect(recap.employees[0].scheduledWorkDays).toBeNull()
  })

  it("Holiday + DepartmentHoliday departemen sendiri mengurangi hari kerja; dept lain tidak", async () => {
    mocks.holidayFindMany.mockResolvedValue([{ date: d("2026-10-06") }])
    mocks.deptHolidayFindMany.mockResolvedValue([
      { departmentId: 10, date: d("2026-10-07") },
      { departmentId: 99, date: d("2026-10-05") },
    ])
    const recap = await loadAttendanceRecap({ kind: "all" }, PERIOD, TODAY)
    const e = recap.employees[0]
    expect(e.holidayDays).toBe(2)
    expect(e.scheduledWorkDays).toBe(3)
  })

  it("pemetaan baris: checkIn null -> hasCheckIn false; cuti approved mengisi leaveDays (AC-ATT-B3/B4)", async () => {
    mocks.attendanceFindMany.mockResolvedValue([
      { employeeId: 1, date: d("2026-10-05"), checkIn: d("2026-10-05"), status: "sick", lateMinutes: 0, overtimeMinutes: null },
      { employeeId: 1, date: d("2026-10-06"), checkIn: null, status: "absent", lateMinutes: 0, overtimeMinutes: 30 },
    ])
    mocks.leaveFindMany.mockResolvedValue([
      { employeeId: 1, startDate: d("2026-10-07"), endDate: d("2026-10-07") },
    ])
    const recap = await loadAttendanceRecap({ kind: "all" }, PERIOD, TODAY)
    const e = recap.employees[0]
    expect(e.sickDays).toBe(1)
    expect(e.absentDays).toBe(1)
    expect(e.leaveDays).toBe(1)
    expect(e.totalOvertimeMinutes).toBe(30)
    expect(recap.notice).toContain("bukan dasar potongan")
  })

  it("karyawan tanpa baris apa pun tetap tampil kosong jujur", async () => {
    const recap = await loadAttendanceRecap({ kind: "all" }, PERIOD, TODAY)
    expect(recap.employees).toHaveLength(1)
    expect(recap.employees[0].recordCount).toBe(0)
    expect(recap.employees[0].noRecordDays).toBe(3)
  })
})
