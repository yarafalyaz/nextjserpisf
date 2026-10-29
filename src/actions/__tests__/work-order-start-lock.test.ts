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
// F-2026-10-21-020 Tahap A: startWorkOrder now also initializes stage rows
// inside the claim transaction; mock the three touchpoints so this guard
// stays focused on the atomic claim.
const opFindManyMock = vi.fn()
const opCreateManyMock = vi.fn()
const settingFindFirstMock = vi.fn()
// F-2026-10-21-012 inti: start kini juga melahirkan reservasi di tx klaim;
// mock touchpoint service supaya guard klaim tetap fokus.
const srFindManyMock = vi.fn()
const srCreateMock = vi.fn()
const miFindFirstMock = vi.fn()
const itemFindManyMock = vi.fn()
const miItemFindManyMock = vi.fn()

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
    workOrderOperation: {
      findMany: (...a: unknown[]) => opFindManyMock(...a),
      createMany: (...a: unknown[]) => opCreateManyMock(...a),
    },
    materialIssue: { findFirst: (...a: unknown[]) => miFindFirstMock(...a) },
    materialIssueItem: { findMany: (...a: unknown[]) => miItemFindManyMock(...a) },
    item: { findMany: (...a: unknown[]) => itemFindManyMock(...a) },
    inventoryLayer: { aggregate: vi.fn().mockResolvedValue({ _sum: { remaining: 0 } }) },
    stockReservation: {
      findMany: (...a: unknown[]) => srFindManyMock(...a),
      create: (...a: unknown[]) => srCreateMock(...a),
    },
    systemSetting: { findFirst: (...a: unknown[]) => settingFindFirstMock(...a) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 10 }]),
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
// F-50(a) intake gate is out of scope here; stub so the real helper does not
// query unmocked prisma models. Gate itself covered in qc.service.test.ts.
const intakeGateMock = vi.fn()
vi.mock("@/lib/services/qc.service", () => ({
  assertWorkOrderQcCleared: vi.fn().mockResolvedValue(undefined),
  assertProductionOrderQcCleared: vi.fn().mockResolvedValue(undefined),
  assertWorkOrderVehicleIntakeRecorded: (...a: unknown[]) => intakeGateMock(...a),
}))

vi.mock("@/lib/services/work-order-cost-estimate.service", () => ({
  snapshotWorkOrderCostEstimateTx: () => Promise.resolve(null),
}));
import { startWorkOrder } from "../manufacturing.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock,
    woFindUniqueOrThrowMock, woUpdateManyMock, woItemUpdateManyMock,
    opFindManyMock, opCreateManyMock, settingFindFirstMock,
  ]) m.mockReset()
  opFindManyMock.mockResolvedValue([])
  opCreateManyMock.mockResolvedValue({ count: 4 })
  srFindManyMock.mockResolvedValue([])
  srCreateMock.mockResolvedValue({ id: 1 })
  miFindFirstMock.mockResolvedValue(null)
  itemFindManyMock.mockResolvedValue([{ id: 7, defaultWarehouseId: 3 }])
  miItemFindManyMock.mockResolvedValue([])
  settingFindFirstMock.mockResolvedValue(null)
  requirePermissionMock.mockResolvedValue({ id: 5 })
  woFindUniqueOrThrowMock.mockResolvedValue({
    id: 10, status: "pending", documentNo: "WO-0001",
    items: [{ id: 1, itemId: 7, qty: 2, status: "pending" }],
  })
  woUpdateManyMock.mockResolvedValue({ count: 1 })
  woItemUpdateManyMock.mockResolvedValue({ count: 1 })
  intakeGateMock.mockReset()
  intakeGateMock.mockResolvedValue(undefined)
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
    // AC-RES-9: hanya pemenang klaim melahirkan reservasi.
    expect(srCreateMock).not.toHaveBeenCalled()
  })

  it("refuses to start a WO with no items", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 10, status: "pending", items: [] })

    const result = await startWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()
  })

  it("blocks start WITHOUT flipping items/status when the F-50(a) intake gate throws", async () => {
    intakeGateMock.mockRejectedValueOnce(
      new Error("Tidak dapat memulai Perintah Kerja: inspeksi masuk kendaraan belum tercatat"),
    )

    const result = await startWorkOrder(10)

    expect(result.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()
    expect(woItemUpdateManyMock).not.toHaveBeenCalled()
  })
})
