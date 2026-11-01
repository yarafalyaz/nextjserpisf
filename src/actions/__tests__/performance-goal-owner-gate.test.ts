import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  goalFindUnique: vi.fn(),
  goalUpdate: vi.fn(),
  goalCreate: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  cycleFindFirst: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    performanceGoal: {
      findUnique: mocks.goalFindUnique,
      update: mocks.goalUpdate,
      create: mocks.goalCreate,
    },
    employee: {
      findFirst: mocks.employeeFindFirst,
      findUnique: mocks.employeeFindUnique,
    },
    performanceCycle: { findFirst: mocks.cycleFindFirst },
  },
}))

const actor = { id: "7", roles: ["karyawan"], permissions: [] as string[] }
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: async () => actor,
  hasPermission: async () => true,
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: async () => "test-slug" }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { upsertPerformanceGoal } from "../performance.actions"

function fd(employeeId: string): FormData {
  const f = new FormData()
  f.set("cycleId", "3")
  f.set("employeeId", employeeId)
  f.set("title", "Sasaran")
  f.set("weight", "10")
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  actor.roles = ["karyawan"]
  actor.permissions = []
  mocks.employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
  mocks.goalCreate.mockResolvedValue({ id: 99, title: "Sasaran" })
  mocks.goalUpdate.mockResolvedValue({ id: 5, title: "Sasaran" })
  mocks.cycleFindFirst.mockResolvedValue({ status: "active" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("BUGHUNT round3 MEDIUM: upsertPerformanceGoal update cek pemilik existing", () => {
  it("update sasaran milik orang lain ditolak walau employeeId form = diri sendiri", async () => {
    mocks.goalFindUnique.mockResolvedValue({ employeeId: 8 })
    const res = await upsertPerformanceGoal(fd("7"), 5)
    expect(res.success).toBe(false)
    expect(mocks.goalFindUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { employeeId: true },
    })
    expect(mocks.goalUpdate).not.toHaveBeenCalled()
  })

  it("update sasaran tidak ditemukan ditolak tanpa update", async () => {
    mocks.goalFindUnique.mockResolvedValue(null)
    const res = await upsertPerformanceGoal(fd("7"), 404)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/tidak ditemukan/)
    expect(mocks.goalUpdate).not.toHaveBeenCalled()
  })

  it("update sasaran sendiri lolos", async () => {
    mocks.goalFindUnique.mockResolvedValue({ employeeId: 7 })
    const res = await upsertPerformanceGoal(fd("7"), 5)
    expect(res.success).toBe(true)
    expect(mocks.goalUpdate).toHaveBeenCalledTimes(1)
  })

  it("pindah ke karyawan luar scope ditolak (cek pemilik baru tetap jalan)", async () => {
    mocks.goalFindUnique.mockResolvedValue({ employeeId: 7 })
    const res = await upsertPerformanceGoal(fd("8"), 5)
    expect(res.success).toBe(false)
    expect(mocks.goalUpdate).not.toHaveBeenCalled()
  })

  it("create untuk diri sendiri tidak memuat goal existing", async () => {
    const res = await upsertPerformanceGoal(fd("7"))
    expect(res.success).toBe(true)
    expect(mocks.goalFindUnique).not.toHaveBeenCalled()
    expect(mocks.goalCreate).toHaveBeenCalledTimes(1)
  })

  it("regresi putaran 16: siklus closed menolak tulis sasaran", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "closed" })
    const res = await upsertPerformanceGoal(fd("7"))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/siklus aktif/)
    expect(mocks.goalCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 16: siklus draft menolak tulis sasaran", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "draft" })
    const res = await upsertPerformanceGoal(fd("7"))
    expect(res.success).toBe(false)
    expect(mocks.goalCreate).not.toHaveBeenCalled()
  })
})
