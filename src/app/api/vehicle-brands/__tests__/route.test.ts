import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vehicleBrand: {
      findMany: (...a: unknown[]) => mocks.findMany(...a),
      count: (...a: unknown[]) => mocks.count(...a),
    },
  },
}))

describe("GET /api/vehicle-brands", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when user lacks permission", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(new Request("http://localhost/api/vehicle-brands"))
    expect(res.status).toBe(403)
  })

  it("returns 500 on error", async () => {
    mocks.hasPermission.mockRejectedValue(new Error("boom"))
    const res = await GET(new Request("http://localhost/api/vehicle-brands"))
    expect(res.status).toBe(500)
  })

  it("returns brands with default pagination", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.findMany.mockResolvedValue([{ id: 1, name: "Toyota" }])
    mocks.count.mockResolvedValue(1)

    const res = await GET(new Request("http://localhost/api/vehicle-brands"))
    const json = await res.json()
    expect(json.data).toHaveLength(1)
    expect(json.total).toBe(1)
    expect(json.page).toBe(1)
    expect(json.pageSize).toBe(50)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 50,
      where: {},
    }))
  })

  it("respects cari, halaman, and pageSize params", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.findMany.mockResolvedValue([])
    mocks.count.mockResolvedValue(0)

    const res = await GET(new Request("http://localhost/api/vehicle-brands?cari=Honda&halaman=2&pageSize=10"))
    const json = await res.json()
    expect(json.page).toBe(2)
    expect(json.pageSize).toBe(10)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: { name: { contains: "Honda" } },
    }))
  })
})
