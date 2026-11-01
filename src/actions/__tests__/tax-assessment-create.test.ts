import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  logActivity: vi.fn(),
  assertPeriodOpen: vi.fn(),
  executeRaw: vi.fn(),
  txAssessmentCreate: vi.fn(),
  txAssessmentFindFirst: vi.fn(),
  txTaxPaymentFindFirst: vi.fn(),
  txTaxInvoiceFindFirst: vi.fn(),
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
    $executeRaw: mocks.executeRaw,
    taxAssessment: {
      create: mocks.txAssessmentCreate,
      findFirst: mocks.txAssessmentFindFirst,
    },
    taxPayment: { findFirst: mocks.txTaxPaymentFindFirst },
    taxInvoice: { findFirst: mocks.txTaxInvoiceFindFirst },
    financialIdempotencyKey: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
  }
  return {
    prisma: {
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      taxAssessment: { findFirst: mocks.txAssessmentFindFirst, findMany: vi.fn().mockResolvedValue([]) },
    },
  }
})

import { createTaxAssessment } from "../tax-dispute.actions"

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

const base = {
  assessmentNumber: "SKPKB-001/2026",
  kind: "SKPKB",
  assessedAmount: "1000000",
  disputedAmount: "400000",
  sentAt: "2026-10-05",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7" })
  mocks.logActivity.mockResolvedValue(undefined)
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.executeRaw.mockResolvedValue(1)
  mocks.txAssessmentFindFirst.mockResolvedValue(null)
  mocks.txAssessmentCreate.mockResolvedValue({ id: 3, assessmentNumber: "SKPKB-001/2026" })
  // Gerbang tautan hidup (putaran 35): default dokumen tertaut sehat.
  mocks.txTaxPaymentFindFirst.mockResolvedValue({ id: 11, status: "posted", deletedAt: null })
  mocks.txTaxInvoiceFindFirst.mockResolvedValue({ id: 12, djpStatus: "approved" })
})

describe("createTaxAssessment gerbang periode + nomor dobel", () => {
  it("assertPeriodOpen dipanggil DI DALAM tx (argumen tx terisi), bukan di luar", async () => {
    const res = await createTaxAssessment(fd(base))
    expect(res.success).toBe(true)
    expect(mocks.assertPeriodOpen).toHaveBeenCalledTimes(1)
    expect(mocks.assertPeriodOpen.mock.calls[0][1]).toBeDefined()
  })

  it("nomor ketetapan yang sudah terdaftar (belum terhapus) ditolak, nol create", async () => {
    mocks.txAssessmentFindFirst.mockResolvedValue({ id: 9 })
    const res = await createTaxAssessment(fd(base))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/sudah terdaftar/)
    expect(mocks.txAssessmentCreate).not.toHaveBeenCalled()
  })

  it("gap-lock tax_assessments sebelum cek nomor dobel", async () => {
    const res = await createTaxAssessment(fd(base))
    expect(res.success).toBe(true)
    const sql = mocks.executeRaw.mock.calls
      .map((c) => String((c[0] as { strings?: string[] })?.strings?.join("?") ?? c[0]))
      .join(" ")
    expect(sql).toContain("tax_assessments")
    expect(sql).toContain("FOR UPDATE")
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.txAssessmentFindFirst.mock.invocationCallOrder[0],
    )
  })

  // regresi putaran 35: tautan opsional dinilai dari dokumen hidup dalam tx
  it("tolak tautan setor void/terhapus", async () => {
    mocks.txTaxPaymentFindFirst.mockResolvedValue(null)
    const res = await createTaxAssessment(fd({ ...base, taxPaymentId: "11" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/Setoran pajak tertaut tidak ditemukan/)
    expect(mocks.txAssessmentCreate).not.toHaveBeenCalled()
  })

  it("tolak tautan faktur batal", async () => {
    mocks.txTaxInvoiceFindFirst.mockResolvedValue(null)
    const res = await createTaxAssessment(fd({ ...base, taxInvoiceId: "12" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/Faktur pajak tertaut tidak ditemukan/)
    expect(mocks.txAssessmentCreate).not.toHaveBeenCalled()
  })
})
