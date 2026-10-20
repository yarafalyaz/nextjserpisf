import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermissionFn: vi.fn(),
  findManyLogs: vi.fn(),
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
    },
    user: { findMany: (...a: unknown[]) => mocks.findManyUsers(...a) },
  },
}))

function makeReq(url: string): NextRequest {
  return new NextRequest(url)
}

describe("GET /api/activity-logs/export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: caller has the required permission. Individual tests override.
    mocks.hasPermissionFn.mockResolvedValue(true)
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeReq("http://localhost/api/activity-logs/export") as any)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Tidak terotorisasi" },
    })
  })

  it("returns 403 when authenticated but without manage_settings", async () => {
    // Authenticated, but a regular non-admin user (no roles/permissions).
    mocks.authFn.mockResolvedValue({ user: { id: 1, roles: [], permissions: [] } })
    mocks.hasPermissionFn.mockResolvedValue(false)

    const res = await GET(makeReq("http://localhost/api/activity-logs/export") as any)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    })
    // Crucial: must NOT dump the activity log to unauthorized callers.
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
  })

  it("returns structured 500 when export query fails", async () => {
    mocks.authFn.mockResolvedValue({
      user: { id: 1, roles: ["admin"], permissions: ["manage_settings"] },
    })
    mocks.findManyLogs.mockRejectedValue(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await GET(makeReq("http://localhost/api/activity-logs/export") as any)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Gagal mengekspor log aktivitas" },
    })
  })

it("rejects a non-integer userId with 400 and never queries", async () => {
    mocks.authFn.mockResolvedValue({
      user: { id: 1, roles: ["admin"], permissions: ["manage_settings"] },
    })
    for (const bad of ["5abc", "abc", "0", "-3", "99999999999999999999"]) {
      const res = await GET(makeReq(`http://localhost/api/activity-logs/export?userId=${bad}`) as any)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: { code: "BAD_REQUEST", message: "userId tidak valid" },
      })
    }
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
  })

  it("still applies a valid integer userId filter on export", async () => {
    mocks.authFn.mockResolvedValue({
      user: { id: 1, roles: ["admin"], permissions: ["manage_settings"] },
    })
    mocks.findManyLogs.mockResolvedValue([])
    const res = await GET(makeReq("http://localhost/api/activity-logs/export?userId=5") as any)
    expect(res.status).toBe(200)
    expect(mocks.findManyLogs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 5 }),
    }))
  })

  it("neutralises CSV formula-injection triggers in user-controlled fields", async () => {
    // User-controlled fields: a malicious user name, action, modelType and
    // description starting with a formula trigger (=/+/-/@/tab/CR). When an
    // admin opens the exported CSV in Excel/LibreOffice, a leading `=`
    // launches the formula. Cells MUST be prefixed (typically with a single
    // quote) so spreadsheet apps treat them as literal text.
    mocks.authFn.mockResolvedValue({
      user: { id: 1, roles: ["admin"], permissions: ["manage_settings"] },
    })
    mocks.findManyLogs.mockResolvedValue([
      {
        createdAt: new Date("2026-06-15T08:00:00Z"),
        userId: 99,
        action: "=cmd|'/c calc'!A1",
        modelType: "+SUM(1+1)",
        modelId: 1,
        description: "-2+3",
        ipAddress: "@evil",
      },
    ])
    mocks.findManyUsers.mockResolvedValue([
      { id: 99, name: "=2+5" },
    ])

    const res = await GET(makeReq("http://localhost/api/activity-logs/export") as any)
    expect(res.status).toBe(200)
    const body = await res.text()

    // The header row uses known labels — sanity check the test got a real body.
    expect(body.startsWith("Waktu,Pengguna,Aksi,Model,ID,Deskripsi,IP")).toBe(true)

    // None of these formula triggers may appear unescaped as the first
    // character inside a quoted cell (`,X"`,X in {=, +, -, @, \t, \r}).
    // We scan the raw bytes: a leading `=`, `+`, `-`, `@`, `\t`, or `\r`
    // inside a `"..."` cell is the formula-injection sink.
    const dangerousCell = /,"([=+\-@\t\r])[^"]*",/
    expect(body).not.toMatch(dangerousCell)
  })
})
