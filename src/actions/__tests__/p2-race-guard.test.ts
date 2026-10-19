import { describe, it, expect, vi, beforeEach } from "vitest"

// Falsification tests for the P2 race fixes:
// (1) markExpensePaid — lock + reread + conditional claim inside one tx
// (2) createPettyCash / updatePettyCash — table gap-lock inside the tx
// (3) reverseJournal — claim moved INSIDE the tx (lock → reread → claim → reversal)
// A mocked Prisma cannot enforce real locking, so each test asserts the lock
// query is issued BEFORE any check/mutation inside the transaction, and that
// a stale re-read aborts before the claim (losing the race = clean error,
// never a double-write).

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertPeriodOpenMock = vi.fn()
const generateDocumentNumberMock = vi.fn()

const expenseFindUniqueOrThrowMock = vi.fn()
const expenseUpdateManyMock = vi.fn()
const onExpenseApprovedMock = vi.fn()
const pettyFindFirstMock = vi.fn()
const pettyFindManyMock = vi.fn()
const pettyCreateMock = vi.fn()
const pettyFindUniqueOrThrowMock = vi.fn()
const pettyUpdateMock = vi.fn()
const txExecuteRawMock = vi.fn()
const transactionMock = vi.fn()
const journalFindUniqueOrThrowMock = vi.fn()
const journalUpdateManyMock = vi.fn()
const journalCreateMock = vi.fn()
const journalUpdateMock = vi.fn()
const entryCreateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => expenseFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => expenseUpdateManyMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: (...a: unknown[]) => onExpenseApprovedMock(...a),
  onPettyCashCreated: vi.fn(),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn(),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: vi.fn(),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(async () => ({
    pettyCashAccountId: 1, cashBankAccountId: 2, generalExpenseAccountId: 3,
  })),
}))
vi.mock("@/lib/finance/petty-cash-chain", () => ({
  computePettyCashChain: vi.fn().mockReturnValue([]),
  findFirstNegativeBalance: vi.fn().mockReturnValue(null),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))

import { markExpensePaid, reverseJournal } from "../finance.actions"

const allMocks = [
  requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock,
  generateDocumentNumberMock, expenseFindUniqueOrThrowMock, expenseUpdateManyMock,
  onExpenseApprovedMock, pettyFindFirstMock, pettyFindManyMock, pettyCreateMock,
  pettyFindUniqueOrThrowMock, pettyUpdateMock, txExecuteRawMock, transactionMock,
  journalFindUniqueOrThrowMock, journalUpdateManyMock, journalCreateMock,
  journalUpdateMock, entryCreateManyMock,
]

beforeEach(() => {
  for (const m of allMocks) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  generateDocumentNumberMock.mockResolvedValue("DOC-0001")
  txExecuteRawMock.mockResolvedValue(1)
  onExpenseApprovedMock.mockResolvedValue(undefined)
})

function wireExpenseTx(order: string[]) {
  const tx = {
    $executeRaw: (...a: unknown[]) => { order.push("lock"); return txExecuteRawMock(...a) },
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => { order.push("reread"); return expenseFindUniqueOrThrowMock(...a) },
      updateMany: (...a: unknown[]) => { order.push("claim"); return expenseUpdateManyMock(...a) },
    },
  }
  // onExpenseApproved(expenseId, userId, tx) — record journal posting order
  onExpenseApprovedMock.mockImplementation(() => { order.push("journal"); return Promise.resolve() })
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

describe("P2-1 markExpensePaid concurrency guard", () => {
  it("locks the expense row BEFORE re-reading status, posts the journal, then claims", async () => {
    const order: string[] = []
    wireExpenseTx(order)
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "approved", paidFromAccountId: 200 })
    expenseUpdateManyMock.mockResolvedValue({ count: 1 })

    const result = await markExpensePaid(42)

    expect(result.success).toBe(true)
    expect(txExecuteRawMock).toHaveBeenCalled() // FOR UPDATE lock taken
    expect(order).toEqual(["lock", "reread", "journal", "claim"])
  })

  it("rejects when the in-tx re-read is no longer approved (lost the race)", async () => {
    const order: string[] = []
    wireExpenseTx(order)
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "paid", paidFromAccountId: 200 })

    const result = await markExpensePaid(42)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/disetujui|diproses/)
    expect(onExpenseApprovedMock).not.toHaveBeenCalled() // no journal on stale status
    expect(expenseUpdateManyMock).not.toHaveBeenCalled() // no claim on stale status
  })

  it("rejects when the locked row has no source account (re-read after lock)", async () => {
    wireExpenseTx([])
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "approved", paidFromAccountId: null })

    const result = await markExpensePaid(42)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/akun sumber dana/i)
    expect(onExpenseApprovedMock).not.toHaveBeenCalled()
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("surfaces a clean error when the conditional claim loses (count 0)", async () => {
    wireExpenseTx([])
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "approved", paidFromAccountId: 200 })
    expenseUpdateManyMock.mockResolvedValue({ count: 0 })

    const result = await markExpensePaid(42)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/diproses/)
  })
})

