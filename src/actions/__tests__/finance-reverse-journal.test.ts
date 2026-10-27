import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock permissions + prisma + services
const requirePermissionMock = vi.fn()
const logActivityMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertPeriodOpenMock = vi.fn()
const generateDocumentNumberMock = vi.fn()

const journalFindUniqueOrThrowMock = vi.fn()
const journalFindUniqueMock = vi.fn()
const journalUpdateManyMock = vi.fn()
const journalUpdateMock = vi.fn()
const journalCreateMock = vi.fn()
const entryCreateManyMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => journalFindUniqueOrThrowMock(...a),
      findUnique: (...a: unknown[]) => journalFindUniqueMock(...a),
      updateMany: (...a: unknown[]) => journalUpdateManyMock(...a),
      update: (...a: unknown[]) => journalUpdateMock(...a),
      create: (...a: unknown[]) => journalCreateMock(...a),
    },
    journalEntry: {
      createMany: (...a: unknown[]) => entryCreateManyMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}))

import { reverseJournal } from "../finance.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock,
    logActivityMock,
    revalidatePathMock,
    assertPeriodOpenMock,
    generateDocumentNumberMock,
    journalFindUniqueOrThrowMock,
    journalFindUniqueMock,
    journalUpdateManyMock,
    journalUpdateMock,
    journalCreateMock,
    entryCreateManyMock,
    transactionMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  generateDocumentNumberMock.mockResolvedValue("JRN-RV-0001")
  journalFindUniqueOrThrowMock.mockResolvedValue({
    id: 7,
    status: "POSTED",
    transactionDate: new Date("2026-06-15"),
    journalNumber: "JRN-202606-00007",
    description: "Sale",
    type: "GENERAL",
    totalDebit: 1000,
    totalCredit: 1000,
    entries: [
      { accountId: 100, debit: 1000, credit: 0, memo: "kas", costCenterId: null, profitCenterId: null },
      { accountId: 200, debit: 0, credit: 1000, memo: "modal", costCenterId: null, profitCenterId: null },
    ],
  })
  // claim succeeds
  journalUpdateManyMock.mockResolvedValue({ count: 1 })
  // wire transaction: lock → re-read → claim → reversal, all inside one tx.
  // The outer prisma.journal mocks double as the in-tx client (same pattern
  // as finance.actions.test.ts, whose $transaction passes prismaMock itself).
  const txClient = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    journal: {
      findUniqueOrThrow: journalFindUniqueOrThrowMock,
      updateMany: journalUpdateManyMock,
      update: journalUpdateMock,
      create: journalCreateMock,
    },
    journalEntry: { createMany: entryCreateManyMock },
  }
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient))
  journalCreateMock.mockResolvedValue({ id: 99 })
  journalUpdateMock.mockResolvedValue({ id: 7 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
})

describe("reverseJournal", () => {
  it("reverses a POSTED journal and flips status to REVERSED", async () => {
    const result = await reverseJournal(7)
    expect(result.success).toBe(true)
    expect(journalCreateMock).toHaveBeenCalled()
    expect(journalUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { status: "REVERSED" },
      })
    )
  })

  it("dates the reversal journal to the ORIGINAL transactionDate (so period reports net to zero)", async () => {
    const originalDate = new Date("2026-06-15")
    await reverseJournal(7)

    const created = journalCreateMock.mock.calls[0][0] as {
      data: { transactionDate: Date; status: string; referenceId: number }
    }
    // Same period as the original → the (REVERSED original + reversal) pair
    // stays inside one period; a period P&L for June nets to zero and July is
    // not polluted by a reversal of a June journal.
    expect(created.data.transactionDate).toEqual(originalDate)
    expect(created.data.status).toBe("POSTED")
    expect(created.data.referenceId).toBe(7)
  })

  it("TASK-025: menolak reversal atas jurnal reversal (referenceType Journal), nol jurnal ditulis", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 99,
      status: "POSTED",
      referenceType: "Journal",
      referenceId: 7,
      transactionDate: new Date("2026-06-15"),
      journalNumber: "JRN-RV-0001",
      description: "Reversal of JRN-202606-00007",
      type: "GENERAL",
      totalDebit: 1000,
      totalCredit: 1000,
      entries: [
        { accountId: 100, debit: 0, credit: 1000, memo: "kas", costCenterId: null, profitCenterId: null },
        { accountId: 200, debit: 1000, credit: 0, memo: "modal", costCenterId: null, profitCenterId: null },
      ],
    })

    const result = await reverseJournal(99)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Jurnal reversal tidak boleh di-reverse lagi")
    expect(journalCreateMock).not.toHaveBeenCalled()
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })

  it("rolls the tx back when the reversal body throws (atomic claim+reversal)", async () => {
    // The claim now lives INSIDE the same tx as the reversal: a tx failure
    // rolls both back atomically. No outer claim + compensating restore
    // exists anymore — the journal stays POSTED and retryable by rollback.
    // Make the inner tx throw
    transactionMock.mockImplementation(async () => {
      throw new Error("simulated tx failure")
    })

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("simulated tx failure")
    // Nothing committed: no reversal journal row
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("leaves the journal POSTED when the period is closed (atomic rollback, retryable)", async () => {
    // Simulate: an admin clicks Reverse on a journal whose transactionDate
    // belongs to a period that has since been closed. assertPeriodOpen throws
    // INSIDE the tx — the tx rolls back, the journal stays POSTED, retryable.
    assertPeriodOpenMock.mockRejectedValueOnce(
      new Error("Periode akuntansi sudah ditutup")
    )

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("ditutup")

    // The claim + reversal both rolled back: no reversal journal committed.
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("leaves the journal POSTED when generateDocumentNumber throws (atomic rollback)", async () => {
    // The sequence-generator failure also happens INSIDE the tx — rollback
    // keeps the journal POSTED and retryable, no compensating restore needed.
    generateDocumentNumberMock.mockRejectedValueOnce(new Error("seq boom"))

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(journalCreateMock).not.toHaveBeenCalled()
  })
})
