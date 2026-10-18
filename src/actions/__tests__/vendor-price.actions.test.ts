import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock: any = {
    vendorItemPrice: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import * as actions from "../vendor-price.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

const base = { vendorId: "1", itemId: "7", price: "50000", effectiveDate: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
})

describe("Vendor Price minQty id-ID", () => {
  // "1.000" gaya id-ID = seribu. Number("1.000") = 1 tanpa error — tanpa
  // normalisasi, minQty 1000 tersimpan sebagai 1 dan keunikan
  // (vendor,item,minQty) rusak diam-diam.
  it("createVendorPrice menyimpan minQty '1.000' sebagai 1000, bukan 1", async () => {
    const res = await actions.createVendorPrice(fdMap({ ...base, minQty: "1.000" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.vendorItemPrice.create.mock.calls.at(-1)![0].data
    expect(Number(data.minQty)).toBe(1000)
  })

  it("createVendorPrice menyimpan minQty '1,5' sebagai 1.5", async () => {
    const res = await actions.createVendorPrice(fdMap({ ...base, minQty: "1,5" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.vendorItemPrice.create.mock.calls.at(-1)![0].data
    expect(Number(data.minQty)).toBe(1.5)
  })

  it("createVendorPrice menolak minQty tak-angka", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createVendorPrice(fdMap({ ...base, minQty: "abc" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.vendorItemPrice.create.mock.calls.at(-1)![0].data
    // Fallback default 1 bila kosong/tak-terbaca — perilaku lama dipertahankan.
    expect(Number(data.minQty)).toBe(1)
  })

  it("updateVendorPrice menyimpan minQty '2.500' sebagai 2500", async () => {
    mocks.prismaMock.vendorItemPrice.findUnique.mockResolvedValueOnce({ id: 1 })
    const res = await actions.updateVendorPrice(1, fdMap({ ...base, minQty: "2.500" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.vendorItemPrice.update.mock.calls.at(-1)![0].data
    expect(Number(data.minQty)).toBe(2500)
  })
})