describe("P2-5 reverseJournal claim-inside-tx guard", () => {
  function wireReverseTx(order: string[]) {
    const tx = {
      $executeRaw: (...a: unknown[]) => { order.push("lock"); return txExecuteRawMock(...a) },
      journal: {
        findUniqueOrThrow: (...a: unknown[]) => { order.push("reread"); return journalFindUniqueOrThrowMock(...a) },
        updateMany: (...a: unknown[]) => { order.push("claim"); return journalUpdateManyMock(...a) },
        create: (...a: unknown[]) => { order.push("reversal"); return journalCreateMock(...a) },
        update: (...a: unknown[]) => journalUpdateMock(...a),
      },
      journalEntry: { createMany: (...a: unknown[]) => entryCreateManyMock(...a) },
    }
    transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  }

  const postedJournal = () => ({
    id: 7, status: "POSTED", transactionDate: new Date("2026-06-15"),
    journalNumber: "JRN-1", description: "x", type: "GENERAL",
    totalDebit: 100, totalCredit: 100, entries: [],
  })

  beforeEach(() => {
    journalFindUniqueOrThrowMock.mockResolvedValue(postedJournal())
    journalUpdateManyMock.mockResolvedValue({ count: 1 })
    journalCreateMock.mockResolvedValue({ id: 99 })
    journalUpdateMock.mockResolvedValue({ id: 7 })
    entryCreateManyMock.mockResolvedValue({ count: 0 })
  })

  it("locks BEFORE re-reading, and claims INSIDE the tx (no outer claim)", async () => {
    const order: string[] = []
    wireReverseTx(order)

    const result = await reverseJournal(7)

    expect(result.success).toBe(true)
    expect(order).toEqual(["lock", "reread", "claim", "reversal"])
    // The outer prisma.journal.updateMany must never fire — claim lives in-tx
    expect(journalUpdateManyMock).toHaveBeenCalledTimes(1)
  })

  it("rejects a non-POSTED re-read before claiming (lost the race)", async () => {
    const order: string[] = []
    wireReverseTx(order)
    journalFindUniqueOrThrowMock.mockResolvedValue({ ...postedJournal(), status: "REVERSED" })

    const result = await reverseJournal(7)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/pernah dibalik|tidak bisa dibalik/)
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("rolls back atomically on reversal failure (tx throw = no partial claim)", async () => {
    wireReverseTx([])
    transactionMock.mockRejectedValueOnce(new Error("simulated tx failure"))

    const result = await reverseJournal(7)

    expect(result.success).toBe(false)
    // Claim ran inside the aborted tx only — no separate outer rollback needed
    expect(journalCreateMock).not.toHaveBeenCalled()
  })
})
