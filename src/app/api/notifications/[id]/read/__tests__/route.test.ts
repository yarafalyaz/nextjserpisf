import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  markAsRead: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    markAsRead: (...a: unknown[]) => mocks.markAsRead(...a),
  },
}))

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/notifications/1/read", { method: "POST" })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makeReq(), makeParams("1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when notification id is invalid", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    const res = await POST(makeReq(), makeParams("abc"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when notification id is zero or negative", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    const res = await POST(makeReq(), makeParams("0"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when user id is invalid", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: "xyz" } })
    const res = await POST(makeReq(), makeParams("5"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when notification not owned by user", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.markAsRead.mockResolvedValue(false)
    const res = await POST(makeReq(), makeParams("5"))
    expect(res.status).toBe(404)
    // The service call MUST scope to the caller's userId, otherwise the route
    // would silently mark another user's notification as read.
    expect(mocks.markAsRead).toHaveBeenCalledWith(5, 1)
  })

  it("marks notification as read on success", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.markAsRead.mockResolvedValue(true)

    const res = await POST(makeReq(), makeParams("5"))
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mocks.markAsRead).toHaveBeenCalledWith(5, 1)
  })

  it("returns 500 on internal error", async () => {
    mocks.authFn.mockRejectedValue(new Error("boom"))
    const res = await POST(makeReq(), makeParams("5"))
    expect(res.status).toBe(500)
  })
})
