import { describe, expect, it, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  approvalCount: vi.fn(),
  notificationFindMany: vi.fn(),
  activityLogFindMany: vi.fn(),
  getDailyAttendanceMetrics: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...args: unknown[]) => mocks.authFn(...args),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...args: unknown[]) => mocks.hasPermission(...args),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
    salesInvoice: { count: vi.fn().mockResolvedValue(0) },
    approval: { count: (...args: unknown[]) => mocks.approvalCount(...args) },
    notification: { findMany: (...args: unknown[]) => mocks.notificationFindMany(...args) },
    activityLog: { findMany: (...args: unknown[]) => mocks.activityLogFindMany(...args) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([{ id: 6, documentNo: "SO-0006" }]) },
    salesInvoiceRef: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock("@/lib/services/activity-reference.service", () => ({
  resolveActivityReferenceLabels: vi.fn().mockImplementation(async (refs: Array<{ modelType: string; modelId: number | null }>) => {
    const map = new Map<string, string>()
    for (const r of refs) {
      if (r.modelType === "SalesOrder" && r.modelId === 6) map.set("SalesOrder:6", "SO-0006")
    }
    return map
  }),
  resolveActivityReferenceSlugs: vi.fn().mockResolvedValue(new Map<string, string>()),
}))

vi.mock("@/lib/services/daily-attendance.service", () => ({
  getDailyAttendanceMetrics: (...args: unknown[]) => mocks.getDailyAttendanceMetrics(...args),
}))

describe("GET /api/dashboard/notifications approval queue access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockImplementation((perm: unknown) => Promise.resolve(perm === "approve_workflows"))
    mocks.approvalCount.mockResolvedValue(12)
    mocks.activityLogFindMany.mockResolvedValue([])
    mocks.notificationFindMany.mockResolvedValue([])
    mocks.getDailyAttendanceMetrics.mockResolvedValue({ lateAttendanceCount: 0, absentEmployees: [] })
  })

  it("does not return the global pending approval count to ordinary dashboard users", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 4, isActive: true, roles: ["karyawan"], permissions: [] } })

    const response = await GET()
    const result = await response.json()

    expect(result.pendingApprovalCount).toBe(0)
    expect(mocks.approvalCount).not.toHaveBeenCalled()
  })

  it("returns the pending approval count to workflow managers", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 4, isActive: true, roles: ["admin"], permissions: ["approve_workflows"] } })

    const response = await GET()
    const result = await response.json()

    expect(result.pendingApprovalCount).toBe(12)
    expect(mocks.approvalCount).toHaveBeenCalledWith({ where: { status: "pending" } })
  })
})

describe("GET /api/dashboard/notifications recent activities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockResolvedValue(true)
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true, roles: ["super_admin"], permissions: [] } })
    mocks.notificationFindMany.mockResolvedValue([])
    mocks.getDailyAttendanceMetrics.mockResolvedValue({ lateAttendanceCount: 0, absentEmployees: [] })
  })

  function logRow(id: number, modelType: string, modelId: number | null) {
    return { id, action: "create", modelType, modelId, description: `X #${modelId}`, createdAt: new Date() }
  }

  it("menyembunyikan aktivitas yang record-nya sudah terhapus", async () => {
    // SO 6 hidup (mock salesOrder), invoice 15 mati (tanpa mock delegate)
    mocks.activityLogFindMany.mockResolvedValue([logRow(1, "SalesOrder", 6), logRow(2, "SalesInvoice", 15)])

    const result = await (await GET()).json()

    expect(result.recentActivities.map((a: { id: number }) => a.id)).toEqual([1])
  })

  it("memberi label nomor dokumen + href pada aktivitas yang hidup", async () => {
    mocks.activityLogFindMany.mockResolvedValue([logRow(1, "SalesOrder", 6)])

    const result = await (await GET()).json()

    expect(result.recentActivities[0].refLabel).toBe("SO-0006")
    expect(result.recentActivities[0].href).toBe("/penjualan/pesanan/6")
  })

  it("membalas 401 kontrak apiError saat tanpa sesi (tanpa redirect)", async () => {
    mocks.authFn.mockResolvedValue(null)

    const response = await GET()
    const result = await response.json()

    expect(response.status).toBe(401)
    expect(result.error.code).toBe("UNAUTHORIZED")
  })

  it("membalas 401 saat pengguna nonaktif", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 4, isActive: false, roles: ["karyawan"], permissions: [] } })

    const response = await GET()

    expect(response.status).toBe(401)
  })
})
