import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  expenseFindUniqueOrThrow: vi.fn(),
  accountFindUnique: vi.fn(),
  pettyCashFindFirst: vi.fn(),
  pettyCashCreate: vi.fn(),
  pettyCashFindMany: vi.fn(),
  pettyCashUpdate: vi.fn(),
  generateDocumentNumber: vi.fn(),
  assertPeriodOpen: vi.fn(),
  getSystemSettings: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => mocks.expenseFindUniqueOrThrow(...a),
    },
    account: {
      findUnique: (...a: unknown[]) => mocks.accountFindUnique(...a),
    },
    pettyCash: {
      findFirst: (...a: unknown[]) => mocks.pettyCashFindFirst(...a),
      findMany: (...a: unknown[]) => mocks.pettyCashFindMany(...a),
    },
    $transaction: (fn: any) => mocks.transaction(fn),
  },
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
}))

vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => mocks.getSystemSettings(...a),
}))

import { onExpenseApprovedSyncPettyCash } from "../expense.hook"

function makeTx() {
  return {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    expense: { findUniqueOrThrow: mocks.expenseFindUniqueOrThrow },
    account: { findUnique: mocks.accountFindUnique },
    pettyCash: {
      findFirst: mocks.pettyCashFindFirst,
      create: mocks.pettyCashCreate,
      findMany: mocks.pettyCashFindMany,
      update: mocks.pettyCashUpdate,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumber.mockResolvedValue("PC-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.getSystemSettings.mockResolvedValue({ pettyCashAccountId: null })
  mocks.queryRaw.mockResolvedValue([])
  mocks.executeRaw.mockResolvedValue(1)
  mocks.pettyCashCreate.mockResolvedValue({})
  mocks.pettyCashUpdate.mockResolvedValue({})
  mocks.transaction.mockImplementation(async (fn: any) => fn(makeTx()))
})

describe("onExpenseApprovedSyncPettyCash balance guard", () => {
  it("throws an error and rolls back when the expense amount exceeds available petty cash balance", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "EXP-001",
      status: "draft",
      amount: 1000,
      paidFromAccountId: 10,
      date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 99, type: "OUT", amount: 1000, balanceBefore: 0, balanceAfter: 0 },
    ])

    await expect(onExpenseApprovedSyncPettyCash(1, 99)).rejects.toThrow(
      /Saldo kas kecil menjadi negatif/
    )
  })

  it("succeeds when there is sufficient balance", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 2,
      documentNo: "EXP-002",
      status: "draft",
      amount: 400,
      paidFromAccountId: 10,
      date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
      { id: 101, type: "OUT", amount: 400, balanceBefore: 0, balanceAfter: 0 },
    ])

    await expect(onExpenseApprovedSyncPettyCash(2, 99)).resolves.toBeUndefined()
    expect(mocks.pettyCashCreate).toHaveBeenCalled()
    expect(mocks.pettyCashUpdate).toHaveBeenCalled()
  })

  it("recomputes balanceBefore/balanceAfter via the shared chain helper", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 3,
      documentNo: "EXP-003",
      status: "draft",
      amount: 300,
      paidFromAccountId: 10,
      date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 1, documentNo: "PC-1", type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 0 },
      { id: 2, documentNo: "PC-2", type: "OUT", amount: 300, balanceBefore: 0, balanceAfter: 0 },
      { id: 3, documentNo: "PC-3", type: "OUT", amount: 200, balanceBefore: 0, balanceAfter: 0 },
    ])

    await expect(onExpenseApprovedSyncPettyCash(3, 99)).resolves.toBeUndefined()

    const writes = mocks.pettyCashUpdate.mock.calls.map((c) => c[0])
    const byId = new Map(writes.map((w: any) => [w.where.id, w.data]))
    expect(byId.get(1)).toEqual({ balanceBefore: 0, balanceAfter: 1000 })
    expect(byId.get(2)).toEqual({ balanceBefore: 1000, balanceAfter: 700 })
    expect(byId.get(3)).toEqual({ balanceBefore: 700, balanceAfter: 500 })
  })
})

describe("R8-KEU-04/05 status guard", () => {
  it("status paid ditolak sebelum sync kas kecil", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 11, documentNo: "EXP-011", status: "paid", amount: 100, paidFromAccountId: 10, date: new Date(),
    })

    await expect(onExpenseApprovedSyncPettyCash(11, 99)).rejects.toThrow(/sudah diproses/)
    expect(mocks.accountFindUnique).not.toHaveBeenCalled()
    expect(mocks.pettyCashCreate).not.toHaveBeenCalled()
  })

  it("status rejected ditolak sebelum sync kas kecil", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 12, documentNo: "EXP-012", status: "rejected", amount: 100, paidFromAccountId: 10, date: new Date(),
    })

    await expect(onExpenseApprovedSyncPettyCash(12, 99)).rejects.toThrow(/sudah diproses/)
    expect(mocks.accountFindUnique).not.toHaveBeenCalled()
    expect(mocks.pettyCashCreate).not.toHaveBeenCalled()
  })
})

