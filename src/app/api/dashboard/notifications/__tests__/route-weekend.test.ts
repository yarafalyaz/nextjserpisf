import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
  queryRaw: vi.fn(),
  salesInvoiceCount: vi.fn(),
  employeeCount: vi.fn(),
  attendanceCount: vi.fn(),
  leaveRequestCount: vi.fn(),
  holidayFindFirst: vi.fn(),
  activityLogFindMany: vi.fn(),
  notificationFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requireAuth: (...a: unknown[]) => mocks.requireAuth(...a),
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    salesInvoice: { count: (...a: unknown[]) => mocks.salesInvoiceCount(...a) },
    employee: { count: (...a: unknown[]) => mocks.employeeCount(...a) },
    attendance: { count: (...a: unknown[]) => mocks.attendanceCount(...a) },
    leaveRequest: { count: (...a: unknown[]) => mocks.leaveRequestCount(...a) },
    holiday: { findFirst: (...a: unknown[]) => mocks.holidayFindFirst(...a) },
    activityLog: { findMany: (...a: unknown[]) => mocks.activityLogFindMany(...a) },
    notification: { findMany: (...a: unknown[]) => mocks.notificationFindMany(...a) },
  },
}))

describe("GET /api/dashboard/notifications - weekend/holiday absent guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryRaw.mockResolvedValue([{ count: BigInt(0) }])
    mocks.salesInvoiceCount.mockResolvedValue(0)
    mocks.employeeCount.mockResolvedValue(10) // 10 active employees
    mocks.attendanceCount.mockResolvedValue(7) // 7 attended
    mocks.leaveRequestCount.mockResolvedValue(1) // 1 on leave
    mocks.holidayFindFirst.mockResolvedValue(null) // not a holiday
    mocks.activityLogFindMany.mockResolvedValue([])
    mocks.notificationFindMany.mockResolvedValue([])
    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.hasPermission.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 0 absent on Saturday even when 2 employees are missing", async () => {
    // 2026-06-13 is a Saturday in the server's local time.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-13T12:00:00"))

    const res = await GET()
    const json = await res.json()

    // Without the weekend guard, the math gives max(0, 10-7-1) = 2 absent
    // employees. That would falsely flag weekend-non-attendance as absenteeism
    // for an admin checking the dashboard on a Saturday afternoon.
    expect(json.absentEmployeeCount).toBe(0)
  })

  it("returns 0 absent on Sunday", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-14T12:00:00")) // Sunday

    const res = await GET()
    const json = await res.json()
    expect(json.absentEmployeeCount).toBe(0)
  })

  it("still reports absent on a regular weekday (regression check)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-15T12:00:00")) // Monday

    const res = await GET()
    const json = await res.json()
    // 10 active - 7 present - 1 on leave = 2 absent on a Monday.
    expect(json.absentEmployeeCount).toBe(2)
  })

  it("lateAttendanceCount uses the JS local-midnight boundary, not MySQL CURDATE()", async () => {
    // Pin time to 2026-06-15 23:30 local. JS local-midnight window is
    // [2026-06-15T00:00:00, 2026-06-16T00:00:00). The dashboard must query
    // attendances inside THIS window — same boundary the absent-employee
    // branch and the daily-notifications cron use. CURDATE() in the SQL
    // uses the *MySQL server's* timezone, which can diverge from Node's and
    // produce a different "today" than the rest of the route reports. The
    // old SQL `WHERE date >= CURDATE() AND date < CURDATE() + INTERVAL 1 DAY`
    // was untestable and silently shifted late-attendance counts whenever
    // the MySQL TZ differed from the Node TZ.
    vi.useFakeTimers()
    const pinned = new Date("2026-06-15T23:30:00")
    vi.setSystemTime(pinned)

    mocks.attendanceCount.mockResolvedValueOnce(4) // any non-zero count

    const res = await GET()
    const json = await res.json()
    expect(json.lateAttendanceCount).toBe(4)

    // Find the call to prisma.attendance.count() that was used to compute
    // lateAttendanceCount (the absent branch also calls attendance.count, so
    // we filter to the one whose where filter is the late-attendance shape).
    const lateCall = mocks.attendanceCount.mock.calls.find((c) => {
      const arg = c[0] as { where?: { date?: { gte?: unknown; lt?: unknown }; OR?: unknown } } | undefined
      return arg?.where?.date !== undefined && arg?.where?.OR !== undefined
    })
    expect(lateCall, "late-attendance count() was not invoked through Prisma").toBeDefined()

    const expectedToday = new Date(pinned)
    expectedToday.setHours(0, 0, 0, 0)
    const expectedTomorrow = new Date(expectedToday.getTime() + 86_400_000)

    const where = (lateCall![0] as { where: { date: { gte: Date; lt: Date } } }).where
    expect(where.date.gte.getTime()).toBe(expectedToday.getTime())
    expect(where.date.lt.getTime()).toBe(expectedTomorrow.getTime())

    // The $queryRaw for items uses date - ensure we didn't leak an items
    // query into the attendance path. queryRaw is called once for lowStock.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
  })
})
