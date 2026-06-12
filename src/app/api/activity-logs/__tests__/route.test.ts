import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  findManyLogs: vi.fn(),
  countLogs: vi.fn(),
  findManyUsers: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activityLog: {
      findMany: (...a: unknown[]) => mocks.findManyLogs(...a),
      count: (...a: unknown[]) => mocks.countLogs(...a),
    },
    user: { findMany: (...a: unknown[]) => mocks.findManyUsers(...a) },
  },
}))

function makeReq(url: string): NextRequest {
  return new NextRequest(url)
}

describe("GET /api/activity-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    expect(res.status).toBe(401)
  })

  it("returns 500 on internal error", async () => {
    mocks.authFn.mockRejectedValue(new Error("boom"))
    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    expect(res.status).toBe(500)
  })

  it("returns logs with hydrated user names", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([
      { id: 1, userId: 1, action: "create", modelType: "User", modelId: 5, description: "Test", createdAt: new Date(), ipAddress: "127.0.0.1" },
    ])
    mocks.countLogs.mockResolvedValue(1)
    mocks.findManyUsers.mockResolvedValue([{ id: 1, name: "John" }])

    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    const json = await res.json()
    expect(json.data[0].userName).toBe("John")
    expect(json.total).toBe(1)
  })

  it("uses 'Sistem' when userId is null", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([
      { id: 1, userId: null, action: "system", modelType: "System", modelId: null, description: "Auto", createdAt: new Date(), ipAddress: null },
    ])
    mocks.countLogs.mockResolvedValue(1)

    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    const json = await res.json()
    expect(json.data[0].userName).toBe("Sistem")
    expect(json.data[0].ipAddress).toBe("-")
  })

  it("applies filters: userId, action, modelType, dateFrom/To, cari", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([])
    mocks.countLogs.mockResolvedValue(0)

    const url = "http://localhost/api/activity-logs?userId=5&action=create&modelType=User&dateFrom=2026-01-01&dateTo=2026-01-31&cari=test"
    await GET(makeReq(url) as any)

    expect(mocks.findManyLogs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 5,
        action: "create",
        modelType: "User",
        createdAt: { gte: new Date("2026-01-01"), lte: expect.any(Date) },
        description: { contains: "test" },
      }),
    }))
  })

  it("skips 'all' filters and date range when not provided", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([])
    mocks.countLogs.mockResolvedValue(0)

    await GET(makeReq("http://localhost/api/activity-logs?userId=all&action=all&modelType=all") as any)

    expect(mocks.findManyLogs).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
    }))
  })
})
