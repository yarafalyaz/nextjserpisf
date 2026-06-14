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
})
