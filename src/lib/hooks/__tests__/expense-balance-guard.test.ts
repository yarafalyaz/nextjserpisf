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

import { onExpenseApprovedSyncPettyCash } from "../expense.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumber.mockResolvedValue("PC-0001")
})

describe("onExpenseApprovedSyncPettyCash balance guard", () => {
  it("throws an error and rolls back when the expense amount exceeds available petty cash balance", async () => {
    // Mock expense paid from a kas kecil account
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "EXP-001",
      amount: 1000,
      paidFromAccountId: 10,
      date: new Date(),
    })

    mocks.accountFindUnique.mockResolvedValue({
      id: 10,
      name: "Kas Kecil Utama",
    })

    // No existing petty cash record for this expense (idempotency passes)
    mocks.pettyCashFindFirst.mockResolvedValue(null)

    // Inside the transaction:
    // 1. dup check returns null
    // 2. all records query returns the current records (e.g. only the newly created one, which has amount 1000 and type OUT)
    const mockTx = {
      pettyCash: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: mocks.pettyCashCreate,
        findMany: vi.fn().mockResolvedValue([
          { id: 99, type: "OUT", amount: 1000, balanceBefore: 0, balanceAfter: 0 },
        ]),
        update: mocks.pettyCashUpdate,
      },
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(mockTx))

    // Expecting the hook to throw an error because starting with 0 balance and taking 1000 OUT drives balance to -1000.
    await expect(onExpenseApprovedSyncPettyCash(1, 99)).rejects.toThrow(
      /Saldo kas kecil menjadi negatif/
    )
  })

  it("succeeds when there is sufficient balance", async () => {
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 2,
      documentNo: "EXP-002",
      amount: 400,
      paidFromAccountId: 10,
      date: new Date(),
    })

    mocks.accountFindUnique.mockResolvedValue({
      id: 10,
      name: "Kas Kecil Utama",
    })

    mocks.pettyCashFindFirst.mockResolvedValue(null)

    const mockTx = {
      pettyCash: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: mocks.pettyCashCreate,
        findMany: vi.fn().mockResolvedValue([
          { id: 100, type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 1000 },
          { id: 101, type: "OUT", amount: 400, balanceBefore: 0, balanceAfter: 0 }, // new one
        ]),
        update: mocks.pettyCashUpdate,
      },
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(mockTx))

    await expect(onExpenseApprovedSyncPettyCash(2, 99)).resolves.toBeUndefined()
    expect(mocks.pettyCashCreate).toHaveBeenCalled()
    expect(mocks.pettyCashUpdate).toHaveBeenCalled()
  })

  it("recomputes balanceBefore/balanceAfter via the shared chain helper", async () => {
    // Regression: the hook used to hand-roll raw `+`/`-` float math for the
    // running-balance chain, which could round differently from the canonical
    // recalcPettyCashChain path (computePettyCashChain + safeAdd/safeSubtract).
    // This asserts the persisted balances match the shared-helper output for a
    // multi-record chain whose stored balances are stale (all zero).
    mocks.expenseFindUniqueOrThrow.mockResolvedValue({
      id: 3,
      documentNo: "EXP-003",
      amount: 300,
      paidFromAccountId: 10,
      date: new Date(),
    })
    mocks.accountFindUnique.mockResolvedValue({ id: 10, name: "Kas Kecil Utama" })
    mocks.pettyCashFindFirst.mockResolvedValue(null)

    const update = mocks.pettyCashUpdate
    update.mockClear()
    update.mockResolvedValue({})
    const mockTx = {
      pettyCash: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: mocks.pettyCashCreate,
        // Stored balances are all stale (0) so every row needs a rewrite.
        findMany: vi.fn().mockResolvedValue([
          { id: 1, documentNo: "PC-1", type: "IN", amount: 1000, balanceBefore: 0, balanceAfter: 0 },
          { id: 2, documentNo: "PC-2", type: "OUT", amount: 300, balanceBefore: 0, balanceAfter: 0 },
          { id: 3, documentNo: "PC-3", type: "OUT", amount: 200, balanceBefore: 0, balanceAfter: 0 },
        ]),
        update,
      },
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(mockTx))

    await expect(onExpenseApprovedSyncPettyCash(3, 99)).resolves.toBeUndefined()

    // Expected chain: IN 1000 → 1000, OUT 300 → 700, OUT 200 → 500
    const writes = update.mock.calls.map((c) => c[0])
    const byId = new Map(writes.map((w: any) => [w.where.id, w.data]))
    expect(byId.get(1)).toEqual({ balanceBefore: 0, balanceAfter: 1000 })
    expect(byId.get(2)).toEqual({ balanceBefore: 1000, balanceAfter: 700 })
    expect(byId.get(3)).toEqual({ balanceBefore: 700, balanceAfter: 500 })
  })
})
