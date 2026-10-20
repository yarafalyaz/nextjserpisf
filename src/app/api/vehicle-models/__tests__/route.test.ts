import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { SHARED_PAGINATION_CASES } from "../../vehicle-test-utils"

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn(), findMany: vi.fn(), count: vi.fn() }))

vi.mock("@/lib/auth/permissions", async () => (await import("../../vehicle-test-utils")).vehiclePermissionFactory(mocks))
vi.mock("@/lib/db/prisma", async () => (await import("../../vehicle-test-utils")).vehiclePrismaFactory(mocks, "vehicleModel"))

const allow = (rows: unknown[] = []) => {
  mocks.hasPermission.mockResolvedValue(true)
  mocks.findMany.mockResolvedValue(rows)
  mocks.count.mockResolvedValue(rows.length)
}
const modelsUrl = (q = "") => new Request(`http://localhost/api/vehicle-models${q}`)

describe("GET /api/vehicle-models", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 403 when user lacks permission", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    expect((await GET(modelsUrl())).status).toBe(403)
  })

  it("returns 500 on error", async () => {
    mocks.hasPermission.mockRejectedValue(new Error("boom"))
    expect((await GET(modelsUrl())).status).toBe(500)
  })

  it("returns models with default pagination", async () => {
    allow([{ id: 1, name: "Avanza" }])
    const json = await (await GET(modelsUrl())).json()
    expect(json).toMatchObject({ total: 1, page: 1, pageSize: 50 })
    expect(json.data).toHaveLength(1)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50, where: {} }))
  })

  it.each(SHARED_PAGINATION_CASES)("parser pagination bersama: ?%s -> halaman %i pageSize %i", async (q, page, pageSize, skip, take) => {
    allow()
    const json = await (await GET(modelsUrl(`?${q}`))).json()
    expect(json).toMatchObject({ page, pageSize })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip, take }))
  })

  it("respects cari, brandId, halaman, and pageSize params", async () => {
    allow()
    const json = await (await GET(modelsUrl("?cari=Jazz&brandId=5&halaman=3&pageSize=20"))).json()
    expect(json).toMatchObject({ page: 3, pageSize: 20 })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20, where: { name: { contains: "Jazz" }, vehicleBrandId: 5 } }))
  })

  it.each(["abc", "5abc", "0", "-3", ""])("returns 400 for invalid brandId %j without querying", async (brandId) => {
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(modelsUrl(`?brandId=${encodeURIComponent(brandId)}`))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("BAD_REQUEST")
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.count).not.toHaveBeenCalled()
  })
})
