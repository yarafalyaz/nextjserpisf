import { describe, it, expect, vi, beforeEach } from "vitest"

// Putaran 86: karyawan di luar jendela masa kerja (sebelum joinDate /
// sesudah employmentEndedAt) tidak boleh dihitung absent — payroll sudah
// memakai employmentDayWindow; metrik harian + notifikasi cron memakai
// daftar ini, sehingga karyawan berakhir menghasilkan absen palsu.

const employeeFindMany = vi.fn()
const workScheduleFindMany = vi.fn()
const holidayFindMany = vi.fn()
const deptHolidayFindMany = vi.fn()
const attendanceFindMany = vi.fn()
const leaveFindMany = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findMany: (...a: unknown[]) => employeeFindMany(...a) },
    workSchedule: { findMany: (...a: unknown[]) => workScheduleFindMany(...a) },
    holiday: { findMany: (...a: unknown[]) => holidayFindMany(...a) },
    departmentHoliday: { findMany: (...a: unknown[]) => deptHolidayFindMany(...a) },
    attendance: { findMany: (...a: unknown[]) => attendanceFindMany(...a) },
    leaveRequest: { findMany: (...a: unknown[]) => leaveFindMany(...a) },
  },
}))

import { getDailyAttendanceMetrics } from "@/lib/services/daily-attendance.service"

const DAY = new Date(2026, 10, 3) // Selasa 3 Nov 2026 (hari kerja 2)

function employee(extra: Record<string, unknown>) {
  return {
    id: 1,
    name: "Karyawan",
    departmentId: null,
    joinDate: new Date(2026, 0, 1),
    employmentEndedAt: null,
    workSchedules: [],
    department: null,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  workScheduleFindMany.mockResolvedValue([{ id: 1, workDays: "1,2,3,4,5" }])
  holidayFindMany.mockResolvedValue([])
  deptHolidayFindMany.mockResolvedValue([])
  attendanceFindMany.mockResolvedValue([])
  leaveFindMany.mockResolvedValue([])
})

describe("getDailyAttendanceMetrics jendela masa kerja (putaran 86)", () => {
  it("karyawan aktif dalam masa kerja tanpa absensi tetap absent", async () => {
    employeeFindMany.mockResolvedValue([employee({})])
    const { absentEmployees } = await getDailyAttendanceMetrics(DAY)
    expect(absentEmployees.map((e) => e.id)).toEqual([1])
  })

  it("employmentEndedAt kemarin -> bukan absent", async () => {
    employeeFindMany.mockResolvedValue([
      employee({ employmentEndedAt: new Date(2026, 10, 2) }),
    ])
    const { absentEmployees } = await getDailyAttendanceMetrics(DAY)
    expect(absentEmployees).toEqual([])
  })

  it("hari terakhir bekerja (employmentEndedAt = hari ini) tetap dinilai", async () => {
    employeeFindMany.mockResolvedValue([
      employee({ employmentEndedAt: new Date(2026, 10, 3) }),
    ])
    const { absentEmployees } = await getDailyAttendanceMetrics(DAY)
    expect(absentEmployees.map((e) => e.id)).toEqual([1])
  })

  it("joinDate besok -> bukan absent", async () => {
    employeeFindMany.mockResolvedValue([
      employee({ joinDate: new Date(2026, 10, 4) }),
    ])
    const { absentEmployees } = await getDailyAttendanceMetrics(DAY)
    expect(absentEmployees).toEqual([])
  })

  it("query karyawan membawa joinDate + employmentEndedAt", async () => {
    employeeFindMany.mockResolvedValue([])
    await getDailyAttendanceMetrics(DAY)
    const arg = employeeFindMany.mock.calls[0][0] as { select: Record<string, unknown> }
    expect(arg.select.joinDate).toBe(true)
    expect(arg.select.employmentEndedAt).toBe(true)
  })
})
