import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  checkIdempotency: vi.fn(),
  logActivity: vi.fn(),
  revalidatePath: vi.fn(),
  sptFilingFindUnique: vi.fn(),
  sptFilingCreate: vi.fn(),
  taxPaymentFindFirst: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: mocks.checkIdempotency,
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        sptFiling: {
          findUnique: mocks.sptFilingFindUnique,
          create: mocks.sptFilingCreate,
        },
        taxPayment: {
          findFirst: mocks.taxPaymentFindFirst,
        },
      }),
  },
}))

import { createSptFiling } from "../spt-filing.actions"

function makeForm(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v)
  }
  return fd
}

const VALID_BASE = {
  sptType: "ppn",
  period: "2026-10",
  amendmentNo: "1",
  filedAt: "2026-11-14",
  bpeNumber: "BPE-20261114-0001",
  underOverPayment: "250000",
  compensationBalance: "-150000",
  varianceNote: "Selisih penyesuaian kompensasi Coretax",
}

describe("createSptFiling (R4 register append-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", email: "pajak@silengkap.id" })
    mocks.checkIdempotency.mockResolvedValue(undefined)
    mocks.sptFilingFindUnique.mockResolvedValue(null)
    mocks.sptFilingCreate.mockResolvedValue({ id: 101 })
    mocks.taxPaymentFindFirst.mockResolvedValue({ id: 55 })
  })

  it("menyimpan catatan pembetulan beserta saldo kompensasi negatif (PER-12/PJ/2026)", async () => {
    const res = await createSptFiling(makeForm(VALID_BASE))
    expect(res).toEqual({ success: true, id: 101 })
    expect(mocks.sptFilingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sptType: "ppn",
          period: "2026-10",
          amendmentNo: 1,
          bpeNumber: "BPE-20261114-0001",
          underOverPayment: 250000,
          compensationBalance: -150000,
          createdBy: 7,
        }),
      }),
    )
    expect(mocks.logActivity).toHaveBeenCalledWith(
      "create",
      "SptFiling",
      101,
      expect.stringContaining("Pembetulan-1"),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/keuangan/register-spt")
  })

  it("menolak duplikasi versi yang sudah tercatat (append-only)", async () => {
    mocks.sptFilingFindUnique.mockResolvedValue({ id: 9 })
    const res = await createSptFiling(makeForm(VALID_BASE))
    expect(res.success).toBe(false)
    expect(res.error).toContain("append-only")
    expect(mocks.sptFilingCreate).not.toHaveBeenCalled()
  })

  it("menolak format masa tidak valid untuk SPT Masa", async () => {
    const res = await createSptFiling(
      makeForm({ ...VALID_BASE, sptType: "ppn", period: "2026-13" }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain("01 sampai 12")
  })

  it("menerima format tahun YYYY untuk SPT Tahunan", async () => {
    const res = await createSptFiling(
      makeForm({ ...VALID_BASE, sptType: "tahunan", period: "2025", amendmentNo: "0" }),
    )
    expect(res).toEqual({ success: true, id: 101 })
  })

  it("menolak tautan TaxPayment yang tidak ada atau void", async () => {
    mocks.taxPaymentFindFirst.mockResolvedValue(null)
    const res = await createSptFiling(
      makeForm({ ...VALID_BASE, taxPaymentId: "999" }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain("Setoran pajak tertaut")
  })
})
