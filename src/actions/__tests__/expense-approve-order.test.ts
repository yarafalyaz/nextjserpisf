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
const expenseUpdateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => expenseFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => expenseUpdateMock(...a),
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
    syncPettyCashMock, expenseFindUniqueOrThrowMock, expenseUpdateMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 7 })
  expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "draft", documentNo: "EXP-0001" })
  assertApprovedMock.mockResolvedValue(undefined)
  syncPettyCashMock.mockResolvedValue(undefined)
  expenseUpdateMock.mockResolvedValue({})
})

describe("approveExpense ordering guard", () => {
  it("syncs petty cash BEFORE flipping the expense to approved", async () => {
    const order: string[] = []
    syncPettyCashMock.mockImplementation(() => { order.push("sync"); return Promise.resolve() })
    expenseUpdateMock.mockImplementation(() => { order.push("approve"); return Promise.resolve({}) })

    const result = await approveExpense(42)

    expect(result.success).toBe(true)
    expect(syncPettyCashMock).toHaveBeenCalledWith(42, 7)
    expect(order).toEqual(["sync", "approve"]) // sync strictly precedes approve
  })

  it("does NOT approve the expense when the petty cash sync fails (stays retryable)", async () => {
    syncPettyCashMock.mockRejectedValue(new Error("petty cash boom"))

    const result = await approveExpense(42)

    expect(result.success).toBe(false)
    expect(expenseUpdateMock).not.toHaveBeenCalled() // expense remains in draft
  })

  it("rejects approving an expense that is not in draft", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ id: 42, status: "approved", documentNo: "EXP-0001" })

    const result = await approveExpense(42)

    expect(result.success).toBe(false)
    expect(syncPettyCashMock).not.toHaveBeenCalled()
    expect(expenseUpdateMock).not.toHaveBeenCalled()
  })
})
