import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  countLeaveWorkingDays,
  getLeaveQuota,
  ANNUAL_LEAVE_QUOTA,
} from "../leave-quota.service"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    workSchedule: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
  },
}))

// Mon–Fri schedule used by most cases.
const monFriSchedule = [
  {
    isActive: true,
    workDays: "1,2,3,4,5",
    _count: { employees: 0, departments: 0 },
    employees: [],
    departments: [],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date("2026-06-16T12:00:00Z"))
  vi.mocked(prisma.workSchedule.findMany).mockResolvedValue(monFriSchedule as any)
  vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
  vi.mocked(prisma.departmentHoliday.findMany).mockResolvedValue([])
  vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
})

describe("countLeaveWorkingDays", () => {
  beforeEach(() => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 1,
      departmentId: null,
    } as any)
  })

  it("counts only working weekdays, excluding the weekend", async () => {
    // 2026-06-15 (Mon) .. 2026-06-19 (Fri) = 5 working days.
    const days = await countLeaveWorkingDays(
      1,
      new Date("2026-06-15"),
      new Date("2026-06-19"),
    )
    expect(days).toBe(5)
  })

  it("excludes Saturday and Sunday from a range that spans a weekend", async () => {
    // Fri 2026-06-19 .. Mon 2026-06-22 = Fri + Mon = 2 working days (Sat/Sun skipped).
    const days = await countLeaveWorkingDays(
      1,
      new Date("2026-06-19"),
      new Date("2026-06-22"),
    )
    expect(days).toBe(2)
  })

  it("excludes national holidays that fall on a working day", async () => {
    vi.mocked(prisma.holiday.findMany).mockResolvedValue([
      { date: new Date("2026-06-17") }, // a Wednesday in the range
    ] as any)
    // Mon 15 .. Fri 19 = 5 weekdays minus 1 holiday = 4.
    const days = await countLeaveWorkingDays(
      1,
      new Date("2026-06-15"),
      new Date("2026-06-19"),
    )
    expect(days).toBe(4)
  })

  it("returns 0 for an inverted range", async () => {
    const days = await countLeaveWorkingDays(
      1,
      new Date("2026-06-20"),
      new Date("2026-06-15"),
    )
    expect(days).toBe(0)
  })
})

describe("getLeaveQuota — tenure eligibility", () => {
  it("is NOT eligible (entitled 0) when tenure is under 1 year", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      joinDate: new Date("2026-01-01"), // ~5 months before 'now'
    } as any)

    const q = await getLeaveQuota(1)
    expect(q.eligible).toBe(false)
    expect(q.entitled).toBe(0)
    expect(q.remaining).toBe(0)
  })

  it("is eligible (entitled 12) when tenure is at least 1 year", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      joinDate: new Date("2020-01-01"),
    } as any)

    const q = await getLeaveQuota(1)
    expect(q.eligible).toBe(true)
    expect(q.entitled).toBe(ANNUAL_LEAVE_QUOTA)
    expect(q.remaining).toBe(12)
  })

  it("treats exactly one year of tenure as eligible (boundary)", async () => {
    // now = 2026-06-16; joined exactly one year + a day earlier.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      joinDate: new Date("2025-06-15"),
    } as any)

    const q = await getLeaveQuota(1)
    expect(q.eligible).toBe(true)
  })
})

describe("getLeaveQuota — usage accounting", () => {
  beforeEach(() => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      joinDate: new Date("2020-01-01"),
      departmentId: null,
    } as any)
  })

  it("counts approved + pending annual leave working days as used", async () => {
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
      // Mon 2026-06-15 .. Fri 2026-06-19 = 5 working days.
      { startDate: new Date("2026-06-15"), endDate: new Date("2026-06-19") },
    ] as any)

    const q = await getLeaveQuota(1)
    expect(q.used).toBe(5)
    expect(q.remaining).toBe(7)
  })

  it("clips leave that straddles the year boundary to the requested year", async () => {
    // Leave Dec 30 2026 .. Jan 2 2027. Only the 2026 portion counts for year 2026.
    // 2026-12-30 (Wed), 12-31 (Thu) are working days; Jan 1 2027 is next year.
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
      { startDate: new Date("2026-12-30"), endDate: new Date("2027-01-02") },
    ] as any)

    const q = await getLeaveQuota(1, { year: 2026 })
    expect(q.used).toBe(2)
  })

  it("excludes a given leave id from the usage total", async () => {
    // findMany is what applies the id filter; assert the where clause carries it.
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as any)
    await getLeaveQuota(1, { excludeLeaveId: 99 })

    const call = vi.mocked(prisma.leaveRequest.findMany).mock.calls[0][0]
    expect(call?.where?.id).toEqual({ not: 99 })
  })
})
