import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    employee: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1, slug: "budi" }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    department: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
    position: { findFirst: vi.fn().mockResolvedValue({ id: 8 }) },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 3 }),
      update: vi.fn().mockResolvedValue({ id: 3 }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  }
  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a), hasPermission: vi.fn().mockResolvedValue(true) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("EMP-001") }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("budi") }))
vi.mock("@/lib/auth/hr-scope", () => ({ getHrScope: vi.fn().mockResolvedValue({ kind: "all" }) }))
vi.mock("bcryptjs", () => {
  const m = { hash: vi.fn().mockResolvedValue("hash"), compare: vi.fn().mockResolvedValue(true) }
  return { ...m, default: m }
})

import * as actions from "../master.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

const base = { name: "Budi", joinDate: "2024-01-15" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: [] })
  mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
  mocks.prismaMock.employee.findUnique.mockResolvedValue(null)
  mocks.prismaMock.employee.create.mockResolvedValue({ id: 1, slug: "budi" })
  mocks.prismaMock.employee.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.department.findFirst.mockResolvedValue({ id: 7 })
  mocks.prismaMock.position.findFirst.mockResolvedValue({ id: 8 })
  mocks.prismaMock.user.findUnique.mockResolvedValue(null)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("Employee departmentId/positionId wajib ada", () => {
  it("create tolak departmentId fiktif, tanpa create", async () => {
    mocks.prismaMock.department.findFirst.mockResolvedValue(null)
    const res = await actions.createEmployee(fd({ ...base, departmentId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Departemen tidak ditemukan/)
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()
  })

  it("create tolak positionId fiktif, tanpa create", async () => {
    mocks.prismaMock.position.findFirst.mockResolvedValue(null)
    const res = await actions.createEmployee(fd({ ...base, positionId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jabatan tidak ditemukan/)
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()
  })

  it("create lolos bila departemen+jabatan ada", async () => {
    const res = await actions.createEmployee(fd({ ...base, departmentId: "7", positionId: "8" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: 7, positionId: 8 }) }),
    )
  })

  it("create tanpa departemen/jabatan tetap lolos (opsional)", async () => {
    const res = await actions.createEmployee(fd({ ...base }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.department.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.position.findFirst).not.toHaveBeenCalled()
  })

  it("update tolak positionId fiktif, tanpa update", async () => {
    mocks.prismaMock.position.findFirst.mockResolvedValue(null)
    const res = await actions.updateEmployee(1, fd({ ...base, positionId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jabatan tidak ditemukan/)
    expect(mocks.prismaMock.employee.update).not.toHaveBeenCalled()
  })

  it("update tolak departmentId fiktif, tanpa update", async () => {
    mocks.prismaMock.department.findFirst.mockResolvedValue(null)
    const res = await actions.updateEmployee(1, fd({ ...base, departmentId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Departemen tidak ditemukan/)
    expect(mocks.prismaMock.employee.update).not.toHaveBeenCalled()
  })
})

describe("Employee baseSalary format Indonesia", () => {
  it("create: '5.000.000' tersimpan 5000000, bukan 5", async () => {
    const res = await actions.createEmployee(fd({ ...base, baseSalary: "5.000.000" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ baseSalary: 5000000 }) }),
    )
  })

  it("update: '5.000.000,50' tersimpan 5000000.5, bukan 0", async () => {
    const res = await actions.updateEmployee(1, fd({ ...base, baseSalary: "5.000.000,50" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ baseSalary: 5000000.5 }) }),
    )
  })
})
