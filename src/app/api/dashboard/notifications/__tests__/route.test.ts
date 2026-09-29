import { describe, expect, it, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
  approvalCount: vi.fn(),
  notificationFindMany: vi.fn(),
  getDailyAttendanceMetrics: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args),
  hasPermission: (...args: unknown[]) => mocks.hasPermission(...args),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    salesInvoice: { count: vi.fn() },
    approval: { count: (...args: unknown[]) => mocks.approvalCount(...args) },
    notification: { findMany: (...args: unknown[]) => mocks.notificationFindMany(...args) },
    activityLog: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock("@/lib/services/daily-attendance.service", () => ({
  getDailyAttendanceMetrics: (...args: unknown[]) => mocks.getDailyAttendanceMetrics(...args),
}))

describe("GET /api/dashboard/notifications approval queue access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockResolvedValue(false)
    mocks.approvalCount.mockResolvedValue(12)
    mocks.notificationFindMany.mockResolvedValue([])
    mocks.getDailyAttendanceMetrics.mockResolvedValue({ lateAttendanceCount: 0, absentEmployees: [] })
  })

  it("does not return the global pending approval count to ordinary dashboard users", async () => {
    mocks.requireAuth.mockResolvedValue({ id: 4, roles: ["karyawan"], permissions: [] })

    const response = await GET()
    const result = await response.json()

    expect(result.pendingApprovalCount).toBe(0)
    expect(mocks.approvalCount).not.toHaveBeenCalled()
  })

  it("returns the pending approval count to workflow managers", async () => {
    mocks.requireAuth.mockResolvedValue({ id: 4, roles: ["admin"], permissions: ["approve_workflows"] })

    const response = await GET()
    const result = await response.json()

    expect(result.pendingApprovalCount).toBe(12)
    expect(mocks.approvalCount).toHaveBeenCalledWith({ where: { status: "pending" } })
  })
})
