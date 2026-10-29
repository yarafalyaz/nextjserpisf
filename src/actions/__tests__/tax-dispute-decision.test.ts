import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  logActivity: vi.fn(),
  assertPeriodOpen: vi.fn(),
  queryRaw: vi.fn(),
  txAssessmentFindFirst: vi.fn(),
  txAssessmentUpdate: vi.fn(),
  txStepFindUnique: vi.fn(),
  txStepCreate: vi.fn(),
  txStepFindMany: vi.fn(),
  txStepUpdateMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: mocks.assertPeriodOpen,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    taxAssessment: {
      findFirst: mocks.txAssessmentFindFirst,
      update: mocks.txAssessmentUpdate,
    },
    taxDisputeStep: {
      findUnique: mocks.txStepFindUnique,
      create: mocks.txStepCreate,
      findMany: mocks.txStepFindMany,
      updateMany: mocks.txStepUpdateMany,
    },
  }
  return {
    prisma: {
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      taxAssessment: { findFirst: vi.fn() },
      taxDisputeStep: { findUnique: vi.fn() },
    },
  }
})

import { createTaxDisputeStep, recordTaxDisputeDecision } from "../tax-dispute.actions"

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7" })
  mocks.logActivity.mockResolvedValue(undefined)
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.queryRaw.mockResolvedValue([{ id: 3 }])
  mocks.txAssessmentUpdate.mockResolvedValue({})
  mocks.txStepUpdateMany.mockResolvedValue({ count: 1 })
  mocks.txStepCreate.mockResolvedValue({ id: 21 })
})

describe("recordTaxDisputeDecision — atomik + decidedSum hanya terkabul", () => {
  function seedStep() {
    mocks.txStepFindUnique
      .mockResolvedValueOnce({ assessmentId: 3 })
      .mockResolvedValueOnce({
        id: 9,
        assessmentId: 3,
        status: "DIAJUKAN",
        filedBy: 99,
        assessment: { disputedAmount: 1000, status: "DIPROSES" },
      })
  }

  it("kunci assessment FOR UPDATE di dalam tx sebelum baca ulang upaya", async () => {
    seedStep()
    mocks.txStepFindMany.mockResolvedValue([{ decidedAmount: 400, result: "DIKABULKAN" }])
    const result = await recordTaxDisputeDecision(
      fd({ stepId: "9", result: "DIKABULKAN", decidedAtInput: "2026-10-01", decidedAmount: "400" }),
    )
    expect(result.success).toBe(true)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    const sql = (mocks.queryRaw.mock.calls[0]![0] as string[]).join(" ")
    expect(sql).toContain("tax_assessments")
    expect(sql).toContain("FOR UPDATE")
    // Klaim upaya bersyarat: hanya bila belum tertutup.
    expect(mocks.txStepUpdateMany.mock.calls[0]![0].where).toEqual({
      id: 9,
      status: { notIn: ["DIPUTUS", "DICABUT", "BATAL"] },
    })
  })

  it("decidedSum menyaring result di query: hanya DIKABULKAN/DIKABULKAN_SEBAGIAN", async () => {
    seedStep()
    // Sibling DITOLAK ber-nominal besar TIDAK boleh menutup ketetapan:
    // query wajib menyaring result, jadi sum dari mock terkabul saja = 400 < 1000.
    mocks.txStepFindMany.mockResolvedValue([{ decidedAmount: 400, result: "DIKABULKAN_SEBAGIAN" }])
    const result = await recordTaxDisputeDecision(
      fd({ stepId: "9", result: "DIKABULKAN_SEBAGIAN", decidedAtInput: "2026-10-01", decidedAmount: "400" }),
    )
    expect(result.success).toBe(true)
    expect(mocks.txStepFindMany.mock.calls[0]![0].where).toEqual({
      assessmentId: 3,
      status: "DIPUTUS",
      result: { in: ["DIKABULKAN", "DIKABULKAN_SEBAGIAN"] },
    })
    expect(mocks.txAssessmentUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: "DIPUTUS_SEBAGIAN" },
    })
  })

  it("klaim count 0 (upaya ditutup konkuren) → ditolak, status ketetapan tak ditulis", async () => {
    seedStep()
    mocks.txStepUpdateMany.mockResolvedValue({ count: 0 })
    const result = await recordTaxDisputeDecision(
      fd({ stepId: "9", result: "DIKABULKAN", decidedAtInput: "2026-10-01", decidedAmount: "400" }),
    )
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("sudah ditutup")
    expect(mocks.txAssessmentUpdate).not.toHaveBeenCalled()
  })

  it("empat mata dicek ulang di dalam tx dari baca segar", async () => {
    mocks.txStepFindUnique
      .mockResolvedValueOnce({ assessmentId: 3 })
      .mockResolvedValueOnce({
        id: 9,
        assessmentId: 3,
        status: "DIAJUKAN",
        filedBy: 7,
        assessment: { disputedAmount: 1000, status: "DIPROSES" },
      })
    const result = await recordTaxDisputeDecision(
      fd({ stepId: "9", result: "DIKABULKAN", decidedAtInput: "2026-10-01", decidedAmount: "400" }),
    )
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("Empat mata")
    expect(mocks.txStepUpdateMany).not.toHaveBeenCalled()
  })
})

describe("createTaxDisputeStep — rantai dicek ulang di dalam tx terkunci", () => {
  it("kunci assessment FOR UPDATE + keberatan aktif segar menolak upaya kedua", async () => {
    mocks.txAssessmentFindFirst.mockResolvedValue({
      id: 3,
      sentAt: null,
      status: "DIPROSES",
      steps: [
        { kind: "KEBERATAN", status: "DIAJUKAN", article36Subkind: null, filedAt: null, lateReason: null },
      ],
    })
    const result = await createTaxDisputeStep(fd({ assessmentId: "3", kind: "KEBERATAN" }))
    expect(result.success).toBe(false)
    const sql = (mocks.queryRaw.mock.calls[0]![0] as string[]).join(" ")
    expect(sql).toContain("tax_assessments")
    expect(sql).toContain("FOR UPDATE")
    expect(mocks.txStepCreate).not.toHaveBeenCalled()
  })

  it("ketetapan SELESAI dari baca segar dalam tx menolak upaya baru", async () => {
    mocks.txAssessmentFindFirst.mockResolvedValue({ id: 3, sentAt: null, status: "SELESAI", steps: [] })
    const result = await createTaxDisputeStep(fd({ assessmentId: "3", kind: "KEBERATAN" }))
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("selesai/batal")
    expect(mocks.txStepCreate).not.toHaveBeenCalled()
  })

  it("rantai bersih → upaya dibuat + ketetapan DIPROSES dalam tx sama", async () => {
    mocks.txAssessmentFindFirst.mockResolvedValue({ id: 3, sentAt: null, status: "TERDAFTAR", steps: [] })
    const result = await createTaxDisputeStep(fd({ assessmentId: "3", kind: "KEBERATAN" }))
    expect(result.success).toBe(true)
    expect(mocks.txStepCreate).toHaveBeenCalledTimes(1)
    expect(mocks.txAssessmentUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: "DIPROSES" },
    })
  })
})
