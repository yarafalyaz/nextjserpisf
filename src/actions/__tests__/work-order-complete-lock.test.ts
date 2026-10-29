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
const queryRawMock = vi.fn().mockResolvedValue([{ id: 10 }])

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  const prisma = {
    workOrder: {
      findUniqueOrThrow: (...a: unknown[]) => woFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => woUpdateManyMock(...a),
      // F-2026-10-21-021: hook coverage di dalam tx membaca kendaraan WO.
      findUnique: vi.fn().mockResolvedValue({ customerVehicleId: null }),
    },
    workOrderItem: { updateMany: (...a: unknown[]) => woItemUpdateManyMock(...a) },
    materialIssue: { findFirst: (...a: unknown[]) => miFindFirstMock(...a) },
    stockReservation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesOrder: { findFirst: (...a: unknown[]) => soFindFirstMock(...a) },
    deliveryOrder: { create: (...a: unknown[]) => doCreateMock(...a) },
    deliveryOrderItem: { createMany: (...a: unknown[]) => doItemCreateManyMock(...a) },
    // completeWorkOrder now wraps the claim + item flip in a $transaction;
    // run the callback against the same mock so the existing per-model
    // assertions still observe the calls.
    $transaction: vi.fn((cb: unknown) =>
      typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
    ),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
  }
  return { prisma }
})
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumberMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
// QC gate is stubbed here; round3 asserts it is invoked with the tx client
// (guards read inside the completion transaction, not outside).
const assertQcClearedMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/services/qc.service", () => ({
  assertWorkOrderQcCleared: (...a: unknown[]) => assertQcClearedMock(...a),
}))
// F-2026-10-21-021: hook auto-create coverage wajib terpanggil di dalam
// transaksi completion. Cabut panggilan di completeWorkOrder = tes ini merah.
const createWarrantyCoveragesMock = vi.fn().mockResolvedValue({ created: 0 })
vi.mock("@/lib/services/warranty.service", () => ({
  createWarrantyCoveragesForWorkOrder: (...a: unknown[]) => createWarrantyCoveragesMock(...a),
}))
// F-2026-10-22-072-S: registri InstalledPart lahir dalam tx completion yang
// sama, sesudah coverage. Cabut panggilan di completeWorkOrder = tes merah.
const createInstalledPartsMock = vi.fn().mockResolvedValue({ created: 0, skipped: 0 })
vi.mock("@/lib/services/installed-part.service", () => ({
  createInstalledPartsForWorkOrder: (...a: unknown[]) => createInstalledPartsMock(...a),
}))

import { completeWorkOrder } from "../manufacturing.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, woFindUniqueOrThrowMock,
    woUpdateManyMock, woItemUpdateManyMock, miFindFirstMock, soFindFirstMock,
    doCreateMock, doItemCreateManyMock, generateDocNumberMock,
  ]) m.mockReset()
  queryRawMock.mockReset()
  queryRawMock.mockResolvedValue([{ id: 10 }])
  assertQcClearedMock.mockReset()
  assertQcClearedMock.mockResolvedValue(undefined)
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
    // F-2026-10-21-021 tahap 1: coverage garansi dibuat dalam tx completion.
    expect(createWarrantyCoveragesMock).toHaveBeenCalledTimes(1)
    expect(createWarrantyCoveragesMock.mock.calls[0][0]).toBe(10)
    // F-2026-10-22-072-S: registri part terpasang lahir di tx yang sama.
    expect(createInstalledPartsMock).toHaveBeenCalledTimes(1)
    expect(createInstalledPartsMock.mock.calls[0][0]).toBe(10)
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

  // Round3 MEDIUM: MI + QC guards must be read INSIDE the completion tx
  // (under WO row lock), mirroring auto-close path. Reverting guards to
  // outside-tx reads drops $queryRaw/QC-tx assertions -> merah.
  it("round3: guards run inside tx — WO row locked, QC receives tx client", async () => {
    const result = await completeWorkOrder(10)

    expect(result.success).toBe(true)
    expect(queryRawMock).toHaveBeenCalledTimes(1)
    expect(String(queryRawMock.mock.calls[0][0])).toContain("work_orders")
    expect(assertQcClearedMock).toHaveBeenCalledWith(10, expect.anything())
    expect(miFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: 10, status: "completed" } }),
    )
  })

  it("round3: QC block inside tx aborts before claim", async () => {
    assertQcClearedMock.mockRejectedValueOnce(new Error("NCR terbuka"))

    const result = await completeWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()
    expect(doCreateMock).not.toHaveBeenCalled()
  })
})
