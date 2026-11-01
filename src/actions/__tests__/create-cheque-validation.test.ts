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
  const accountFindFirst = vi.fn()
  const chequeCreate = vi.fn()

  const prisma: Record<string, unknown> = {
    account: { count: accountCount, findFirst: accountFindFirst },
    cheque: { create: chequeCreate },
  }
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma)

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    accountCount,
    accountFindFirst,
    chequeCreate,
    prisma,
  }
})

import { formFormData as form } from "./validation-mock-helpers"
vi.mock("@/lib/db/prisma", async () => (await import("./validation-mock-helpers")).prismaFactory(mocks))
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/services/period-lock.service", async () => (await import("./validation-mock-helpers")).periodLockFactory(mocks))

import { createCheque } from "../cheque.actions"

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
  mocks.accountFindFirst.mockResolvedValue({ id: 5 })
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

  it("happy path tetap menjaga kunci periode (assertPeriodOpen dipanggil)", async () => {
    const res = await createCheque(form(base))
    expect(res.success).toBe(true)
    // Luar-tx fast-fail + penilaian ulang dalam tx (putaran 45).
    expect(mocks.assertPeriodOpen).toHaveBeenCalledTimes(2)
  })

  // Regresi putaran 45: gerbang akun hanya count eksistensi — akun
  // nonaktif/terhapus lolos sebagai rekening cek; assertPeriodOpen di luar
  // transaksi pula (tutup periode konkuren bisa menyelip).
  it("regresi putaran 45: menolak akun nonaktif walau akun ada", async () => {
    mocks.accountCount.mockResolvedValue(1)
    mocks.accountFindFirst.mockResolvedValue(null)
    const res = await createCheque(form({ ...base, accountId: "5" }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/tidak aktif\/terhapus/)
    expect(mocks.chequeCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 45: assertPeriodOpen dinilai ulang di dalam transaksi", async () => {
    const res = await createCheque(form({ ...base, accountId: "5" }))
    expect(res.success).toBe(true)
    const txArgs = mocks.assertPeriodOpen.mock.calls.map((c: unknown[]) => c[1])
    expect(txArgs.some((a: unknown) => a != null)).toBe(true)
  })

  it("validasi gagal tidak menyentuh kunci periode", async () => {
    const res = await createCheque(form({ ...base, type: "wesel" }))
    expect(res.success).toBe(false)
    expect(mocks.assertPeriodOpen).not.toHaveBeenCalled()
  })
})
