import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
  },
}))

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 200 and healthy status when DB reachable", async () => {
    mocks.queryRaw.mockResolvedValue([{ "1": 1 }])
    const res = await GET()

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("healthy")
    expect(json.timestamp).toBeDefined()
    expect(json.uptime).toBeDefined()
  })

  it("returns 503 and unhealthy status when DB unreachable", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("connection refused"))
    const res = await GET()

    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.status).toBe("unhealthy")
    expect(json.error).toBe("Database unreachable")
  })
})
