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
    $executeRaw: vi.fn().mockResolvedValue(1),
  }
  return {
    requirePermissionMock: vi.fn(),
    canViewSalaryAmounts: vi.fn(),
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a), hasPermission: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/auth/field-visibility", async (importOriginal) => {
  const actual = await importOriginal<any>()
  return { ...actual, canViewSalaryAmounts: (...a: any) => mocks.canViewSalaryAmounts(...a) }
})
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
  mocks.canViewSalaryAmounts.mockResolvedValue(true)
  mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
  mocks.prismaMock.employee.findUnique.mockResolvedValue(null)
  mocks.prismaMock.employee.create.mockResolvedValue({ id: 1, slug: "budi" })
  mocks.prismaMock.employee.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.department.findFirst.mockResolvedValue({ id: 7 })
  mocks.prismaMock.position.findFirst.mockResolvedValue({ id: 8 })
  mocks.prismaMock.user.findUnique.mockResolvedValue(null)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("BUGHUNT round3 MEDIUM: updateEmployee gerbang view_salary_amounts", () => {
  it("tanpa izin nominal: baseSalary TIDAK ditulis (bukan 0, bukan angka form)", async () => {
    mocks.canViewSalaryAmounts.mockResolvedValue(false)
    const res = await actions.updateEmployee(1, fd({ ...base, baseSalary: "9.999.999" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.employee.update).toHaveBeenCalledTimes(1)
    const data = mocks.prismaMock.employee.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("baseSalary")
    expect(data.name).toBe("Budi")
  })

  it("dengan izin nominal: baseSalary ditulis dari form", async () => {
    mocks.canViewSalaryAmounts.mockResolvedValue(true)
    const res = await actions.updateEmployee(1, fd({ ...base, baseSalary: "5.000.000" }))
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.employee.update.mock.calls[0][0].data
    expect(data.baseSalary).toBe(5000000)
  })

  it("create tanpa izin nominal: baseSalary tidak ditulis (default DB, bukan 0 form)", async () => {
    mocks.canViewSalaryAmounts.mockResolvedValue(false)
    const res = await actions.createEmployee(fd({ ...base, baseSalary: "9.999.999" }))
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.employee.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty("baseSalary")
  })
})
