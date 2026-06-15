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
  // wire transaction
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      journal: { create: journalCreateMock, update: journalUpdateMock },
      journalEntry: { createMany: entryCreateManyMock },
    })
  )
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

  it("rolls the REVERSING claim back to POSTED when the reversal tx throws", async () => {
    // First call to journalUpdateMany = the claim (succeeds). Second call =
    // the rollback inside the inner catch (must run to keep journal retryable).
    let claimCount = 0
    journalUpdateManyMock.mockImplementation(async (args: { data: { status: string } }) => {
      if (args.data.status === "REVERSING") {
        claimCount++
        return { count: 1 }
      }
      if (args.data.status === "POSTED") {
        return { count: 1 }
      }
      return { count: 0 }
    })

    // Make the inner tx throw
    transactionMock.mockImplementation(async () => {
      throw new Error("simulated tx failure")
    })

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(claimCount).toBe(1)

    // Verify the rollback updateMany was called to restore status POSTED
    const restoreCall = journalUpdateManyMock.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data?.status === "POSTED"
    )
    expect(restoreCall).toBeTruthy()
    expect((restoreCall?.[0] as { where: { status: string } }).where).toEqual({
      id: 7,
      status: "REVERSING",
    })
  })

  it("rolls the REVERSING claim back to POSTED when the period is closed (regression: bug left journal stuck in REVERSING)", async () => {
    // Simulate: an admin clicks Reverse on a journal whose transactionDate
    // belongs to a period that has since been closed. assertPeriodOpen throws
    // AFTER the claim has already flipped POSTED -> REVERSING. The bug:
    // assertPeriodOpen was outside the inner rollback try/catch, so the
    // journal was left permanently in REVERSING (invisible to GL reports
    // and no longer reversible, since the claim requires POSTED).
    let rollbackCallSeen = false
    journalUpdateManyMock.mockImplementation(async (args: { data: { status: string } }) => {
      if (args.data.status === "REVERSING") return { count: 1 }
      if (args.data.status === "POSTED") {
        rollbackCallSeen = true
        return { count: 1 }
      }
      return { count: 0 }
    })

    assertPeriodOpenMock.mockRejectedValueOnce(
      new Error("Periode akuntansi sudah ditutup")
    )

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("ditutup")

    // The fix must restore the claim so the journal is retryable.
    expect(rollbackCallSeen).toBe(true)
  })

  it("rolls the REVERSING claim back to POSTED when generateDocumentNumber throws", async () => {
    // The sequence-generator is also a DB-touching step that can fail (unique
    // collision retries, sequence exhaustion, etc.). If it throws after the
    // claim, the same rollback must apply.
    let rollbackCallSeen = false
    journalUpdateManyMock.mockImplementation(async (args: { data: { status: string } }) => {
      if (args.data.status === "REVERSING") return { count: 1 }
      if (args.data.status === "POSTED") {
        rollbackCallSeen = true
        return { count: 1 }
      }
      return { count: 0 }
    })

    generateDocumentNumberMock.mockRejectedValueOnce(new Error("seq boom"))

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(rollbackCallSeen).toBe(true)
  })
})
