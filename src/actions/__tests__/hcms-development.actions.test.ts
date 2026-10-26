import { beforeEach, describe, expect, it, vi } from "vitest"

const cycleCreate = vi.fn()
const cycleFindFirst = vi.fn()
const goalCreate = vi.fn()
const goalFindMany = vi.fn()
const reviewFindFirst = vi.fn()
const reviewCreate = vi.fn()
const reviewUpdate = vi.fn()
const employeeFindFirst = vi.fn()
const employeeFindUnique = vi.fn()
const employeeFindMany = vi.fn()
const positionCompetencyFindMany = vi.fn()
const employeeCompetencyFindMany = vi.fn()
const participantUpsert = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    performanceCycle: {
      create: (...a: unknown[]) => cycleCreate(...a),
      findFirst: (...a: unknown[]) => cycleFindFirst(...a),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    performanceGoal: {
      create: (...a: unknown[]) => goalCreate(...a),
      findMany: (...a: unknown[]) => goalFindMany(...a),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ employeeId: 7 })),
    },
    performanceReview: {
      findFirst: (...a: unknown[]) => reviewFindFirst(...a),
      create: (...a: unknown[]) => reviewCreate(...a),
      update: (...a: unknown[]) => reviewUpdate(...a),
    },
    employee: {
      findFirst: (...a: unknown[]) => employeeFindFirst(...a),
      findUnique: (...a: unknown[]) => employeeFindUnique(...a),
      findMany: (...a: unknown[]) => employeeFindMany(...a),
    },
    positionCompetency: {
      findMany: (...a: unknown[]) => positionCompetencyFindMany(...a),
    },
    employeeCompetency: {
      findMany: (...a: unknown[]) => employeeCompetencyFindMany(...a),
    },
    trainingParticipant: {
      upsert: (...a: unknown[]) => participantUpsert(...a),
    },
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

import { computeWeightedScore } from "@/lib/hr/hcms-scoring"
import {
  finalizeReview,
  submitManagerReview,
  submitSelfReview,
} from "../performance.actions"
import {
  addTrainingParticipant,
  getCompetencyGaps,
} from "../development.actions"

beforeEach(() => {
  vi.clearAllMocks()
  actor.roles = ["karyawan"]
  actor.permissions = []
})

describe("performance scoring", () => {
  it("computes the weighted average of scored goals only", () => {
    expect(
      computeWeightedScore([
        { score: 80, weight: 1 },
        { score: 100, weight: 3 },
        { score: null, weight: 5 },
      ]),
    ).toBe(95)
    expect(computeWeightedScore([{ score: null, weight: 1 }])).toBeNull()
    expect(computeWeightedScore([])).toBeNull()
  })

  it("finalize uses the weighted goal score", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
    reviewFindFirst.mockResolvedValue({
      id: 11,
      status: "manager_reviewed",
      managerScore: 70,
      reviewerEmployeeId: null,
    })
    goalFindMany.mockResolvedValue([
      { score: 80, weight: 1 },
      { score: 100, weight: 1 },
    ])
    const res = await finalizeReview(3, 7)
    expect(res.success).toBe(true)
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalScore: 90, status: "finalized" }),
      }),
    )
  })

  it("a self-scoped employee cannot submit a manager review for someone else", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
    const res = await submitManagerReview(3, 8, { managerScore: 90 })
    expect(res.success).toBe(false)
    expect(reviewUpdate).not.toHaveBeenCalled()
  })

  it("self review is accepted for the employee's own record", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
    reviewFindFirst.mockResolvedValue({ id: 11, status: "draft" })
    const res = await submitSelfReview(3, 7, 88)
    expect(res.success).toBe(true)
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selfScore: 88, status: "self_submitted" }),
      }),
    )
  })
})

describe("competency gaps and training", () => {
  it("computes gaps against the position requirements", async () => {
    employeeFindUnique.mockResolvedValue({ positionId: 2 })
    positionCompetencyFindMany.mockResolvedValue([
      { competencyId: 1, requiredLevel: 4, competency: { name: "Pengelasan" }, position: { name: "Welder" } },
      { competencyId: 2, requiredLevel: 2, competency: { name: "K3" }, position: { name: "Welder" } },
    ])
    employeeCompetencyFindMany.mockResolvedValue([{ competencyId: 1, level: 3 }])
    const gaps = await getCompetencyGaps(7)
    expect(gaps).toEqual([
      { competencyId: 1, competencyName: "Pengelasan", requiredLevel: 4, currentLevel: 3, gap: 1 },
      { competencyId: 2, competencyName: "K3", requiredLevel: 2, currentLevel: 0, gap: 2 },
    ])
  })

  it("registers a training participant idempotently", async () => {
    participantUpsert.mockResolvedValue({ id: 5 })
    const fd = new FormData()
    fd.set("trainingId", "3")
    fd.set("employeeId", "7")
    const res = await addTrainingParticipant(fd)
    expect(res.success).toBe(true)
    expect(participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trainingId_employeeId: { trainingId: 3, employeeId: 7 } },
      }),
    )
  })
})
