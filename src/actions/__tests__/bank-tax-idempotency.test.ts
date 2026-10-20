import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createBankTransfer + createTaxPayment memposting jurnal POSTED langsung
 * dalam transaksi yang sama, tetapi tidak punya kunci idempotensi — klik
 * ganda / retry / resubmit membuat dokumen + jurnal POSTED kedua (kas
 * bergerak dua kali). createExpense/createSalesOrder/createPurchaseOrder
 * sudah memakai checkIdempotency di dalam tx; kedua aksi uang ini belum.
 *
 * Guard: checkIdempotency(idempotencyKey, tx, user.id) sebagai baris
 * pertama transaksi. Tanpa key = perilaku lama (backward compatible).
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const checkIdempotency = vi.fn()
  const accountCount = vi.fn()
  const transferCreate = vi.fn()
  const transferUpdate = vi.fn()
  const journalCreate = vi.fn()
  const accountFindMany = vi.fn()
  const taxTypeFindUnique = vi.fn()
  const taxPaymentCreate = vi.fn()
  const taxPaymentUpdate = vi.fn()
  const txBank: Record<string, unknown> = {
    bankTransfer: { create: transferCreate, update: transferUpdate },
    taxPayment: { create: taxPaymentCreate, update: taxPaymentUpdate },
    journal: { create: journalCreate },
  }
  const prismaBank: Record<string, unknown> = {
    account: { count: accountCount, findMany: accountFindMany },
    withholdingTaxType: { findUnique: taxTypeFindUnique },
    $transaction: (fn: (tx: unknown) => unknown) => fn(txBank),
  }
  const txTax = txBank
  const prismaTax = prismaBank
  // prismaFactory picks mocks.prisma if present; expose bank as default and
  // let tax tests swap via mocks.prisma assignment below.
  return {
    requirePermission, logActivity, revalidatePath, generateDocumentNumber,
    assertPeriodOpen, checkIdempotency, accountCount, transferCreate,
    transferUpdate, journalCreate, prismaBank, prismaTax, txBank, txTax,
    accountFindMany, taxTypeFindUnique, taxPaymentCreate, taxPaymentUpdate,
    prisma: prismaBank,
  }
})

import * as helpers from "./validation-mock-helpers"

vi.mock("@/lib/db/prisma", () => helpers.prismaFactory(mocks))
vi.mock("@/lib/auth/permissions", () => helpers.permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", () => helpers.activityLogFactory(mocks))
vi.mock("next/cache", () => helpers.revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", () => helpers.docNumberFactory(mocks))
vi.mock("@/lib/services/document-sequence.service", () => helpers.docSequenceFactory())
vi.mock("@/lib/services/period-lock.service", () => helpers.periodLockFactory(mocks))
vi.mock("@/lib/utils/slug-db", () => helpers.slugFixedFactory())
vi.mock("@/lib/utils/idempotency", () => ({ checkIdempotency: mocks.checkIdempotency }))

const form = helpers.formFormData

import { createBankTransfer } from "../bank-transfer.actions"
import { createTaxPayment } from "../tax-payment.actions"

const baseTransfer = {
  date: "2026-09-15", fromAccountId: "101", toAccountId: "102",
  amount: "1000000", adminFee: "0", feeAccountId: "", description: "ok",
}
const baseTax = {
  date: "2026-09-15", period: "2026-09", taxAccountId: "101",
  paymentAccountId: "102", amount: "2500000", reference: "SSP-1", notes: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("DOC-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.checkIdempotency.mockResolvedValue(undefined)
  mocks.accountCount.mockResolvedValue(2)
  mocks.transferCreate.mockResolvedValue({ id: 1, slug: "btf-1" })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
  mocks.accountFindMany.mockResolvedValue([{ id: 101 }, { id: 102 }])
  mocks.taxTypeFindUnique.mockResolvedValue(null)
  mocks.taxPaymentCreate.mockResolvedValue({ id: 1 })
  mocks.prisma = mocks.prismaBank
})

describe("idempotensi uang langsung-posting", () => {
  it("bank transfer: key diteruskan ke checkIdempotency di dalam tx dengan scope user", async () => {
    const res = await createBankTransfer(form({ ...baseTransfer, idempotencyKey: "key-bank-1" }))
    expect(res.success).toBe(true)
    expect(mocks.checkIdempotency).toHaveBeenCalledTimes(1)
    expect(mocks.checkIdempotency).toHaveBeenCalledWith("key-bank-1", mocks.txBank, 7)
    expect(mocks.transferCreate).toHaveBeenCalledTimes(1)
  })

  it("bank transfer: duplikat (checkIdempotency menolak) -> gagal, nol dokumen/jurnal", async () => {
    mocks.checkIdempotency.mockRejectedValueOnce(new Error("Permintaan duplikat terdeteksi. Transaksi ini sedang atau telah diproses."))
    const res = await createBankTransfer(form({ ...baseTransfer, idempotencyKey: "key-bank-1" }))
    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("duplikat")
    expect(mocks.transferCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("bank transfer: tanpa key tetap jalan (backward compatible)", async () => {
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(true)
    expect(mocks.checkIdempotency).toHaveBeenCalledWith(null, mocks.txBank, 7)
  })

  it("tax payment: key diteruskan ke checkIdempotency di dalam tx dengan scope user", async () => {
    mocks.prisma = mocks.prismaTax
    const res = await createTaxPayment(form({ ...baseTax, idempotencyKey: "key-tax-1" }))
    expect(res.success).toBe(true)
    expect(mocks.checkIdempotency).toHaveBeenCalledWith("key-tax-1", mocks.txTax, 7)
    expect(mocks.taxPaymentCreate).toHaveBeenCalledTimes(1)
  })

  it("tax payment: duplikat -> gagal, nol dokumen/jurnal", async () => {
    mocks.prisma = mocks.prismaTax
    mocks.checkIdempotency.mockRejectedValueOnce(new Error("Permintaan duplikat terdeteksi. Transaksi ini sedang atau telah diproses."))
    const res = await createTaxPayment(form({ ...baseTax, idempotencyKey: "key-tax-1" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("duplikat")
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})
