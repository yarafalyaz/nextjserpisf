import { beforeEach, describe, expect, it, vi } from "vitest"

const positionUpdate = vi.fn()
const candidateUpsert = vi.fn()
const candidateFindUnique = vi.fn()
const candidateDelete = vi.fn()
const employeeFindFirst = vi.fn()
const employeeFindUnique = vi.fn()
const positionFindMany = vi.fn()
const getHrScope = vi.fn()

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    employee: { findFirst: (...a: unknown[]) => employeeFindFirst(...a) },
    successionCandidate: { upsert: (...a: unknown[]) => candidateUpsert(...a) },
  }
  return {
    prisma: {
      position: { update: (...a: unknown[]) => positionUpdate(...a), findMany: (...a: unknown[]) => positionFindMany(...a) },
      successionCandidate: {
        upsert: (...a: unknown[]) => candidateUpsert(...a),
        findUnique: (...a: unknown[]) => candidateFindUnique(...a),
        delete: (...a: unknown[]) => candidateDelete(...a),
      },
      employee: {
        findFirst: (...a: unknown[]) => employeeFindFirst(...a),
        findUnique: (...a: unknown[]) => employeeFindUnique(...a),
      },
      $transaction: (fn: (txArg: unknown) => unknown) => fn(tx),
    },
  }
})

vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...actual, getHrScope: (...a: unknown[]) => getHrScope(...a) }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: async () => ({ id: "9", roles: ["ga"] }),
  hasPermission: async () => true,
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { computeSuccessionCoverage } from "@/lib/hr/hcms-scoring"
import {
  getSuccessionOverview,
  removeSuccessorCandidate,
  setPositionCritical,
  upsertSuccessorCandidate,
} from "../succession.actions"

beforeEach(() => {
  vi.clearAllMocks()
  getHrScope.mockResolvedValue({ kind: "all" })
})

describe("succession coverage", () => {
  it("derives coverage from readiness", () => {
    expect(computeSuccessionCoverage([])).toBe("vacant")
    expect(computeSuccessionCoverage([{ readiness: "ready_future" }])).toBe("at_risk")
    expect(computeSuccessionCoverage([{ readiness: "ready_1_2_years" }])).toBe("at_risk")
    expect(
      computeSuccessionCoverage([
        { readiness: "ready_future" },
        { readiness: "ready_now" },
      ]),
    ).toBe("covered")
  })
})

describe("successor candidates", () => {
  it("marks a position critical", async () => {
    positionUpdate.mockResolvedValue({})
    const res = await setPositionCritical(3, true)
    expect(res.success).toBe(true)
    expect(positionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isCritical: true } }),
    )
  })

  it("rejects the incumbent as their own successor", async () => {
    employeeFindFirst.mockResolvedValue({ id: 10, positionId: 3 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "10")
    fd.set("readiness", "ready_now")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("pemegang jabatan")
    expect(candidateUpsert).not.toHaveBeenCalled()
  })

  it("scope department menolak kandidat luar departemen, upsert tidak dipanggil", async () => {
    getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "11")
    fd.set("readiness", "ready_now")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(candidateUpsert).not.toHaveBeenCalled()
  })

  it("scope self menolak kandidat lain, upsert tidak dipanggil", async () => {
    getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "11")
    fd.set("readiness", "ready_now")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(false)
    expect(candidateUpsert).not.toHaveBeenCalled()
  })

  it("kandidat sah di jabatan lain tetap tersimpan", async () => {
    employeeFindFirst.mockResolvedValue({ id: 11, positionId: 8 })
    candidateUpsert.mockResolvedValue({ id: 5 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "11")
    fd.set("readiness", "ready_now")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(true)
    expect(candidateUpsert).toHaveBeenCalled()
  })

  it("overview: scope department menyaring jabatan + kandidat per scope", async () => {
    getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    positionFindMany.mockResolvedValue([])
    await getSuccessionOverview()
    const arg = positionFindMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ isCritical: true, departmentId: 3 })
    expect(arg.include.employees.where).toMatchObject({ departmentId: 3 })
    expect(arg.include.successionCandidates.where).toEqual({ candidate: { departmentId: 3 } })
  })

  it("overview: scope all tanpa saringan (perilaku lama)", async () => {
    positionFindMany.mockResolvedValue([])
    await getSuccessionOverview()
    const arg = positionFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ isCritical: true })
    expect(arg.include.successionCandidates.where).toEqual({ candidate: {} })
  })

  it("remove: scope department menolak kandidat luar departemen, delete tidak dipanggil", async () => {
    getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    candidateFindUnique.mockResolvedValue({ candidateEmployeeId: 11 })
    employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const res = await removeSuccessorCandidate(5)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(candidateDelete).not.toHaveBeenCalled()
  })

  it("remove: scope self menolak kandidat lain, delete tidak dipanggil", async () => {
    getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    candidateFindUnique.mockResolvedValue({ candidateEmployeeId: 11 })
    const res = await removeSuccessorCandidate(5)
    expect(res.success).toBe(false)
    expect(candidateDelete).not.toHaveBeenCalled()
  })

  it("remove: scope all tetap lolos menghapus kandidat", async () => {
    candidateFindUnique.mockResolvedValue({ candidateEmployeeId: 11 })
    candidateDelete.mockResolvedValue({})
    const res = await removeSuccessorCandidate(5)
    expect(res.success).toBe(true)
    expect(candidateDelete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it("upserts a valid candidate", async () => {
    employeeFindFirst.mockResolvedValue({ id: 11, positionId: 8 })
    candidateUpsert.mockResolvedValue({ id: 5 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "11")
    fd.set("readiness", "ready_1_2_years")
    fd.set("rank", "1")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(true)
    expect(candidateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          positionId_candidateEmployeeId: { positionId: 3, candidateEmployeeId: 11 },
        },
      }),
    )
  })
})
