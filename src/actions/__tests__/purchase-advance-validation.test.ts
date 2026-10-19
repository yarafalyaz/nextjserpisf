import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createPurchaseAdvance hand-parsed formData tanpa Zod: description tanpa
 * max-length (5MB lolos ke DB), tanggal via `new Date(...)` yang bergantung
 * zona waktu proses, id/akun via parseId manual.
 *
 * Setelah refactor: via parseFormData(purchaseAdvanceSchema), tanggal
 * YYYY-MM-DD tervalidasi kalender + dikonversi via wibDateToUtcMidnight,
 * description dibatasi 2000 char, akun sama ditolak di level schema.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const vendorFindFirst = vi.fn()
  const accountFindMany = vi.fn()
  const advanceCreate = vi.fn()
  const advanceUpdate = vi.fn()
  const journalCreate = vi.fn()

  const tx: Record<string, unknown> = {
    purchaseAdvance: { create: advanceCreate, update: advanceUpdate },
    journal: { create: journalCreate },
  }

  const prismaMock: Record<string, unknown> = {
    vendor: { findFirst: vendorFindFirst },
    account: { findMany: accountFindMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    vendorFindFirst,
    accountFindMany,
    advanceCreate,
    journalCreate,
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/prisma")>()
  return { ...actual, prisma: mocks.prismaMock }
})
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
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { nextBatch: () => Promise.resolve([1]) },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: () => Promise.resolve("slug-x"),
}))

import { createPurchaseAdvance } from "../purchase-advance.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const base = {
  date: "2026-09-15",
  vendorId: "11",
  amount: "500000",
  paymentAccountId: "101",
  advanceAccountId: "102",
  description: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("DP-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.vendorFindFirst.mockResolvedValue({ id: 11, name: "Vendor A" })
  mocks.accountFindMany.mockResolvedValue([{ id: 101 }, { id: 102 }])
  mocks.advanceCreate.mockResolvedValue({ id: 1, slug: "dp-1" })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
})

describe("createPurchaseAdvance zod validation", () => {
  it("menolak description > 2000 char tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, description: "D".repeat(2001) }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak tanggal kalender fiktif (2026-02-30) tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak amount 0 tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, amount: "0" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak vendorId negatif tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, vendorId: "-3" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak akun kas == akun uang muka tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(
      form({ ...base, paymentAccountId: "101", advanceAccountId: "101" }),
    )
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("happy path: tanggal tersimpan sebagai tengah malam UTC", async () => {
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(true)
    const data = mocks.advanceCreate.mock.calls[0][0].data
    expect(data.date).toEqual(new Date(Date.UTC(2026, 8, 15)))
  })
})
