import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the completeWorkOrder race fix. Two concurrent "selesai"
// clicks could both pass the in-memory status guard and each run
// autoCreateDeliveryOrder → duplicate Delivery Orders. The fix is an atomic
// conditional claim: updateMany WHERE status IN (in_progress,pending); only the
// winner (count===1) proceeds, the loser (count===0) throws. A mocked Prisma
// can't prove DB atomicity, but it CAN durably assert that completion goes
// through the conditional claim and that a lost claim aborts before creating a
// delivery order.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()

const woFindUniqueOrThrowMock = vi.fn()
const woUpdateManyMock = vi.fn()
const woItemUpdateManyMock = vi.fn()
const miFindFirstMock = vi.fn()
const soFindFirstMock = vi.fn()
const doCreateMock = vi.fn()
const doItemCreateManyMock = vi.fn()
const generateDocNumberMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: {
      findUniqueOrThrow: (...a: unknown[]) => woFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => woUpdateManyMock(...a),
    },
    workOrderItem: { updateMany: (...a: unknown[]) => woItemUpdateManyMock(...a) },
    materialIssue: { findFirst: (...a: unknown[]) => miFindFirstMock(...a) },
    salesOrder: { findFirst: (...a: unknown[]) => soFindFirstMock(...a) },
    deliveryOrder: { create: (...a: unknown[]) => doCreateMock(...a) },
    deliveryOrderItem: { createMany: (...a: unknown[]) => doItemCreateManyMock(...a) },
  },
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumberMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { completeWorkOrder } from "../manufacturing.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, woFindUniqueOrThrowMock,
    woUpdateManyMock, woItemUpdateManyMock, miFindFirstMock, soFindFirstMock,
    doCreateMock, doItemCreateManyMock, generateDocNumberMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 5 })
  woFindUniqueOrThrowMock.mockResolvedValue({
    id: 10, status: "in_progress", documentNo: "WO-0001", customerId: 3,
    quotationId: 50, projectId: null,
    items: [{ itemId: 7, qty: 2, description: "part" }],
  })
  miFindFirstMock.mockResolvedValue({ id: 1, status: "completed" })
  woUpdateManyMock.mockResolvedValue({ count: 1 })
  woItemUpdateManyMock.mockResolvedValue({ count: 1 })
  soFindFirstMock.mockResolvedValue({ id: 200 })
  generateDocNumberMock.mockResolvedValue("DO-0001")
  doCreateMock.mockResolvedValue({ id: 300 })
  doItemCreateManyMock.mockResolvedValue({ count: 1 })
})

describe("completeWorkOrder concurrency guard", () => {
  it("completes via an atomic conditional claim scoped to in_progress/pending", async () => {
    const result = await completeWorkOrder(10)

    expect(result.success).toBe(true)
    expect(woUpdateManyMock).toHaveBeenCalledTimes(1)
    const claimArg = woUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where.id).toBe(10)
    expect(claimArg.where.status).toEqual({ in: ["in_progress", "pending"] })
    expect(claimArg.data.status).toBe("completed")
  })

  it("aborts WITHOUT creating a delivery order when the claim is lost (count===0)", async () => {
    woUpdateManyMock.mockResolvedValue({ count: 0 }) // another request won the race

    const result = await completeWorkOrder(10)

    expect(result.success).toBe(false)
    expect(doCreateMock).not.toHaveBeenCalled()       // no duplicate Delivery Order
    expect(woItemUpdateManyMock).not.toHaveBeenCalled()
  })

  it("refuses completion without a completed Material Issue", async () => {
    miFindFirstMock.mockResolvedValue(null)

    const result = await completeWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()   // never claims completion
  })
})
