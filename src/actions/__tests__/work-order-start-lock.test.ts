import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the startWorkOrder race fix. Previously the action read
// the WO status, then issued an unconditional update() inside a transaction —
// two concurrent "mulai" clicks could both pass the in-memory guard. The fix is
// an atomic conditional claim (updateMany WHERE status IN (pending,draft)):
// only the winner (count===1) proceeds to flip items; the loser (count===0)
// throws. A mocked Prisma can't prove DB atomicity, but it CAN durably assert
// that starting goes through the conditional claim and that a lost claim aborts
// before touching WO items.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()

const woFindUniqueOrThrowMock = vi.fn()
const woUpdateManyMock = vi.fn()
const woItemUpdateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  const prisma = {
    workOrder: {
      findUniqueOrThrow: (...a: unknown[]) => woFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => woUpdateManyMock(...a),
    },
    workOrderItem: { updateMany: (...a: unknown[]) => woItemUpdateManyMock(...a) },
    $transaction: vi.fn((cb: unknown) =>
      typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
    ),
  }
  return { prisma }
})
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { startWorkOrder } from "../manufacturing.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock,
    woFindUniqueOrThrowMock, woUpdateManyMock, woItemUpdateManyMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 5 })
  woFindUniqueOrThrowMock.mockResolvedValue({
    id: 10, status: "pending", documentNo: "WO-0001",
    items: [{ itemId: 7, qty: 2 }],
  })
  woUpdateManyMock.mockResolvedValue({ count: 1 })
  woItemUpdateManyMock.mockResolvedValue({ count: 1 })
})

describe("startWorkOrder concurrency guard", () => {
  it("starts via an atomic conditional claim scoped to pending/draft", async () => {
    const result = await startWorkOrder(10)

    expect(result.success).toBe(true)
    expect(woUpdateManyMock).toHaveBeenCalledTimes(1)
    const claimArg = woUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where.id).toBe(10)
    expect(claimArg.where.status).toEqual({ in: ["pending", "draft"] })
    expect(claimArg.data.status).toBe("in_progress")
    expect(woItemUpdateManyMock).toHaveBeenCalledTimes(1)
  })

  it("aborts WITHOUT flipping items when the claim is lost (count===0)", async () => {
    woUpdateManyMock.mockResolvedValue({ count: 0 }) // another request won

    const result = await startWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woItemUpdateManyMock).not.toHaveBeenCalled()
  })

  it("refuses to start a WO with no items", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 10, status: "pending", items: [] })

    const result = await startWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()
  })
})
