import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertPeriodOpenMock = vi.fn()

const journalFindUniqueOrThrowMock = vi.fn()
const journalUpdateMock = vi.fn()
const entryDeleteManyMock = vi.fn()
const entryCreateManyMock = vi.fn()
const attachmentUpdateManyMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => journalFindUniqueOrThrowMock(...a),
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
  generateDocumentNumber: vi.fn(async () => "JRN-0001"),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))

import { updateJournal } from "../finance.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

// A fake tx client wired into prisma.$transaction
function wireTransaction() {
  const tx = {
    journal: { update: journalUpdateMock },
    journalEntry: { deleteMany: entryDeleteManyMock, createMany: entryCreateManyMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock,
    journalFindUniqueOrThrowMock, journalUpdateMock, entryDeleteManyMock,
    entryCreateManyMock, attachmentUpdateManyMock, transactionMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  journalFindUniqueOrThrowMock.mockResolvedValue({ id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01") })
  journalUpdateMock.mockResolvedValue({ id: 7 })
  entryDeleteManyMock.mockResolvedValue({ count: 2 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
  wireTransaction()
})

describe("updateJournal", () => {
  const validEntries = JSON.stringify([
    { accountId: 100, debit: 500, credit: 0, memo: "kas" },
    { accountId: 200, debit: 0, credit: 500, memo: "modal" },
  ])

  it("rejects editing a non-DRAFT journal", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({ id: 7, status: "POSTED", transactionDate: new Date("2026-06-01") })
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: validEntries }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah diposting")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("rejects an unbalanced edit (debit != credit)", async () => {
    const unbalanced = JSON.stringify([
      { accountId: 100, debit: 500, credit: 0 },
      { accountId: 200, debit: 0, credit: 400 },
    ])
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: unbalanced }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("rejects when fewer than 2 valid entries", async () => {
    const single = JSON.stringify([{ accountId: 100, debit: 500, credit: 0 }])
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: single }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("minimal 2 entri")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("rejects a line with both debit and credit set", async () => {
    // Totals balance (1000 == 1000) so the per-line exclusivity guard is what fires.
    const both = JSON.stringify([
      { accountId: 100, debit: 500, credit: 500 },
      { accountId: 200, debit: 500, credit: 500 },
    ])
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: both }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("debit dan credit sekaligus")
  })

  it("replaces entries atomically on a valid balanced edit", async () => {
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", description: "edit", entries: validEntries }))
    expect(result.success).toBe(true)
    // Header updated with recomputed totals
    expect(journalUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ totalDebit: 500, totalCredit: 500 }),
      }),
    )
    // Old entries removed, new ones recreated (the previously-dropped lines now persist)
    expect(entryDeleteManyMock).toHaveBeenCalledWith({ where: { journalId: 7 } })
    expect(entryCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ journalId: 7, accountId: 100, debit: 500, credit: 0 }),
          expect.objectContaining({ journalId: 7, accountId: 200, debit: 0, credit: 500 }),
        ]),
      }),
    )
  })

  it("blocks edits into a closed accounting period", async () => {
    assertPeriodOpenMock.mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"))
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: validEntries }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("ditutup")
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
