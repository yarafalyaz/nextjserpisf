import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { SHARED_PAGINATION_CASES } from "../../vehicle-test-utils"

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn(), findMany: vi.fn(), count: vi.fn() }))

vi.mock("@/lib/auth/permissions", async () => (await import("../../vehicle-test-utils")).vehiclePermissionFactory(mocks))
vi.mock("@/lib/db/prisma", async () => (await import("../../vehicle-test-utils")).vehiclePrismaFactory(mocks, "vehicleBrand"))

const allow = (rows: unknown[] = []) => {
  mocks.hasPermission.mockResolvedValue(true)
  mocks.findMany.mockResolvedValue(rows)
  mocks.count.mockResolvedValue(rows.length)
}
const brandsUrl = (q = "") => new Request(`http://localhost/api/vehicle-brands${q}`)

describe("GET /api/vehicle-brands", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 403 when user lacks permission", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(brandsUrl())
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe("Tidak memiliki izin")
  })

  it("returns 500 on error", async () => {
    mocks.hasPermission.mockRejectedValue(new Error("boom"))
    expect((await GET(brandsUrl())).status).toBe(500)
  })

  it("returns brands with default pagination", async () => {
    allow([{ id: 1, name: "Toyota" }])
    const json = await (await GET(brandsUrl())).json()
    expect(json).toMatchObject({ total: 1, page: 1, pageSize: 50 })
    expect(json.data).toHaveLength(1)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50, where: {} }))
  })

  it.each(SHARED_PAGINATION_CASES)("parser pagination bersama: ?%s -> halaman %i pageSize %i", async (q, page, pageSize, skip, take) => {
    allow()
    const json = await (await GET(brandsUrl(`?${q}`))).json()
    expect(json).toMatchObject({ page, pageSize })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip, take }))
  })

  it("respects cari, halaman, and pageSize params", async () => {
    allow()
    const json = await (await GET(brandsUrl("?cari=Honda&halaman=2&pageSize=10"))).json()
    expect(json).toMatchObject({ page: 2, pageSize: 10 })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: { name: { contains: "Honda" } } }))
  })
})
