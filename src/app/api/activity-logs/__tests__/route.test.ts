import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermissionFn: vi.fn(),
  findManyLogs: vi.fn(),
  countLogs: vi.fn(),
  findManyUsers: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermissionFn(...a),
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
    // Default: pemanggil adalah super_admin. Tes masing-masing bisa menimpanya.
    mocks.hasPermissionFn.mockResolvedValue(true)
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    expect(res.status).toBe(401)
  })

  it("returns 403 when authenticated but without manage_settings", async () => {
    // Authenticated, but a regular non-admin user (no roles/permissions).
    mocks.authFn.mockResolvedValue({ user: { id: 1, roles: [], permissions: [] } })
    mocks.hasPermissionFn.mockResolvedValue(false)

    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    expect(res.status).toBe(403)
    // Crucial: the route must NOT touch the database when the caller lacks
    // the required permission — otherwise we leak the entire activity log.
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
    expect(mocks.countLogs).not.toHaveBeenCalled()
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

it("rejects a non-integer userId with 400 and never queries", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    for (const bad of ["5abc", "abc", "0", "-3", "99999999999999999999"]) {
      const res = await GET(makeReq(`http://localhost/api/activity-logs?userId=${bad}`) as any)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: { code: "BAD_REQUEST", message: "userId tidak valid" },
      })
    }
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
    expect(mocks.countLogs).not.toHaveBeenCalled()
  })

  it("still applies a valid integer userId filter", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([])
    mocks.countLogs.mockResolvedValue(0)
    const res = await GET(makeReq("http://localhost/api/activity-logs?userId=5") as any)
    expect(res.status).toBe(200)
    expect(mocks.findManyLogs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 5 }),
    }))
  })

  it.each(["bukan-tanggal", "2026-13-40"])(
    "rejects invalid dateFrom %j with 400 and never queries",
    async (dateFrom) => {
      mocks.authFn.mockResolvedValue({ user: { id: 1 } })
      const res = await GET(makeReq(`http://localhost/api/activity-logs?dateFrom=${dateFrom}`) as any)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: { code: "BAD_REQUEST", message: "Tanggal tidak valid" },
      })
      expect(mocks.findManyLogs).not.toHaveBeenCalled()
      expect(mocks.countLogs).not.toHaveBeenCalled()
    },
  )

  it.each(["bukan-tanggal", "2026-13-40"])(
    "rejects invalid dateTo %j with 400 and never queries",
    async (dateTo) => {
      mocks.authFn.mockResolvedValue({ user: { id: 1 } })
      const res = await GET(makeReq(`http://localhost/api/activity-logs?dateTo=${dateTo}`) as any)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: { code: "BAD_REQUEST", message: "Tanggal tidak valid" },
      })
      expect(mocks.findManyLogs).not.toHaveBeenCalled()
      expect(mocks.countLogs).not.toHaveBeenCalled()
    },
  )

  it("rejects dateFrom after dateTo with 400 and never queries", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    const res = await GET(makeReq("http://localhost/api/activity-logs?dateFrom=2026-02-01&dateTo=2026-01-01") as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: "BAD_REQUEST", message: "Rentang tanggal tidak valid" },
    })
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
    expect(mocks.countLogs).not.toHaveBeenCalled()
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

  it("queries only the contract columns (oldValues/newValues/metadata tidak ikut dimuat)", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([])
    mocks.countLogs.mockResolvedValue(0)

    await GET(makeReq("http://localhost/api/activity-logs") as any)

    // Tanpa select, Prisma memuat seluruh baris ActivityLog — termasuk
    // oldValues/newValues (Json, bisa memuat gaji/bank) dan metadata (Text) —
    // padahal respons hanya memakai field kontrak + keberadaan old/newValues
    // sebagai boolean hasChanges. select harus membatasi ke field kontrak saja.
    expect(mocks.findManyLogs).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        userId: true,
        action: true,
        modelType: true,
        modelId: true,
        description: true,
        createdAt: true,
        ipAddress: true,
        oldValues: true,
        newValues: true,
      },
    }))
    const call = mocks.findManyLogs.mock.calls[0][0] as Record<string, unknown>
    expect(call.select).not.toHaveProperty("metadata")
  })

  it("sets hasChanges from the presence of old/new values only", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.findManyLogs.mockResolvedValue([
      { id: 1, userId: 1, action: "create", modelType: "User", modelId: 5, description: "Test", createdAt: new Date(), ipAddress: "127.0.0.1", oldValues: { gaji: 999 }, newValues: null },
      { id: 2, userId: 1, action: "login", modelType: "User", modelId: 5, description: null, createdAt: new Date(), ipAddress: null, oldValues: null, newValues: null },
    ])
    mocks.countLogs.mockResolvedValue(2)
    mocks.findManyUsers.mockResolvedValue([{ id: 1, name: "John" }])

    const res = await GET(makeReq("http://localhost/api/activity-logs") as any)
    const json = await res.json()
    expect(json.data[0].hasChanges).toBe(true)
    expect(json.data[1].hasChanges).toBe(false)
    // Nilai old/new tidak boleh bocor ke respons — hanya flag-nya.
    expect(JSON.stringify(json.data[0])).not.toContain("gaji")
    expect(json.data[0]).not.toHaveProperty("oldValues")
  })
})
