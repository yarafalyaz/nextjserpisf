import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression: cek duplikat CustomerPriceList WAJIB berjalan di dalam tx
 * sesudah kunci baris items (serialisasi per item). Unique DB
 * (customerCategoryId, itemId, minQty, effectiveDate) tidak menahan tuple
 * ber-NULL di MariaDB, jadi cek findFirst lepas di luar tx membiarkan dua
 * create/update konkuren sama-sama lolos dan harga faktur tak deterministik.
 */

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn()
  const priceFindFirst = vi.fn()
  const priceFindUnique = vi.fn()
  const priceCreate = vi.fn()
  const priceUpdate = vi.fn()

  const prismaMock: any = {
    customerPriceList: {
      findFirst: priceFindFirst,
      findUnique: priceFindUnique,
      create: priceCreate,
      update: priceUpdate,
    },
    $queryRaw: queryRaw,
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock))

  return {
    queryRaw,
    priceFindFirst,
    priceFindUnique,
    priceCreate,
    priceUpdate,
    prismaMock,
    requirePermissionMock: vi.fn(),
    logActivityMock: vi.fn(),
    revalidateMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

import { createCustomerPriceList, updateCustomerPriceList } from "../customer-price-list.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

const base = { itemId: "7", price: "50000", minQty: "1" }

function firstLockedSql(): string {
  const arg = mocks.queryRaw.mock.calls[0]?.[0] as unknown
  if (Array.isArray(arg)) return arg.join("?")
  const obj = arg as { sql?: string; strings?: string[] }
  return obj?.sql ?? obj?.strings?.join("?") ?? ""
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.queryRaw.mockResolvedValue([{ id: 7 }])
  mocks.priceFindFirst.mockResolvedValue(null)
  mocks.priceFindUnique.mockResolvedValue({ id: 11 })
  mocks.priceCreate.mockResolvedValue({ id: 21 })
  mocks.priceUpdate.mockResolvedValue({})
})

describe("createCustomerPriceList — serialisasi cek duplikat per item", () => {
  it("mengunci baris items FOR UPDATE sebelum cek duplikat di dalam tx", async () => {
    const res = await createCustomerPriceList(fd({ ...base }))

    expect(res).toEqual({ success: true, id: 21 })
    expect(mocks.prismaMock.$transaction).toHaveBeenCalled()
    expect(firstLockedSql()).toMatch(/FROM items[\s\S]*FOR UPDATE/)
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.priceFindFirst.mock.invocationCallOrder[0],
    )
    expect(mocks.priceCreate).toHaveBeenCalledTimes(1)
  })

  it("duplikat yang terlihat di bawah kunci ditolak tanpa create", async () => {
    mocks.priceFindFirst.mockResolvedValue({ id: 99 })

    const res = await createCustomerPriceList(fd({ ...base }))

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah ada/)
    expect(mocks.priceCreate).not.toHaveBeenCalled()
  })
})

describe("updateCustomerPriceList — serialisasi cek duplikat per item", () => {
  it("mengunci baris items FOR UPDATE sebelum cek duplikat di dalam tx", async () => {
    const res = await updateCustomerPriceList(11, fd({ ...base }))

    expect(res).toEqual({ success: true, id: 11 })
    expect(mocks.prismaMock.$transaction).toHaveBeenCalled()
    expect(firstLockedSql()).toMatch(/FROM items[\s\S]*FOR UPDATE/)
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.priceFindFirst.mock.invocationCallOrder[0],
    )
    expect(mocks.priceUpdate).toHaveBeenCalledTimes(1)
  })

  it("duplikat yang terlihat di bawah kunci ditolak tanpa update", async () => {
    mocks.priceFindFirst.mockResolvedValue({ id: 99 })

    const res = await updateCustomerPriceList(11, fd({ ...base }))

    expect(res.success).toBe(false)
    expect(mocks.priceUpdate).not.toHaveBeenCalled()
  })
})
