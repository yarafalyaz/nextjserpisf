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
  const accountFindManyInTx = vi.fn()
  const transferCreate = vi.fn()
  const transferUpdate = vi.fn()
  const journalCreate = vi.fn()
  const journalEntryFindManyInTx = vi.fn()

  const tx: Record<string, unknown> = {
    bankTransfer: { create: transferCreate, update: transferUpdate },
    journal: { create: journalCreate },
    journalEntry: { findMany: journalEntryFindManyInTx },
    account: { findMany: accountFindManyInTx },
    $executeRaw: vi.fn(async () => 1),
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
    accountFindManyInTx,
    transferCreate,
    transferUpdate,
    journalCreate,
    journalEntryFindManyInTx,
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
import { formFormData as form } from "./validation-mock-helpers"
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/services/document-sequence.service", async () => (await import("./validation-mock-helpers")).docSequenceFactory())
vi.mock("@/lib/services/period-lock.service", async () => (await import("./validation-mock-helpers")).periodLockFactory(mocks))
vi.mock("@/lib/utils/slug-db", async () => (await import("./validation-mock-helpers")).slugFixedFactory())

import { createBankTransfer } from "../bank-transfer.actions"

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
  // Default: kedua rekening BANK hidup; akun biaya EXPENSE hidup.
  mocks.accountFindManyInTx.mockResolvedValue([
    { id: 101, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
    { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
  ])
  mocks.transferCreate.mockResolvedValue({ id: 1, slug: "btf-1" })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
  // Saldo buku rekening asal secara bawaan cukup besar untuk happy path.
  mocks.journalEntryFindManyInTx.mockResolvedValue([{ debit: 100_000_000, credit: 0 }])
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

describe("createBankTransfer akun hidup + tipe (putaran 22)", () => {
  it("menolak rekening asal nonaktif walau picker hanya menawarkan akun hidup", async () => {
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: false, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
    ])
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/tidak aktif/)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("menolak rekening tujuan terhapus lunak", async () => {
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 102, isActive: true, deletedAt: new Date(2026, 0, 1), reportGroup: "BANK", type: "ASSET" },
    ])
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/sudah dihapus|tidak aktif/)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })

  it("menolak rekening asal bukan BANK (salah tipe)", async () => {
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: true, deletedAt: null, reportGroup: "EXPS", type: "EXPENSE" },
      { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
    ])
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/bukan rekening kas\/bank/)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  // Regresi putaran 45: transfer tak mengecek saldo buku rekening asal —
  // jurnal POSTED Dr tujuan / Cr asal lahir dari rekening yang saldonya
  // tidak cukup (preseden AUD-02 petty cash IN). Pasangan POSTED+REVERSED
  // wajib dihitung agar reversal tidak menggelembungkan saldo.
  it("regresi putaran 45: menolak transfer melebihi saldo buku rekening asal", async () => {
    mocks.journalEntryFindManyInTx.mockResolvedValue([{ debit: 500_000, credit: 0 }])
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/Saldo rekening asal tidak mencukupi/)
    expect(mocks.journalEntryFindManyInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journal: expect.objectContaining({ status: { in: ["POSTED", "REVERSED"] } }),
        }),
      }),
    )
    expect(mocks.transferCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 45: saldo asal pas untuk amount+biaya tetap lolos", async () => {
    mocks.journalEntryFindManyInTx.mockResolvedValue([{ debit: 1_005_000, credit: 0 }])
    mocks.accountCount.mockResolvedValue(3)
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 610, isActive: true, deletedAt: null, reportGroup: "EXPS", type: "EXPENSE" },
    ])
    const res = await createBankTransfer(form({ ...baseTransfer, adminFee: "5000", feeAccountId: "610" }))
    expect(res.success).toBe(true)
  })

  it("putaran 100: menolak rekening asal akun induk walau hidup dan BANK", async () => {
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET", _count: { children: 2 } },
      { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET", _count: { children: 0 } },
    ])
    const res = await createBankTransfer(form(baseTransfer))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/Akun induk tidak bisa diposting/)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("menolak akun biaya nonaktif saat adminFee > 0", async () => {
    mocks.accountCount.mockResolvedValue(3)
    mocks.accountFindManyInTx.mockResolvedValue([
      { id: 101, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 102, isActive: true, deletedAt: null, reportGroup: "BANK", type: "ASSET" },
      { id: 610, isActive: false, deletedAt: null, reportGroup: "EXPS", type: "EXPENSE" },
    ])
    const res = await createBankTransfer(form({ ...baseTransfer, adminFee: "5000", feeAccountId: "610" }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/tidak aktif/)
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })
})
