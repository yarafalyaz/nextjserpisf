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
  reviewUpdateMany: vi.fn(),
  goalFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    performanceReview: {
      findFirst: mocks.reviewFindFirst,
      updateMany: mocks.reviewUpdateMany,
    },
    performanceGoal: { findMany: mocks.goalFindMany },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...original, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: async () => "test-slug" }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { finalizeReview, submitManagerReview, submitSelfReview } from "../performance.actions"

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
  mocks.goalFindMany.mockResolvedValue([])
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
})
