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
  })

  it("returns 403 when authenticated but missing manage_settings permission", async () => {
    // Authenticated, but a regular non-admin user (no roles/permissions).
    mocks.authFn.mockResolvedValue({ user: { id: 1, roles: [], permissions: [] } })
    mocks.hasPermissionFn.mockResolvedValue(false)

    const res = await GET(makeReq("http://localhost/api/activity-logs/export") as any)
    expect(res.status).toBe(403)
    // Crucial: must NOT dump the activity log to unauthorized callers.
    expect(mocks.findManyLogs).not.toHaveBeenCalled()
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
