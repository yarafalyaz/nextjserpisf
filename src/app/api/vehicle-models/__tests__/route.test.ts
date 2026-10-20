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
    vehicleModel: {
      findMany: (...a: unknown[]) => mocks.findMany(...a),
      count: (...a: unknown[]) => mocks.count(...a),
    },
  },
}))

describe("GET /api/vehicle-models", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when user lacks permission", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(new Request("http://localhost/api/vehicle-models"))
    expect(res.status).toBe(403)
  })

  it("returns 500 on error", async () => {
    mocks.hasPermission.mockRejectedValue(new Error("boom"))
    const res = await GET(new Request("http://localhost/api/vehicle-models"))
    expect(res.status).toBe(500)
  })

  it("returns models with default pagination", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.findMany.mockResolvedValue([{ id: 1, name: "Avanza" }])
    mocks.count.mockResolvedValue(1)

    const res = await GET(new Request("http://localhost/api/vehicle-models"))
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

  it.each([
    ["halaman=abc&pageSize=xyz", 1, 50, 0, 50],
    ["halaman=0&pageSize=9999", 1, 500, 0, 500],
  ])("parser pagination bersama: ?%s -> halaman %i pageSize %i", async (q, page, pageSize, skip, take) => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.findMany.mockResolvedValue([])
    mocks.count.mockResolvedValue(0)
    const res = await GET(new Request(`http://localhost/api/vehicle-models?${q}`))
    const json = await res.json()
    expect(json.page).toBe(page)
    expect(json.pageSize).toBe(pageSize)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip, take }))
  })

  it("respects cari, brandId, halaman, and pageSize params", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.findMany.mockResolvedValue([])
    mocks.count.mockResolvedValue(0)

    const res = await GET(new Request("http://localhost/api/vehicle-models?cari=Jazz&brandId=5&halaman=3&pageSize=20"))
    const json = await res.json()
    expect(json.page).toBe(3)
    expect(json.pageSize).toBe(20)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 40,
      take: 20,
      where: { name: { contains: "Jazz" }, vehicleBrandId: 5 },
    }))
  })

  it.each(["abc", "5abc", "0", "-3", ""])(
    "returns 400 for invalid brandId %j without querying",
    async (brandId) => {
      mocks.hasPermission.mockResolvedValue(true)
      const res = await GET(
        new Request(`http://localhost/api/vehicle-models?brandId=${encodeURIComponent(brandId)}`),
      )
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error.code).toBe("BAD_REQUEST")
      expect(mocks.findMany).not.toHaveBeenCalled()
      expect(mocks.count).not.toHaveBeenCalled()
    },
  )
})
