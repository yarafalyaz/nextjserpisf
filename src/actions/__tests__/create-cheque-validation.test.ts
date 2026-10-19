import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createCheque hand-parsed formData tanpa Zod: number/party/notes tanpa
 * max-length (5MB lolos ke DB), type/direction arbitrary string diam-diam
 * jadi "giro"/"in", accountId negatif lolos.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const accountCount = vi.fn()
  const chequeCreate = vi.fn()

  const prisma: Record<string, unknown> = {
    account: { count: accountCount },
    cheque: { create: chequeCreate },
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    accountCount,
    chequeCreate,
    prisma,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a) }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))

import { createCheque } from "../cheque.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const base = {
  type: "giro",
  direction: "in",
  number: "G-001",
  party: "PT Maju",
  amount: "100000",
  dueDate: "2026-10-01",
  notes: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("CHQ-001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.accountCount.mockResolvedValue(0)
  mocks.chequeCreate.mockResolvedValue({ id: 1 })
})

describe("createCheque zod validation", () => {
  it("menolak type arbitrary", async () => {
    const res = await createCheque(form({ ...base, type: "wesel" }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak direction arbitrary", async () => {
    const res = await createCheque(form({ ...base, direction: "sideways" }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak amount nol", async () => {
    const res = await createCheque(form({ ...base, amount: "0" }))
    expect(res.success).toBe(false)
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak amount negatif", async () => {
    const res = await createCheque(form({ ...base, amount: "-5000" }))
    expect(res.success).toBe(false)
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak number > 100 char", async () => {
    const res = await createCheque(form({ ...base, number: "N".repeat(101) }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak party > 200 char", async () => {
    const res = await createCheque(form({ ...base, party: "P".repeat(201) }))
    expect(res.success).toBe(false)
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("menolak dueDate kosong", async () => {
    const res = await createCheque(form({ ...base, dueDate: "" }))
    expect(res.success).toBe(false)
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("happy path tetap create", async () => {
    const res = await createCheque(form(base))
    expect(res.success).toBe(true)
    expect(mocks.chequeCreate).toHaveBeenCalledOnce()
  })
})
