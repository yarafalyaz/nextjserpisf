/**
 * Falsifikasi TEMUAN-1/2 Business PR #959 atas salary-adjustment.actions.ts:
 * (1) scope HR wajib `all` di create/cancel/get (aktor department/self
 * ditolak walau punya permission + view_salary_amounts); (2) deskripsi
 * ActivityLog tidak memuat nominal gaji.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1, previousBaseSalary: 4_000_000 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  })
  const prismaMock: Record<string, any> = {
    salaryAdjustment: model(),
    employee: model(),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (ops: any) =>
      typeof ops === "function" ? ops(prismaMock) : Promise.all(ops),
    ),
  }
  return {
    prismaMock,
    requirePermissionMock: vi.fn(),
    canViewSalaryMock: vi.fn().mockResolvedValue(true),
    scopeOverride: { current: { kind: "all" as const } as unknown },
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: async () => mocks.scopeOverride.current,
}))
vi.mock("@/lib/auth/field-visibility", () => ({
  canViewSalaryAmounts: () => mocks.canViewSalaryMock(),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/salary-adjustment.service", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, applyDueSalaryAdjustments: vi.fn().mockResolvedValue(0) }
})

import * as actions from "../salary-adjustment.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.scopeOverride.current = { kind: "all" }
  mocks.requirePermissionMock.mockResolvedValue({ id: 99, roles: ["admin"] })
  mocks.canViewSalaryMock.mockResolvedValue(true)
  mocks.prismaMock.employee.findUniqueOrThrow.mockResolvedValue({
    baseSalary: 4_000_000,
    name: "Budi",
  })
  mocks.prismaMock.salaryAdjustment.create.mockResolvedValue({
    id: 1,
    previousBaseSalary: 4_000_000,
  })
  mocks.prismaMock.salaryAdjustment.findUnique.mockResolvedValue({ id: 1, status: "scheduled" })
  mocks.prismaMock.salaryAdjustment.updateMany.mockResolvedValue({ count: 1 })
  mocks.prismaMock.salaryAdjustment.findMany.mockResolvedValue([])
  mocks.prismaMock.$transaction.mockImplementation(async (ops: any) =>
    typeof ops === "function" ? ops(mocks.prismaMock) : Promise.all(ops),
  )
})

describe("TEMUAN-1: scope HR wajib all", () => {
  it("scope department ditolak di create/cancel/get", async () => {
    mocks.scopeOverride.current = { kind: "department", departmentId: 3, employeeId: 7 }
    const create = await actions.createSalaryAdjustment(
      fd({ employeeId: "7", newBaseSalary: "5000000", reason: "berkala", effectiveDate: todayWib() }),
    )
    expect(create.success).toBe(false)
    const cancel = await actions.cancelSalaryAdjustment(1)
    expect(cancel.success).toBe(false)
    const get = await actions.getSalaryAdjustments(7)
    expect(get.success).toBe(false)
    expect(mocks.prismaMock.salaryAdjustment.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salaryAdjustment.updateMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salaryAdjustment.findMany).not.toHaveBeenCalled()
  })

  it("scope self ditolak di create", async () => {
    mocks.scopeOverride.current = { kind: "self", employeeId: 7 }
    const create = await actions.createSalaryAdjustment(
      fd({ employeeId: "7", newBaseSalary: "5000000", reason: "berkala", effectiveDate: todayWib() }),
    )
    expect(create.success).toBe(false)
    expect(mocks.prismaMock.salaryAdjustment.create).not.toHaveBeenCalled()
  })

  it("scope all lolos create/cancel/get", async () => {
    const create = await actions.createSalaryAdjustment(
      fd({ employeeId: "7", newBaseSalary: "5000000", reason: "berkala", effectiveDate: todayWib() }),
    )
    expect(create.success).toBe(true)
    const cancel = await actions.cancelSalaryAdjustment(1)
    expect(cancel.success).toBe(true)
    const get = await actions.getSalaryAdjustments(7)
    expect(get.success).toBe(true)
  })
})

describe("TEMUAN-2: log tanpa nominal", () => {
  it("deskripsi ActivityLog tidak mengandung angka gaji", async () => {
    const create = await actions.createSalaryAdjustment(
      fd({ employeeId: "7", newBaseSalary: "5000000", reason: "berkala", effectiveDate: todayWib() }),
    )
    expect(create.success).toBe(true)
    expect(mocks.logActivityMock).toHaveBeenCalledTimes(1)
    const desc = String(mocks.logActivityMock.mock.calls[0][3])
    expect(desc).toContain("Budi")
    expect(desc).not.toMatch(/4000000|5000000|4\.000\.000|5\.000\.000/)
  })
})
