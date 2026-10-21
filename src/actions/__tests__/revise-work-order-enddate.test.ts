import { describe, it, expect, vi, beforeEach } from "vitest"
import { reviseWorkOrderItems } from "../inventory.actions"

// F-2026-10-21-035 Q-LEAD-3: geser endDate WO in_progress lewat jalur sempit
// reviseWorkOrderItems — hanya endDate + 1 baris work_order_end_date_changed,
// tanpa menyentuh item/stok. Mock mandiri (butuh activityLog.create).

const m = await vi.hoisted(async () => {
  const { vi: v } = await import("vitest")
  return {
    requirePermissionMock: v.fn(),
    revalidateMock: v.fn(),
    logActivityMock: v.fn(),
    woFindUniqueOrThrow: v.fn(),
    activityLogCreate: v.fn(),
    transactionMock: v.fn(),
    woUpdateMany: v.fn(),
    woiFindMany: v.fn(),
    woiUpdateMany: v.fn(),
    woiCreateMany: v.fn(),
    miItemFindMany: v.fn(),
  }
})
const {
  requirePermissionMock,
  logActivityMock,
  woFindUniqueOrThrow,
  activityLogCreate,
  transactionMock,
  woUpdateMany,
  woiUpdateMany,
  woiCreateMany,
} = m

const tx = {
  workOrder: { updateMany: (...a: unknown[]) => m.woUpdateMany(...a) },
  workOrderItem: {
    findMany: (...a: unknown[]) => m.woiFindMany(...a),
    updateMany: (...a: unknown[]) => m.woiUpdateMany(...a),
    createMany: (...a: unknown[]) => m.woiCreateMany(...a),
  },
  materialIssueItem: { findMany: (...a: unknown[]) => m.miItemFindMany(...a) },
}

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: m.requirePermissionMock }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUniqueOrThrow: m.woFindUniqueOrThrow },
    activityLog: { create: m.activityLogCreate },
    $transaction: m.transactionMock,
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: m.logActivityMock }))
vi.mock("next/cache", () => ({ revalidatePath: m.revalidateMock }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 5, roles: [] })
  woFindUniqueOrThrow.mockResolvedValue({
    id: 10,
    status: "in_progress",
    endDate: new Date(Date.UTC(2024, 1, 10)), // 2024-02-10
  })
  m.woUpdateMany.mockResolvedValue({ count: 1 })
  m.woiFindMany.mockResolvedValue([])
  m.woiUpdateMany.mockResolvedValue({ count: 0 })
  m.woiCreateMany.mockResolvedValue({ count: 0 })
  m.miItemFindMany.mockResolvedValue([])
  activityLogCreate.mockResolvedValue({ id: 99 })
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
})

describe("reviseWorkOrderItems geser endDate (F-2026-10-21-035 Q-LEAD-3)", () => {
  it("geser saja tanpa revisi item + alasan valid -> endDate ter-update + 1 baris log", async () => {
    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      newEndDate: "2024-02-20",
      endDateReasonCode: "queue_capacity",
    })

    expect(res.success).toBe(true)
    expect(woUpdateMany).toHaveBeenCalledTimes(1)
    const claimData = (woUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(claimData.endDate).toEqual(new Date(Date.UTC(2024, 1, 20)))
    expect(woiUpdateMany).not.toHaveBeenCalled()
    expect(woiCreateMany).not.toHaveBeenCalled()
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work_order_end_date_changed",
        modelType: "WorkOrder",
        modelId: 10,
        metadata: JSON.stringify({ reasonCode: "queue_capacity" }),
        oldValues: { endDate: "2024-02-10" },
        newValues: { endDate: "2024-02-20" },
      }),
    })
  })

  it("geser dari non-null TANPA alasan -> ditolak, nol transaksi", async () => {
    const res = await reviseWorkOrderItems({ workOrderId: 10, newEndDate: "2024-02-20" })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Alasan wajib diisi/)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(activityLogCreate).not.toHaveBeenCalled()
  })

  it("newEndDate sama dengan tersimpan + tanpa item -> ditolak nol perubahan", async () => {
    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      newEndDate: "2024-02-10",
      endDateReasonCode: "part_delay",
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak berubah/)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("pengisian pertama dari null tanpa alasan -> sah + tercatat", async () => {
    woFindUniqueOrThrow.mockResolvedValue({ id: 10, status: "in_progress", endDate: null })

    const res = await reviseWorkOrderItems({ workOrderId: 10, newEndDate: "2024-02-20" })

    expect(res.success).toBe(true)
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work_order_end_date_changed",
        metadata: null,
        oldValues: { endDate: null },
        newValues: { endDate: "2024-02-20" },
      }),
    })
  })

  it("WO completed tetap terkunci untuk geser endDate", async () => {
    woFindUniqueOrThrow.mockResolvedValue({
      id: 10,
      status: "completed",
      endDate: new Date(Date.UTC(2024, 1, 10)),
    })

    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      newEndDate: "2024-02-20",
      endDateReasonCode: "part_delay",
    })

    expect(res.success).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(activityLogCreate).not.toHaveBeenCalled()
  })

  it("geser + revisi item bersamaan -> dua-duanya jalan, tetap 1 baris log endDate", async () => {
    m.woiFindMany.mockResolvedValue([{ id: 1, itemId: 100, status: "pending" }])

    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      replacedItemIds: [1],
      newEndDate: "2024-02-20",
      endDateReasonCode: "scope_change",
    })

    expect(res.success).toBe(true)
    expect(woiUpdateMany).toHaveBeenCalledTimes(1)
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    expect(logActivityMock).toHaveBeenCalledTimes(1)
  })

  it("revisi item tanpa newEndDate -> perilaku lama, nol log endDate", async () => {
    m.woiFindMany.mockResolvedValue([{ id: 1, itemId: 100, status: "pending" }])

    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })

    expect(res.success).toBe(true)
    const claimData = (woUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect("endDate" in claimData).toBe(false)
    expect(activityLogCreate).not.toHaveBeenCalled()
  })
})