describe("onExpenseApprovedSyncPettyCash race + period + deteksi akun", () => {
  it("kunci baris expenses FOR UPDATE sebelum baca ulang expense dan cek duplikat", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 4, documentNo: "EXP-004", amount: 100, paidFromAccountId: 10, status: "draft", date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
    ])

    await onExpenseApprovedSyncPettyCash(4, 99)

    expect(mocks.queryRaw).toHaveBeenCalled()
    const sql = mocks.queryRaw.mock.calls.map((c) => Array.from(c[0] as TemplateStringsArray).join("?")).join(" ")
    expect(sql).toContain("expenses")
    expect(sql).toContain("FOR UPDATE")
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.expenseFindUniqueOrThrow.mock.invocationCallOrder[0])
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.pettyCashFindFirst.mock.invocationCallOrder[0])
  })

  it("gap-lock petty_cash (FOR UPDATE) sebelum create — recalc rantai serialize lawan penulis kas kecil lain", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 10, documentNo: "EXP-010", amount: 100, paidFromAccountId: 10, status: "draft", date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
    ])

    await onExpenseApprovedSyncPettyCash(10, 99)

    expect(mocks.executeRaw).toHaveBeenCalled()
    const sql = mocks.executeRaw.mock.calls.map((c) => String((c[0] as { strings?: string[] })?.strings?.join("?") ?? (Array.isArray(c[0]) ? (c[0] as unknown[]).join("") : c[0]))).join(" ")
    expect(sql).toContain("petty_cash")
    expect(sql).toContain("FOR UPDATE")
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.pettyCashCreate.mock.invocationCallOrder[0])
  })

  it("assertPeriodOpen dipanggil dengan tanggal expense di dalam tx sebelum create", async () => {
    const date = new Date(2026, 0, 15)
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 5, documentNo: "EXP-005", amount: 100, paidFromAccountId: 10, status: "draft", date,
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
    ])

    await onExpenseApprovedSyncPettyCash(5, 99)

    expect(mocks.assertPeriodOpen).toHaveBeenCalledWith(date, expect.anything())
    expect(mocks.assertPeriodOpen.mock.invocationCallOrder[0]).toBeLessThan(mocks.pettyCashCreate.mock.invocationCallOrder[0])
  })

  it("periode tertutup: assertPeriodOpen melempar → tidak ada create pettyCash", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 6, documentNo: "EXP-006", amount: 100, paidFromAccountId: 10, status: "draft", date: new Date(2020, 0, 1),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.assertPeriodOpen.mockRejectedValue(new Error("Periode akuntansi sudah ditutup"))

    await expect(onExpenseApprovedSyncPettyCash(6, 99)).rejects.toThrow(/Periode akuntansi sudah ditutup/)
    expect(mocks.pettyCashCreate).not.toHaveBeenCalled()
  })

  it("setting pettyCashAccountId cocok walau nama akun bukan kas kecil → tetap sinkron", async () => {
    mocks.getSystemSettings.mockResolvedValue({ pettyCashAccountId: 42 })
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 7, documentNo: "EXP-007", amount: 100, paidFromAccountId: 42, status: "draft", date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 42, name: "Kas Operasional" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    mocks.pettyCashFindMany.mockResolvedValue([
      { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
    ])

    await onExpenseApprovedSyncPettyCash(7, 99)
    expect(mocks.pettyCashCreate).toHaveBeenCalled()
  })

  it("setting pettyCashAccountId terisi tapi akun expense beda (nama kas kecil pun) → dilewati", async () => {
    mocks.getSystemSettings.mockResolvedValue({ pettyCashAccountId: 42 })
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "EXP-008", amount: 100, paidFromAccountId: 10, status: "draft", date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })

    await onExpenseApprovedSyncPettyCash(8, 99)
    expect(mocks.pettyCashCreate).not.toHaveBeenCalled()
  })

  it("rantai recalc hanya posted & belum terhapus: where findMany eksplisit, void/deleted tak ditulis ulang", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 9, documentNo: "EXP-009", amount: 100, paidFromAccountId: 10, status: "draft", date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)
    // Mock DB jujur: findMany menghormati where — record void (77) & deleted (78)
    // tidak dikembalikan query ber-where, jadi tak masuk records/update.
    const rows = [
      { id: 100, documentNo: "PC-1", type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 0, status: "posted" },
      { id: 77, documentNo: "PC-V", type: "OUT", amount: 999, balanceBefore: 5, balanceAfter: 5, status: "void" },
      { id: 78, documentNo: "PC-D", type: "OUT", amount: 999, balanceBefore: 5, balanceAfter: 5, status: "posted" },
    ]
    mocks.pettyCashFindMany.mockImplementation(async (args: any) => {
      expect(args.where).toEqual({ status: "posted", deletedAt: null })
      expect(args.select).toEqual(expect.objectContaining({ status: true }))
      return rows.filter((r) => r.status === "posted" && r.id !== 78)
    })

    await onExpenseApprovedSyncPettyCash(9, 99)

    expect(mocks.pettyCashFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "posted", deletedAt: null } }),
    )
    const updatedIds = mocks.pettyCashUpdate.mock.calls.map((c) => (c[0] as any).where.id)
    expect(updatedIds).not.toContain(77)
    expect(updatedIds).not.toContain(78)
  })
})
