import { beforeEach, describe, expect, it, vi } from "vitest"

const positionUpdate = vi.fn()
const candidateUpsert = vi.fn()
const employeeFindFirst = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    position: { update: (...a: unknown[]) => positionUpdate(...a) },
    successionCandidate: {
      upsert: (...a: unknown[]) => candidateUpsert(...a),
      delete: vi.fn(async () => ({})),
    },
    employee: { findFirst: (...a: unknown[]) => employeeFindFirst(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: async () => ({ id: "9", roles: ["ga"] }),
  hasPermission: async () => true,
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { computeSuccessionCoverage } from "@/lib/hr/hcms-scoring"
import {
  setPositionCritical,
  upsertSuccessorCandidate,
} from "../succession.actions"

beforeEach(() => {
  vi.clearAllMocks()
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
    employeeFindFirst.mockResolvedValueOnce({ id: 10 })
    const fd = new FormData()
    fd.set("positionId", "3")
    fd.set("candidateEmployeeId", "10")
    fd.set("readiness", "ready_now")
    const res = await upsertSuccessorCandidate(fd)
    expect(res.success).toBe(false)
    expect(candidateUpsert).not.toHaveBeenCalled()
  })

  it("upserts a valid candidate", async () => {
    employeeFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 11 })
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
