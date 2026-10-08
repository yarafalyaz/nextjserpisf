import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the approveExpense ordering fix. The petty-cash sync must
// run BEFORE the expense is flipped to "approved" so that a sync failure leaves
// the expense in "draft" (retryable) instead of permanently approved-but-
// unsynced (petty cash under-recorded, no retry path because approveExpense
// rejects non-draft input). A mocked Prisma cannot prove crash-atomicity, but
// it CAN durably assert the call ORDER so nobody silently reverts it.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertApprovedMock = vi.fn()
const syncPettyCashMock = vi.fn()

const expenseFindUniqueOrThrowMock = vi.fn()
const expenseUpdateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => expenseFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => expenseUpdateManyMock(...a),
    },
  },
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: (...a: unknown[]) => syncPettyCashMock(...a),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn(),
  onPettyCashCreated: vi.fn(),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: (...a: unknown[]) => assertApprovedMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn(),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "EXP-0001"),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))
vi.mock("@/lib/finance/petty-cash-chain", () => ({
  computePettyCashChain: vi.fn(),
  findFirstNegativeBalance: vi.fn(),
}))

import { approveExpense } from "../finance.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, assertApprovedMock,
    syncPettyCashMock, expenseFindUniqueOrThrowMock, expenseUpdateManyMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 7 })
  expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "draft", documentNo: "EXP-0001" })
  assertApprovedMock.mockResolvedValue(undefined)
  syncPettyCashMock.mockResolvedValue(undefined)
  expenseUpdateManyMock.mockResolvedValue({ count: 1 })
})

describe("approveExpense ordering guard", () => {
  it("syncs petty cash BEFORE flipping the expense to approved", async () => {
    const order: string[] = []
    syncPettyCashMock.mockImplementation(() => { order.push("sync"); return Promise.resolve() })
    expenseUpdateManyMock.mockImplementation(() => { order.push("approve"); return Promise.resolve({ count: 1 }) })

    const result = await approveExpense(42)

    expect(result.success).toBe(true)
    expect(syncPettyCashMock).toHaveBeenCalledWith(42, 7)
    expect(order).toEqual(["sync", "approve"]) // sync strictly precedes approve
  })

  it("does NOT approve the expense when the petty cash sync fails (stays retryable)", async () => {
    syncPettyCashMock.mockRejectedValue(new Error("petty cash boom"))

    const result = await approveExpense(42)

    expect(result.success).toBe(false)
    expect(expenseUpdateManyMock).not.toHaveBeenCalled() // expense remains retryable
  })

  it("still syncs petty cash for a workflow-approved expense (status already 'approved')", async () => {
    // The approval engine flips status to "approved" but never runs domain
    // side effects; approveExpense is what creates the petty-cash record.
    // Rejecting non-draft status here left workflow-approved expenses un-synced.
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "approved", documentNo: "EXP-0001" })

    const result = await approveExpense(42)

    expect(result.success).toBe(true)
    expect(syncPettyCashMock).toHaveBeenCalledWith(42, 7)
    expect(expenseUpdateManyMock).toHaveBeenCalled()
  })

  it("rejects approving an expense that is in a terminal state", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "rejected", documentNo: "EXP-0001" })

    const result = await approveExpense(42)

    expect(result.success).toBe(false)
    expect(syncPettyCashMock).not.toHaveBeenCalled()
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })
})
