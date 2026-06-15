import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the journal double-entry decimal precision bug.
// The action layer (createJournal / updateJournal) computes the balance
// check with safeAdd(..., 0) — i.e. rounding each line to whole IDR.
// When the journal schema is Decimal(15,2), two-decimal fractional
// amounts round to 0 at every step of the reduce, so a journal with
// debit 0.40+0.40=0.80 and credit 0.20+0.20=0.40 (clearly unbalanced
// at 2 decimals) is accepted as "balanced" because both totals round
// to 0. This violates double-entry integrity: an unbalanced journal is
// persisted to the database.
//
// The fix is to use 2 decimals for the balance check so it matches
// the Decimal(15,2) precision the DB enforces.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertPeriodOpenMock = vi.fn()
const generateDocumentNumberMock = vi.fn()

const journalFindUniqueOrThrowMock = vi.fn()
const journalUpdateMock = vi.fn()
const journalCreateMock = vi.fn()
const entryCreateManyMock = vi.fn()
const entryDeleteManyMock = vi.fn()
const attachmentUpdateManyMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => journalFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => journalUpdateMock(...a),
      create: (...a: unknown[]) => journalCreateMock(...a),
    },
    journalEntry: {
      createMany: (...a: unknown[]) => entryCreateManyMock(...a),
      deleteMany: (...a: unknown[]) => entryDeleteManyMock(...a),
    },
    transactionAttachment: {
      updateMany: (...a: unknown[]) => attachmentUpdateManyMock(...a),
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
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))

import { createJournal, updateJournal, postJournal } from "../finance.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

function wireCreateTx() {
  const tx = {
    journal: { create: journalCreateMock },
    journalEntry: { createMany: entryCreateManyMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

function wireUpdateTx() {
  const tx = {
    journal: { update: journalUpdateMock },
    journalEntry: { createMany: entryCreateManyMock, deleteMany: entryDeleteManyMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock,
    generateDocumentNumberMock, journalFindUniqueOrThrowMock, journalUpdateMock,
    journalCreateMock, entryCreateManyMock, entryDeleteManyMock,
    attachmentUpdateManyMock, transactionMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  generateDocumentNumberMock.mockResolvedValue("JRN-0001")
  journalCreateMock.mockResolvedValue({ id: 11 })
  journalUpdateMock.mockResolvedValue({ id: 11 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
  entryDeleteManyMock.mockResolvedValue({ count: 2 })
  journalFindUniqueOrThrowMock.mockResolvedValue({
    id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
  })
})

describe("journal balance check honors Decimal(15,2) precision", () => {
  it("createJournal rejects fractional-decimal entries whose 2-decimal sums differ (drift at 0 decimals)", async () => {
    // debit 0.40 + 0.40 = 0.80 ; credit 0.20 + 0.20 = 0.40. Clearly unbalanced
    // at 2 decimals (0.80 != 0.40). With safeAdd(..., 0) both totals round to
    // 0 and the journal is wrongly accepted. The fix uses 2 decimals.
    wireCreateTx()
    const unbalanced = JSON.stringify([
      { accountId: 100, debit: 0.40, credit: 0, memo: "" },
      { accountId: 200, debit: 0.40, credit: 0, memo: "" },
      { accountId: 300, debit: 0, credit: 0.20, memo: "" },
      { accountId: 400, debit: 0, credit: 0.20, memo: "" },
    ])
    const result = await createJournal(fd({ transactionDate: "2026-06-02", entries: unbalanced }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("updateJournal rejects the same fractional-decimal drift as createJournal", async () => {
    wireUpdateTx()
    const unbalanced = JSON.stringify([
      { accountId: 100, debit: 0.40, credit: 0, memo: "" },
      { accountId: 200, debit: 0.40, credit: 0, memo: "" },
      { accountId: 300, debit: 0, credit: 0.20, memo: "" },
      { accountId: 400, debit: 0, credit: 0.20, memo: "" },
    ])
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: unbalanced }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("postJournal also rejects a draft whose 2-decimal entries are unbalanced", async () => {
    // Imagine a draft was somehow saved with unbalanced decimals (e.g. via a
    // previous createJournal bug). postJournal must NOT promote it to POSTED
    // — but the existing safeAdd(..., 0) reduce masks the imbalance.
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
      entries: [
        { debit: 0.40, credit: 0 },
        { debit: 0.40, credit: 0 },
        { debit: 0, credit: 0.20 },
        { debit: 0, credit: 0.20 },
      ],
    })

    const result = await postJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })
})
