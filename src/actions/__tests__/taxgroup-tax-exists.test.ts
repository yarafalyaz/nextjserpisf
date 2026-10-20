import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  prismaMock: {
    taxGroup: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    taxGroupTax: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tax: { findMany: vi.fn().mockResolvedValue([{ id: 1 }]) },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("grup") }))
vi.mock("@/lib/auth/hr-scope", () => ({ getHrScope: vi.fn().mockResolvedValue(null) }))
vi.mock("bcryptjs", () => { const m = { hash: vi.fn().mockResolvedValue("h"), compare: vi.fn().mockResolvedValue(true) }; return { ...m, default: m } })

import * as actions from "../master.actions"

function fd(name: string, ids: string[]): FormData {
  const f = new FormData()
  f.set("name", name)
  for (const id of ids) f.append("taxIds", id)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.taxGroup.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.taxGroup.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.taxGroupTax.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prismaMock.tax.findMany.mockImplementation(async ({ where }: any) => where.id.in.filter((id: number) => id === 1).map((id: number) => ({ id })))
  mocks.prismaMock.$transaction.mockImplementation(async (ops: any) => Array.isArray(ops) ? Promise.all(ops) : ops(mocks.prismaMock))
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("TaxGroup taxIds wajib ada & aktif", () => {
  it("create tolak taxId fiktif tanpa create", async () => {
    const res = await actions.createTaxGroup(fd("Grup", ["999"]))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/tidak ditemukan atau nonaktif/)
    expect(mocks.prismaMock.taxGroup.create).not.toHaveBeenCalled()
  })

  it("create tolak campuran valid+fiktif tanpa create", async () => {
    const res = await actions.createTaxGroup(fd("Grup", ["1", "999"]))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.taxGroup.create).not.toHaveBeenCalled()
  })

  it("create tolak pajak terhapus (findMany kosong)", async () => {
    mocks.prismaMock.tax.findMany.mockResolvedValueOnce([])
    const res = await actions.createTaxGroup(fd("Grup", ["1"]))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.taxGroup.create).not.toHaveBeenCalled()
  })

  it("create lolos bila semua pajak ada", async () => {
    const res = await actions.createTaxGroup(fd("Grup", ["1"]))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.tax.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [1] }, deletedAt: null }) }))
    expect(mocks.prismaMock.taxGroup.create).toHaveBeenCalled()
  })

  it("create dedup taxIds duplikat", async () => {
    const res = await actions.createTaxGroup(fd("Grup", ["1", "1"]))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.taxGroup.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ taxes: { create: [{ taxId: 1 }] } }) }))
  })

  it("update tolak taxId fiktif tanpa deleteMany/update", async () => {
    const res = await actions.updateTaxGroup(1, fd("Grup", ["999"]))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.taxGroupTax.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.taxGroup.update).not.toHaveBeenCalled()
  })

  it("update lolos bila pajak ada", async () => {
    const res = await actions.updateTaxGroup(1, fd("Grup", ["1"]))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.taxGroupTax.deleteMany).toHaveBeenCalled()
  })
})
