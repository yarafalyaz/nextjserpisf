import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createTaxPayment memvalidasi masa pajak hanya dengan regex /^\d{4}-\d{2}$/,
 * sehingga "2026-13" / "2026-00" (bulan fiktif) lolos dan tersimpan sebagai
 * masa pajak yang tidak pernah ada di kalender. Laporan menampilkan string
 * mentah itu apa adanya, jadi bulan fiktif ikut tercetak di dokumen resmi.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const accountFindMany = vi.fn()
  const taxTypeFindUnique = vi.fn()
  const taxPaymentCreate = vi.fn()
  const journalCreate = vi.fn()
  const taxPaymentUpdate = vi.fn()

  const tx: Record<string, unknown> = {
    taxPayment: { create: taxPaymentCreate, update: taxPaymentUpdate },
    journal: { create: journalCreate },
  }

  const prisma: Record<string, unknown> = {
    account: { findMany: accountFindMany },
    withholdingTaxType: { findUnique: taxTypeFindUnique },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    accountFindMany,
    taxTypeFindUnique,
    taxPaymentCreate,
    journalCreate,
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
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { nextBatch: () => Promise.resolve([1]) },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: () => Promise.resolve("slug-x"),
}))

import { createTaxPayment } from "../tax-payment.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const base = {
  date: "2026-09-15",
  period: "2026-09",
  taxAccountId: "101",
  paymentAccountId: "102",
  amount: "2500000",
  reference: "SSP-1",
  notes: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("PAJAK-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.accountFindMany.mockResolvedValue([{ id: 101 }, { id: 102 }])
  mocks.taxTypeFindUnique.mockResolvedValue(null)
  mocks.taxPaymentCreate.mockResolvedValue({ id: 1 })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
})

describe("createTaxPayment masa pajak", () => {
  it("menolak bulan 13 (tidak ada di kalender) tanpa menyentuh DB", async () => {
    const res = await createTaxPayment(form({ ...base, period: "2026-13" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Masa pajak")
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })

  it("menolak bulan 00 (tidak ada di kalender) tanpa menyentuh DB", async () => {
    const res = await createTaxPayment(form({ ...base, period: "2026-00" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Masa pajak")
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })

  it("menolak reference > 200 char tanpa menyentuh DB", async () => {
    const res = await createTaxPayment(form({ ...base, reference: "R".repeat(201) }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })

  it("menolak notes > 2000 char tanpa menyentuh DB", async () => {
    const res = await createTaxPayment(form({ ...base, notes: "N".repeat(2001) }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })

  it("menolak tanggal kalender fiktif (2026-02-30) tanpa menyentuh DB", async () => {
    const res = await createTaxPayment(form({ ...base, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })

  it("menerima masa valid dan masa kosong", async () => {
    const ok = await createTaxPayment(form({ ...base, period: "2026-09" }))
    expect(ok.success).toBe(true)
    const { period, ...noPeriod } = base
    void period
    const empty = await createTaxPayment(form({ ...noPeriod, period: "" }))
    expect(empty.success).toBe(true)
  })

  it("happy path: tanggal tersimpan sebagai tengah malam UTC", async () => {
    await createTaxPayment(form(base))
    const data = mocks.taxPaymentCreate.mock.calls[0][0].data
    expect(data.date).toEqual(new Date(Date.UTC(2026, 8, 15)))
  })
})
