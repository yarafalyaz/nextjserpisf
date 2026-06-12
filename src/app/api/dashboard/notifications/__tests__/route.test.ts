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

describe("GET /api/dashboard/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryRaw.mockResolvedValue([{ count: BigInt(0) }])
    mocks.salesInvoiceCount.mockResolvedValue(0)
    mocks.employeeCount.mockResolvedValue(0)
    mocks.attendanceCount.mockResolvedValue(0)
    mocks.leaveRequestCount.mockResolvedValue(0)
    mocks.holidayFindFirst.mockResolvedValue(null)
    mocks.activityLogFindMany.mockResolvedValue([])
    mocks.notificationFindMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 401 when requireAuth throws", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("no auth"))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns dashboard counts for a user with all permissions (after 10am)", async () => {
    // Pin time to noon so absent calculation runs
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))

    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.hasPermission.mockResolvedValue(true)
    mocks.queryRaw.mockResolvedValue([{ count: BigInt(3) }])
    mocks.salesInvoiceCount.mockResolvedValue(2)
    mocks.employeeCount.mockResolvedValue(10)
    mocks.attendanceCount.mockResolvedValue(7)
    mocks.leaveRequestCount.mockResolvedValue(1)
    mocks.activityLogFindMany.mockResolvedValue([
      { id: 1, action: "create", modelType: "Item", description: "X", createdAt: new Date() },
    ])
    mocks.notificationFindMany.mockResolvedValue([
      { id: 1, title: "N", body: "B", type: "info", readAt: null, createdAt: new Date() },
    ])

    const res = await GET()
    const json = await res.json()
    expect(json.lowStockCount).toBe(3)
    expect(json.overdueInvoiceCount).toBe(2)
    expect(json.lateAttendanceCount).toBe(3)
    // absent = max(0, 10 - 7 - 1) = 2
    expect(json.absentEmployeeCount).toBe(2)
    expect(json.recentActivities).toHaveLength(1)
    expect(json.latestNotifications[0].readAt).toBeNull()
  })

  it("returns 0 absent when run before 10am", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))

    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["admin"] })
    mocks.hasPermission.mockResolvedValue(true)

    const res = await GET()
    const json = await res.json()
    expect(json.absentEmployeeCount).toBe(0)
    // employee.count should not be called for absent calc
    expect(mocks.employeeCount).not.toHaveBeenCalled()
  })

  it("returns 0 absent on a holiday", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))

    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["admin"] })
    mocks.hasPermission.mockResolvedValue(true)
    mocks.employeeCount.mockResolvedValue(10)
    mocks.attendanceCount.mockResolvedValue(0)
    mocks.holidayFindFirst.mockResolvedValue({ id: 5 })

    const res = await GET()
    const json = await res.json()
    expect(json.absentEmployeeCount).toBe(0)
  })

  it("returns zeros when user has no permissions", async () => {
    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["staff"] })
    mocks.hasPermission.mockResolvedValue(false)

    const res = await GET()
    const json = await res.json()
    expect(json.lowStockCount).toBe(0)
    expect(json.overdueInvoiceCount).toBe(0)
    expect(json.lateAttendanceCount).toBe(0)
    expect(json.recentActivities).toEqual([])
    // queryRaw should not run for items/attendance when no permission
    expect(mocks.salesInvoiceCount).not.toHaveBeenCalled()
    expect(mocks.activityLogFindMany).not.toHaveBeenCalled()
  })

  it("serializes notification readAt when present", async () => {
    mocks.requireAuth.mockResolvedValue({ id: 1, roles: ["staff"] })
    mocks.hasPermission.mockResolvedValue(false)
    mocks.notificationFindMany.mockResolvedValue([
      { id: 1, title: "N", body: "B", type: "info", readAt: new Date("2026-06-01T00:00:00Z"), createdAt: new Date() },
    ])

    const res = await GET()
    const json = await res.json()
    expect(json.latestNotifications[0].readAt).toBe("2026-06-01T00:00:00.000Z")
  })
})
