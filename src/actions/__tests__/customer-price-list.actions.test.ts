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
  const itemFindFirst = vi.fn()
  const categoryFindFirst = vi.fn()

  const idemCreate = vi.fn()
  const idemFindUnique = vi.fn()
  const idemUpdateMany = vi.fn()

  const prismaMock: any = {
    customerPriceList: {
      findFirst: priceFindFirst,
      findUnique: priceFindUnique,
      create: priceCreate,
      update: priceUpdate,
    },
    item: { findFirst: itemFindFirst },
    customerCategory: { findFirst: categoryFindFirst },
    idempotencyKey: { create: idemCreate, findUnique: idemFindUnique, updateMany: idemUpdateMany },
    $queryRaw: queryRaw,
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock))

  return {
    queryRaw,
    priceFindFirst,
    priceFindUnique,
    priceCreate,
    priceUpdate,
    itemFindFirst,
    categoryFindFirst,
    idemCreate,
    idemFindUnique,
    idemUpdateMany,
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

function lockedSqlAt(index: number): string {
  const arg = mocks.queryRaw.mock.calls[index]?.[0] as unknown
  if (Array.isArray(arg)) return arg.join("?")
  const obj = arg as { sql?: string; strings?: string[] }
  return obj?.sql ?? obj?.strings?.join("?") ?? ""
}

function firstLockedSql(): string {
  return lockedSqlAt(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.queryRaw.mockResolvedValue([{ id: 7 }])
  mocks.itemFindFirst.mockResolvedValue({ id: 7 })
  mocks.categoryFindFirst.mockResolvedValue({ id: 3 })
  mocks.priceFindFirst.mockResolvedValue(null)
  mocks.priceFindUnique.mockResolvedValue({ id: 11 })
  mocks.priceCreate.mockResolvedValue({ id: 21 })
  mocks.priceUpdate.mockResolvedValue({})
  mocks.idemCreate.mockResolvedValue({})
  mocks.idemFindUnique.mockResolvedValue(null)
  mocks.idemUpdateMany.mockResolvedValue({ count: 0 })
})

describe("putaran 87: idempotency createCustomerPriceList", () => {
  it("key segar tercatat per user dan create berjalan", async () => {
    const res = await createCustomerPriceList(fd({ ...base, idempotencyKey: "key-1" }))
    expect(res.success).toBe(true)
    expect(mocks.idemCreate).toHaveBeenCalledWith({ data: { key: "1:key-1" } })
    expect(mocks.priceCreate).toHaveBeenCalled()
  })

  it("retry key sama (P2002, masih segar) ditolak sebelum create baris kedua", async () => {
    const p2002 = Object.assign(new Error("unique"), { code: "P2002" })
    mocks.idemCreate.mockRejectedValue(p2002)
    mocks.idemFindUnique.mockResolvedValue({ createdAt: new Date() })
    const res = await createCustomerPriceList(fd({ ...base, idempotencyKey: "key-1" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/duplikat/i)
    expect(mocks.priceCreate).not.toHaveBeenCalled()
  })

  it("tanpa key: perilaku lama (create berjalan, tak ada klaim idempotency)", async () => {
    const res = await createCustomerPriceList(fd(base))
    expect(res.success).toBe(true)
    expect(mocks.idemCreate).not.toHaveBeenCalled()
    expect(mocks.priceCreate).toHaveBeenCalled()
  })
})

describe("putaran 68: gerbang hidup barang/kategori harga pelanggan", () => {
  it("create menolak barang nonaktif/terhapus yang dinilai sesudah kunci baris items", async () => {
    mocks.itemFindFirst.mockResolvedValue(null)
    const res = await createCustomerPriceList(fd({ ...base, customerCategoryId: "3" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Barang tidak ditemukan atau tidak aktif/)
    expect(mocks.itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, deletedAt: null, isActive: true },
        select: { id: true },
      }),
    )
    expect(mocks.priceCreate).not.toHaveBeenCalled()
  })

  it("create menolak kategori pelanggan nonaktif/terhapus", async () => {
    mocks.categoryFindFirst.mockResolvedValue(null)
    const res = await createCustomerPriceList(fd({ ...base, customerCategoryId: "3" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Kategori pelanggan tidak ditemukan atau tidak aktif/)
    expect(mocks.categoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3, deletedAt: null, isActive: true },
        select: { id: true },
      }),
    )
    expect(mocks.priceCreate).not.toHaveBeenCalled()
  })

  it("create tanpa kategori hanya menilai barang hidup", async () => {
    const res = await createCustomerPriceList(fd({ ...base }))
    expect(res).toEqual({ success: true, id: 21 })
    expect(mocks.categoryFindFirst).not.toHaveBeenCalled()
    expect(mocks.priceCreate).toHaveBeenCalledTimes(1)
  })

  it("update menolak barang mati sebelum update", async () => {
    mocks.itemFindFirst.mockResolvedValue(null)
    const res = await updateCustomerPriceList(11, fd({ ...base }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Barang tidak ditemukan atau tidak aktif/)
    expect(mocks.priceUpdate).not.toHaveBeenCalled()
  })

  it("update menolak kategori mati sebelum update", async () => {
    mocks.categoryFindFirst.mockResolvedValue(null)
    const res = await updateCustomerPriceList(11, fd({ ...base, customerCategoryId: "3" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Kategori pelanggan tidak ditemukan atau tidak aktif/)
    expect(mocks.priceUpdate).not.toHaveBeenCalled()
  })

  it("regresi putaran 101: update menolak tanggal berakhir lampau (BR-PX-06 paritas create)", async () => {
    const res = await updateCustomerPriceList(11, fd({ ...base, expiresAt: "2020-01-01" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Tanggal berakhir sudah lewat/)
    expect(mocks.priceUpdate).not.toHaveBeenCalled()
  })

  it("regresi putaran 101: create/update mengunci baris kategori sebelum baca hidup (pasangan kunci deleteCustomerCategory)", async () => {
    const created = await createCustomerPriceList(fd({ ...base, customerCategoryId: "3" }))
    expect(created.success).toBe(true)
    expect(lockedSqlAt(1)).toMatch(/FROM customer_categories[\s\S]*FOR UPDATE/)
    expect(mocks.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.categoryFindFirst.mock.invocationCallOrder[0],
    )

    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.queryRaw.mockResolvedValue([{ id: 7 }])
    mocks.itemFindFirst.mockResolvedValue({ id: 7 })
    mocks.categoryFindFirst.mockResolvedValue({ id: 3 })
    mocks.priceFindFirst.mockResolvedValue(null)
    mocks.priceFindUnique.mockResolvedValue({ id: 11 })
    mocks.priceUpdate.mockResolvedValue({})
    const updated = await updateCustomerPriceList(11, fd({ ...base, customerCategoryId: "3" }))
    expect(updated.success).toBe(true)
    expect(lockedSqlAt(1)).toMatch(/FROM customer_categories[\s\S]*FOR UPDATE/)
    expect(mocks.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.categoryFindFirst.mock.invocationCallOrder[0],
    )
  })
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
