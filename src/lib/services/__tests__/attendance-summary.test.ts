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
      { isActive: true, workDays: "1,2,3,4,5,6", employees: [], departments: [] } as any,
      // Department 5 override: Mon-Fri
      { isActive: true, workDays: "1,2,3,4,5", employees: [], departments: [{ id: 5 }] } as any,
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
})
