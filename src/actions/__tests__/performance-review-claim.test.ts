import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Transisi ulasan kinerja wajib klaim kondisional: submit self/manager tidak
 * boleh menimpa baris finalized dari snapshot basi, dan finalize tidak boleh
 * menyimpan finalScore bila status berubah di jendela baca->tulis.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  reviewFindFirst: vi.fn(),
  reviewCreate: vi.fn(),
  reviewUpdateMany: vi.fn(),
  goalFindUnique: vi.fn(),
  goalFindMany: vi.fn(),
  goalCreate: vi.fn(),
  goalUpdate: vi.fn(),
  goalDelete: vi.fn(),
  cycleFindFirst: vi.fn(),
  cycleCreate: vi.fn(),
  cycleUpdateMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  checkIdempotency: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $executeRaw: (...args: unknown[]) => mocks.executeRaw(...args),
    performanceReview: {
      findFirst: mocks.reviewFindFirst,
      create: mocks.reviewCreate,
      updateMany: mocks.reviewUpdateMany,
    },
    performanceGoal: {
      findUnique: mocks.goalFindUnique,
      findMany: mocks.goalFindMany,
      create: mocks.goalCreate,
      update: mocks.goalUpdate,
      delete: mocks.goalDelete,
    },
    performanceCycle: {
      findFirst: mocks.cycleFindFirst,
      create: mocks.cycleCreate,
      updateMany: mocks.cycleUpdateMany,
    },
    idempotencyKey: { create: vi.fn().mockResolvedValue({}) },
  }
  return {
    prisma: {
      ...tx,
      performanceCycle: {
        findFirst: mocks.cycleFindFirst,
        create: mocks.cycleCreate,
        updateMany: mocks.cycleUpdateMany,
      },
      $transaction: (fn: (client: unknown) => unknown) => mocks.transaction(fn),
    },
  }
})
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...original, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlugWithClient: async () => "test-slug",
}))
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: (...args: unknown[]) => mocks.checkIdempotency(...args),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import {
  createPerformanceCycle,
  deletePerformanceGoal,
  finalizeReview,
  setPerformanceCycleStatus,
  submitManagerReview,
  submitSelfReview,
  upsertPerformanceGoal,
} from "../performance.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["ga"] })
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.reviewFindFirst.mockResolvedValue({
    id: 5,
    status: "self_submitted",
    managerScore: 80,
    reviewerEmployeeId: 3,
  })
  mocks.reviewUpdateMany.mockResolvedValue({ count: 1 })
  mocks.reviewCreate.mockResolvedValue({ id: 5, status: "draft" })
  mocks.goalFindMany.mockResolvedValue([])
  mocks.goalFindUnique.mockResolvedValue({ employeeId: 2, cycleId: 1 })
  mocks.goalCreate.mockResolvedValue({ id: 9, title: "Sasaran" })
  mocks.goalUpdate.mockResolvedValue({ id: 9, title: "Sasaran" })
  mocks.goalDelete.mockResolvedValue({})
  mocks.cycleFindFirst.mockResolvedValue({ id: 1, status: "active" })
  mocks.cycleCreate.mockResolvedValue({ id: 1, name: "Siklus", slug: "siklus" })
  mocks.cycleUpdateMany.mockResolvedValue({ count: 1 })
  mocks.executeRaw.mockResolvedValue(1)
  mocks.checkIdempotency.mockResolvedValue(undefined)
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRaw: mocks.executeRaw,
      performanceReview: {
        findFirst: mocks.reviewFindFirst,
        create: mocks.reviewCreate,
        updateMany: mocks.reviewUpdateMany,
      },
      performanceGoal: {
        findUnique: mocks.goalFindUnique,
        findMany: mocks.goalFindMany,
        create: mocks.goalCreate,
        update: mocks.goalUpdate,
        delete: mocks.goalDelete,
      },
      performanceCycle: {
        findFirst: mocks.cycleFindFirst,
        create: mocks.cycleCreate,
        updateMany: mocks.cycleUpdateMany,
      },
    }),
  )
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("klaim transisi ulasan kinerja", () => {
  it("submit manager memakai klaim status bukan finalized", async () => {
    const res = await submitManagerReview(1, 2, { managerScore: 90 })
    expect(res.success).toBe(true)
    expect(mocks.reviewUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, status: { not: "finalized" } },
        data: expect.objectContaining({ managerScore: 90, status: "manager_reviewed" }),
      }),
    )
  })

  it("submit manager kalah klaim dari finalisasi konkuren ditolak", async () => {
    mocks.reviewUpdateMany.mockResolvedValue({ count: 0 })
    const res = await submitManagerReview(1, 2, { managerScore: 90 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/difinalisasi/)
  })

  it("submit self kalah klaim dari finalisasi konkuren ditolak", async () => {
    mocks.reviewUpdateMany.mockResolvedValue({ count: 0 })
    const res = await submitSelfReview(1, 2, 75)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/difinalisasi/)
  })

  it("finalize mengklaim dari status terbaca; kalah klaim ditolak", async () => {
    mocks.reviewUpdateMany.mockResolvedValue({ count: 0 })
    const res = await finalizeReview(1, 2)
    expect(res.success).toBe(false)
    expect(mocks.reviewUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, status: "self_submitted" },
        data: expect.objectContaining({ status: "finalized" }),
      }),
    )
  })

  it("finalize lolos memakai skor atasan dari bacaan", async () => {
    const res = await finalizeReview(1, 2)
    expect(res).toMatchObject({ success: true, finalScore: 80 })
  })

  it("regresi putaran 16: siklus closed menolak submit dan finalisasi ulasan", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "closed" })
    const selfRes = await submitSelfReview(1, 2, 75)
    expect(selfRes.success).toBe(false)
    if (!selfRes.success) expect(selfRes.error).toMatch(/siklus aktif/)
    const mgrRes = await submitManagerReview(1, 2, { managerScore: 90 })
    expect(mgrRes.success).toBe(false)
    const finRes = await finalizeReview(1, 2)
    expect(finRes.success).toBe(false)
    expect(mocks.reviewUpdateMany).not.toHaveBeenCalled()
  })

  it("regresi putaran 16: siklus draft menolak submit ulasan", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "draft" })
    const res = await submitSelfReview(1, 2, 75)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/siklus aktif/)
    expect(mocks.reviewUpdateMany).not.toHaveBeenCalled()
  })

  it("putaran 78: transisi siklus diklaim dari status terbaca; klaim kalah ditolak", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ id: 1, status: "active" })
    mocks.cycleUpdateMany.mockResolvedValue({ count: 0 })
    const res = await setPerformanceCycleStatus(1, "closed")
    expect(res.success).toBe(false)
    expect(mocks.cycleUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: null, status: "active" },
      data: { status: "closed" },
    })
  })

  it("putaran 78: siklus closed di bacaan berkunci menolak tulis sasaran", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "closed" })
    const fd = new FormData()
    fd.set("cycleId", "1")
    fd.set("employeeId", "2")
    fd.set("title", "Sasaran")
    fd.set("weight", "10")
    const res = await upsertPerformanceGoal(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/siklus aktif/)
    expect(mocks.goalCreate).not.toHaveBeenCalled()
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cycleFindFirst.mock.invocationCallOrder[0],
    )
  })

  it("putaran 78: hapus sasaran pada siklus closed ditolak sesudah kunci", async () => {
    mocks.cycleFindFirst.mockResolvedValue({ status: "closed" })
    const res = await deletePerformanceGoal(9)
    expect(res.success).toBe(false)
    expect(mocks.goalDelete).not.toHaveBeenCalled()
  })

  it("putaran 78: create review kalah P2002 memakai review pemenang", async () => {
    mocks.reviewFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 5, status: "draft", managerScore: null, reviewerEmployeeId: null })
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    mocks.reviewCreate.mockRejectedValue(p2002)
    const res = await submitSelfReview(1, 2, 75)
    expect(res.success).toBe(true)
    expect(mocks.reviewUpdateMany).toHaveBeenCalled()
  })

  it("putaran 78: createPerformanceCycle memakai idempotency + slug delegate tx", async () => {
    const fd = new FormData()
    fd.set("name", "Semester 1 2026")
    fd.set("periodStart", "2026-01-01")
    fd.set("periodEnd", "2026-06-30")
    fd.set("idempotencyKey", "cycle-1")
    const res = await createPerformanceCycle(fd)
    expect(res.success).toBe(true)
    expect(mocks.checkIdempotency).toHaveBeenCalledWith("cycle-1", expect.anything(), "7")
    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.cycleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "test-slug", status: "draft" }),
    })
  })
})
