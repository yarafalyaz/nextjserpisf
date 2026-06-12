import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationCount: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notification: {
      findMany: (...a: unknown[]) => mocks.notificationFindMany(...a),
      count: (...a: unknown[]) => mocks.notificationCount(...a),
    },
  },
}))

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 401 when session has no user", async () => {
    mocks.authFn.mockResolvedValue({ user: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 400 when user.id is not a positive integer", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: "abc" } })
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it("returns 400 when user.id is 0 or negative", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 0 } })
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it("returns notifications and unread count", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 7 } })
    mocks.notificationFindMany.mockResolvedValue([{ id: 1, title: "Test" }])
    mocks.notificationCount.mockResolvedValue(3)

    const res = await GET()
    const json = await res.json()
    expect(json.notifications).toHaveLength(1)
    expect(json.unreadCount).toBe(3)
    expect(mocks.notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 7 },
      take: 10,
    }))
  })

  it("returns 500 on internal error", async () => {
    mocks.authFn.mockRejectedValue(new Error("boom"))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
