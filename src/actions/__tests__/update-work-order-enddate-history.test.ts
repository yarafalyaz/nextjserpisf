import { describe, it, expect, vi, beforeEach } from "vitest"
import { updateWorkOrder } from "../inventory.actions"

// F-2026-10-21-035: histori geser endDate di updateWorkOrder.
// Mock prisma khusus file ini (bukan work-order-test-utils bersama): inventaris
// mock itu tidak punya activityLog, dan mengubahnya bisa memengaruhi suite
// guard/revise yang berbagi util yang sama.

const m = await vi.hoisted(async () => {
  const { vi: v } = await import("vitest")
  return {
    requirePermissionMock: v.fn(),
    revalidateMock: v.fn(),
    logActivityMock: v.fn(),
    userSessionMock: v.fn(),
    woFindUniqueOrThrow: v.fn(),
    activityLogCreate: v.fn(),
    transactionMock: v.fn(),
    woUpdateMany: v.fn(),
    woiDeleteMany: v.fn(),
    woiCreateMany: v.fn(),
  }
})
const {
  requirePermissionMock,
  logActivityMock,
  userSessionMock,
  woFindUniqueOrThrow,
  activityLogCreate,
  transactionMock,
  woUpdateMany,
  woiDeleteMany,
  woiCreateMany,
} = m

// State transaksi yang ditiru: claim status selalu menang (count 1) +
// delete/recreate item no-op — cukup untuk updateWorkOrder lolos penuh.
const tx = {
  workOrder: { updateMany: (...a: unknown[]) => woUpdateMany(...a) },
  workOrderItem: {
    deleteMany: (...a: unknown[]) => woiDeleteMany(...a),
    createMany: (...a: unknown[]) => woiCreateMany(...a),
  },
}

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: m.requirePermissionMock }))
vi.mock("@/lib/auth/auth", () => ({ auth: m.userSessionMock }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // workOrder.findFirst dipakai nextSlug (delegate slug bernama sama).
    workOrder: { findUniqueOrThrow: m.woFindUniqueOrThrow, findFirst: vi.fn().mockResolvedValue(null) },
    activityLog: { create: m.activityLogCreate },
    $transaction: m.transactionMock,
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: m.logActivityMock }))
vi.mock("next/cache", () => ({ revalidatePath: m.revalidateMock }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

function formWith(endDate?: string) {
  const formData = new FormData()
  formData.set("customerId", "1")
  formData.set("date", "2024-01-01")
  if (endDate !== undefined) formData.set("endDate", endDate)
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 5, roles: [] })
  userSessionMock.mockResolvedValue({ user: { id: "5" } })
  woFindUniqueOrThrow.mockResolvedValue({
    id: 10,
    status: "draft",
    documentNo: "WO-10",
    endDate: new Date(Date.UTC(2024, 1, 10)), // 2024-02-10
  })
  woUpdateMany.mockResolvedValue({ count: 1 })
  woiDeleteMany.mockResolvedValue({ count: 0 })
  woiCreateMany.mockResolvedValue({ count: 0 })
  activityLogCreate.mockResolvedValue({ id: 99 })
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
})

describe("updateWorkOrder histori endDate (F-2026-10-21-035)", () => {
  it("endDate berubah -> 1 baris ActivityLog tambahan dengan oldValues/newValues", async () => {
    const result = await updateWorkOrder(10, formWith("2024-02-15"))

    expect(result.success).toBe(true)
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 5,
        action: "update",
        modelType: "WorkOrder",
        modelId: 10,
        description: "EndDate perintah kerja #10 berubah dari 2024-02-10 ke 2024-02-15",
        oldValues: { endDate: "2024-02-10" },
        newValues: { endDate: "2024-02-15" },
      },
    })
    // Log update generik existing tetap tertulis seperti semula.
    expect(logActivityMock).toHaveBeenCalledTimes(1)
    expect(logActivityMock).toHaveBeenCalledWith(
      "update",
      "WorkOrder",
      10,
      "Memperbarui perintah kerja #10",
    )
  })

  it("endDate sama -> 0 baris histori tambahan, log generik tetap jalan", async () => {
    const result = await updateWorkOrder(10, formWith("2024-02-10"))

    expect(result.success).toBe(true)
    expect(activityLogCreate).not.toHaveBeenCalled()
    expect(logActivityMock).toHaveBeenCalledTimes(1)
  })

  it("endDate diisi dari kosong -> tercatat (null -> tanggal)", async () => {
    woFindUniqueOrThrow.mockResolvedValue({
      id: 10,
      status: "draft",
      documentNo: "WO-10",
      endDate: null,
    })

    const result = await updateWorkOrder(10, formWith("2024-02-15"))

    expect(result.success).toBe(true)
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValues: { endDate: null },
        newValues: { endDate: "2024-02-15" },
      }),
    })
  })

  it("endDate dikosongkan -> tercatat (tanggal -> null)", async () => {
    const result = await updateWorkOrder(10, formWith(undefined))

    expect(result.success).toBe(true)
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValues: { endDate: "2024-02-10" },
        newValues: { endDate: null },
      }),
    })
  })

  it("gagal tulis histori tidak menggagalkan update", async () => {
    activityLogCreate.mockRejectedValue(new Error("db mati"))

    const result = await updateWorkOrder(10, formWith("2024-02-15"))

    expect(result.success).toBe(true)
    expect(logActivityMock).toHaveBeenCalledTimes(1)
  })

  it("status completed ditolak sebelum histori ditulis", async () => {
    woFindUniqueOrThrow.mockResolvedValue({
      id: 10,
      status: "completed",
      documentNo: "WO-10",
      endDate: new Date(Date.UTC(2024, 1, 10)),
    })

    const result = await updateWorkOrder(10, formWith("2024-02-15"))

    expect(result.success).toBe(false)
    expect(activityLogCreate).not.toHaveBeenCalled()
    expect(logActivityMock).not.toHaveBeenCalled()
  })
})
