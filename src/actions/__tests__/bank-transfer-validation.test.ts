import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createBankTransfer / createTaxPayment hand-parsed formData tanpa Zod:
 * description/reference/notes tanpa max-length (5MB lolos ke DB),
 * tanggal via `new Date(...)` yang bergantung zona waktu proses,
 * masa pajak hanya regex-checked di action.
 *
 * Setelah refactor: kedua action via parseFormData(bankTransferSchema /
 * taxPaymentSchema), tanggal YYYY-MM-DD tervalidasi kalender + dikonversi
 * via wibDateToUtcMidnight, string dibatasi max-length.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const accountCount = vi.fn()
  const transferCreate = vi.fn()
  const transferUpdate = vi.fn()
  const journalCreate = vi.fn()

  const tx: Record<string, unknown> = {
    bankTransfer: { create: transferCreate, update: transferUpdate },
    journal: { create: journalCreate },
  }

  const prismaBank: Record<string, unknown> = {
    account: { count: accountCount },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }

  const accountFindMany = vi.fn()
  const taxTypeFindUnique = vi.fn()
  const taxPaymentCreate = vi.fn()
  const taxPaymentUpdate = vi.fn()

  const txTax: Record<string, unknown> = {
    taxPayment: { create: taxPaymentCreate, update: taxPaymentUpdate },
    journal: { create: journalCreate },
  }

  const prismaTax: Record<string, unknown> = {
    account: { findMany: accountFindMany },
    withholdingTaxType: { findUnique: taxTypeFindUnique },
    $transaction: (fn: (tx: unknown) => unknown) => fn(txTax),
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    accountCount,
    transferCreate,
    transferUpdate,
    journalCreate,
    prismaBank,
    accountFindMany,
    taxTypeFindUnique,
    taxPaymentCreate,
    prismaTax,
  }
})

vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/prisma")>()
  return { ...actual, prisma: mocks.prismaBank }
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

import { createBankTransfer } from "../bank-transfer.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const baseTransfer = {
  date: "2026-09-15",
  fromAccountId: "101",
  toAccountId: "102",
  amount: "1000000",
  adminFee: "0",
  feeAccountId: "",
  description: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("BTF-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.accountCount.mockResolvedValue(2)
  mocks.transferCreate.mockResolvedValue({ id: 1, slug: "btf-1" })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
})

describe("createBankTransfer zod validation", () => {
  it("menolak description > 2000 char tanpa menyentuh DB", async () => {
    const res = await createBankTransfer(form({ ...baseTransfer, description: "D".repeat(2001) }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })

  it("menolak tanggal kalender fiktif (2026-02-30) tanpa menyentuh DB", async () => {
    const res = await createBankTransfer(form({ ...baseTransfer, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })

  it("menolak rekening asal == tujuan tanpa menyentuh DB", async () => {
    const res = await createBankTransfer(
      form({ ...baseTransfer, fromAccountId: "101", toAccountId: "101" }),
    )
    expect(res.success).toBe(false)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })

  it("menolak adminFee > 0 tanpa feeAccountId", async () => {
    const res = await createBankTransfer(form({ ...baseTransfer, adminFee: "5000" }))
    expect(res.success).toBe(false)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })

  it("happy path: tanggal tersimpan sebagai tengah malam UTC", async () => {
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(true)
    const data = mocks.transferCreate.mock.calls[0][0].data
    expect(data.date).toEqual(new Date(Date.UTC(2026, 8, 15)))
  })
})
