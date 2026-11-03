import { beforeEach, describe, expect, it, vi } from "vitest"

const cycleCreate = vi.fn()
const cycleFindFirst = vi.fn()
const goalCreate = vi.fn()
const goalFindMany = vi.fn()
const reviewFindFirst = vi.fn()
const reviewCreate = vi.fn()
const reviewUpdate = vi.fn()
const reviewUpdateMany = vi.fn(async (..._a: unknown[]) => ({ count: 1 }))
const employeeFindFirst = vi.fn()
const employeeFindUnique = vi.fn()
const employeeFindMany = vi.fn()
const positionCompetencyFindMany = vi.fn()
const employeeCompetencyFindMany = vi.fn()
const participantUpsert = vi.fn()
const trainingCreate = vi.fn()
const trainingFindFirst = vi.fn()
const trainingUpdateMany = vi.fn()
const checkIdempotencyMock = vi.fn()

vi.mock("@/lib/db/prisma", () => {
  const prisma: Record<string, unknown> = {
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
      updateMany: (...a: unknown[]) => reviewUpdateMany(...a),
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
    training: {
      create: (...a: unknown[]) => trainingCreate(...a),
      findFirst: (...a: unknown[]) => trainingFindFirst(...a),
      updateMany: (...a: unknown[]) => trainingUpdateMany(...a),
    },
    trainingParticipant: {
      upsert: (...a: unknown[]) => participantUpsert(...a),
    },
  }
  prisma.$transaction = vi.fn((cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
  )
  return { prisma }
})
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: (...a: unknown[]) => checkIdempotencyMock(...a),
}))

const actor = { id: "7", roles: ["karyawan"], permissions: [] as string[] }
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: async () => actor,
  hasPermission: async () => true,
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: async () => "test-slug",
  nextSlugWithClient: async () => "test-slug",
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { computeWeightedScore } from "@/lib/hr/hcms-scoring"
import {
  createPerformanceCycle,
  finalizeReview,
  submitManagerReview,
  submitSelfReview,
} from "../performance.actions"
import {
  addTrainingParticipant,
  createTraining,
  getCompetencyGaps,
  setTrainingStatus,
} from "../development.actions"

beforeEach(() => {
  vi.clearAllMocks()
  actor.roles = ["karyawan"]
  actor.permissions = []
  // Gerbang siklus putaran 16: tulis ulasan hanya pada siklus aktif.
  cycleFindFirst.mockResolvedValue({ status: "active" })
  checkIdempotencyMock.mockResolvedValue(undefined)
  trainingCreate.mockResolvedValue({ id: 11, title: "Pelatihan K3", slug: "pelatihan-k3" })
  trainingFindFirst.mockResolvedValue({ id: 3, status: "scheduled", deletedAt: null })
  trainingUpdateMany.mockResolvedValue({ count: 1 })
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
    expect(reviewUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalScore: 90, status: "finalized" }),
      }),
    )
  })

  it("a self-scoped employee cannot submit a manager review for someone else", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
    const res = await submitManagerReview(3, 8, { managerScore: 90 })
    expect(res.success).toBe(false)
    expect(reviewUpdateMany).not.toHaveBeenCalled()
  })

  it("self review is accepted for the employee's own record", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 1 })
    reviewFindFirst.mockResolvedValue({ id: 11, status: "draft" })
    const res = await submitSelfReview(3, 7, 88)
    expect(res.success).toBe(true)
    expect(reviewUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selfScore: 88, status: "self_submitted" }),
      }),
    )
  })
})

describe("tanggal siklus & pelatihan (putaran 100)", () => {
  it("siklus dengan tanggal fiktif 2026-02-30 ditolak tanpa create", async () => {
    const form = new FormData()
    form.set("name", "Siklus 2026")
    form.set("periodStart", "2026-02-30")
    form.set("periodEnd", "2026-12-31")
    const res = await createPerformanceCycle(form)
    expect(res.success).toBe(false)
    expect(cycleCreate).not.toHaveBeenCalled()
  })

  it("siklus rentang terbalik ditolak tanpa create", async () => {
    const form = new FormData()
    form.set("name", "Siklus 2026")
    form.set("periodStart", "2026-12-31")
    form.set("periodEnd", "2026-01-01")
    const res = await createPerformanceCycle(form)
    expect(res.success).toBe(false)
    expect(cycleCreate).not.toHaveBeenCalled()
  })

  it("pelatihan rentang terbalik ditolak tanpa create", async () => {
    const form = new FormData()
    form.set("title", "Pelatihan K3")
    form.set("startDate", "2026-11-20")
    form.set("endDate", "2026-11-10")
    const res = await createTraining(form)
    expect(res.success).toBe(false)
    expect(trainingCreate).not.toHaveBeenCalled()
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

  it("regresi putaran 51: transisi pelatihan kalah klaim kondisional ditolak", async () => {
    trainingUpdateMany.mockResolvedValue({ count: 0 })
    const res = await setTrainingStatus(3, "done")
    expect(res.success).toBe(false)
    expect(trainingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3, deletedAt: null, status: "scheduled" },
        data: { status: "done" },
      }),
    )
  })

  it("putaran 68: createTraining retry identik ditahan klaim idempotency di dalam tx, tanpa pelatihan kedua", async () => {
    checkIdempotencyMock.mockRejectedValueOnce(new Error("Permintaan duplikat terdeteksi. Transaksi ini sedang atau telah diproses."))
    const form = new FormData()
    form.set("title", "Pelatihan K3")
    form.set("startDate", "2026-11-10")
    form.set("idempotencyKey", "trn-1")

    const res = await createTraining(form)

    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toMatch(/duplikat/)
    expect(checkIdempotencyMock).toHaveBeenCalledWith("trn-1", expect.anything(), "7")
    expect(trainingCreate).not.toHaveBeenCalled()
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
