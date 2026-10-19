import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression tests for audit F-01 (postJournal vs updateJournal race) and
// F-02 (completeReconciliation vs item-mutation race). The real race is
// closed by DB row locks (SELECT ... FOR UPDATE on the parent row), which a
// mocked Prisma cannot enforce — so testing "two parallel calls" would be
// coverage theater. What IS meaningful and durable: assert the lock query is
// issued BEFORE any status check / mutation inside the transaction, so nobody
// can silently drop or reorder it (which would re-open the TOCTOU window).

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertPeriodOpenMock = vi.fn()

const journalFindUniqueOrThrowMock = vi.fn()
const journalUpdateManyMock = vi.fn()
const journalUpdateMock = vi.fn()
const entryDeleteManyMock = vi.fn()
const entryCreateManyMock = vi.fn()
const executeRawMock = vi.fn()
const transactionMock = vi.fn()

const reconFindUniqueOrThrowMock = vi.fn()
const reconUpdateManyMock = vi.fn()
const reconItemCreateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => journalFindUniqueOrThrowMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: vi.fn(),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn(),
  onPettyCashCreated: vi.fn(),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn(),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "JRN-0001"),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

import { postJournal, completeReconciliation } from "../finance.actions"

function balancedEntries() {
  return [
    { id: 1, journalId: 7, accountId: 100, debit: 500, credit: 0 },
    { id: 2, journalId: 7, accountId: 200, debit: 0, credit: 500 },
  ]
}

function balancedReconItems() {
  return [
    { id: 1, matched: true, cleared: true, type: "match", amount: 1000 },
  ]
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock,
    journalFindUniqueOrThrowMock, journalUpdateManyMock, journalUpdateMock,
    entryDeleteManyMock, entryCreateManyMock, executeRawMock, transactionMock,
    reconFindUniqueOrThrowMock, reconUpdateManyMock, reconItemCreateMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  executeRawMock.mockResolvedValue([])
  journalFindUniqueOrThrowMock.mockResolvedValue({
    id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
    entries: balancedEntries(),
  })
  journalUpdateManyMock.mockResolvedValue({ count: 1 })
  journalUpdateMock.mockResolvedValue({ id: 7 })
  entryDeleteManyMock.mockResolvedValue({ count: 2 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
  reconFindUniqueOrThrowMock.mockResolvedValue({
    id: 9, status: "draft", bookBalance: 1000, statementBalance: 1000,
    items: balancedReconItems(),
  })
  reconUpdateManyMock.mockResolvedValue({ count: 1 })
})

function wireJournalTx(order: string[]) {
  const tx = {
    $executeRaw: (...a: unknown[]) => {
      order.push("lock")
      return executeRawMock(...a)
    },
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => {
        order.push("reread")
        return journalFindUniqueOrThrowMock(...a)
      },
      updateMany: (...a: unknown[]) => {
        order.push("claim")
        return journalUpdateManyMock(...a)
      },
    },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

function wireReconTx(order: string[]) {
  const tx = {
    $executeRaw: (...a: unknown[]) => {
      order.push("lock")
      return executeRawMock(...a)
    },
    bankReconciliation: {
      findUniqueOrThrow: (...a: unknown[]) => {
        order.push("reread")
        return reconFindUniqueOrThrowMock(...a)
      },
      updateMany: (...a: unknown[]) => {
        order.push("claim")
        return reconUpdateManyMock(...a)
      },
    },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

describe("F-01 postJournal concurrency guard", () => {
  it("locks the journal row BEFORE re-reading status inside the transaction", async () => {
    const order: string[] = []
    wireJournalTx(order)

    const result = await postJournal(7)

    expect(result.success).toBe(true)
    expect(executeRawMock).toHaveBeenCalled() // FOR UPDATE lock taken
    // lock → re-read → conditional claim, strictly in this order
    expect(order).toEqual(["lock", "reread", "claim"])
  })

  it("rejects when the re-read status is no longer DRAFT (lost the race)", async () => {
    const order: string[] = []
    wireJournalTx(order)
    journalFindUniqueOrThrowMock
      .mockResolvedValueOnce({
        id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
        entries: balancedEntries(),
      })
      .mockResolvedValueOnce({ id: 7, status: "POSTED", entries: balancedEntries() })

    const result = await postJournal(7)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/sudah diposting|sedang diproses/)
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
  })
})

describe("F-02 completeReconciliation concurrency guard", () => {
  it("locks the reconciliation row BEFORE re-reading items inside the transaction", async () => {
    const order: string[] = []
    wireReconTx(order)

    const result = await completeReconciliation(9)

    expect(result.success).toBe(true)
    expect(executeRawMock).toHaveBeenCalled() // FOR UPDATE lock taken
    expect(order).toEqual(["lock", "reread", "claim"])
  })

  it("rejects when the re-read status is no longer draft (lost the race)", async () => {
    const order: string[] = []
    wireReconTx(order)
    reconFindUniqueOrThrowMock.mockResolvedValueOnce({
      id: 9, status: "completed", bookBalance: 1000, statementBalance: 1000,
      items: balancedReconItems(),
    })

    const result = await completeReconciliation(9)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/draft|diselesaikan|diproses/)
    expect(reconUpdateManyMock).not.toHaveBeenCalled()
  })
})
