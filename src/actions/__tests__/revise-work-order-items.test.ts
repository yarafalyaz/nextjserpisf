import { describe, it, expect, vi, beforeEach } from "vitest"
import { reviseWorkOrderItems } from "../inventory.actions"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()

const woFindUniqueOrThrow = vi.fn()
const woUpdateMany = vi.fn()
const woiFindMany = vi.fn()
const woiUpdateMany = vi.fn()
const woiCreateMany = vi.fn()
const miItemFindMany = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUniqueOrThrow: (...a: unknown[]) => woFindUniqueOrThrow(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

const tx = {
  workOrder: { updateMany: (...a: unknown[]) => woUpdateMany(...a) },
  workOrderItem: {
    findMany: (...a: unknown[]) => woiFindMany(...a),
    updateMany: (...a: unknown[]) => woiUpdateMany(...a),
    createMany: (...a: unknown[]) => woiCreateMany(...a),
  },
  materialIssueItem: { findMany: (...a: unknown[]) => miItemFindMany(...a) },
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 5, roles: [] })
  woFindUniqueOrThrow.mockResolvedValue({ id: 10, status: "in_progress" })
  woUpdateMany.mockResolvedValue({ count: 1 })
  woiFindMany.mockResolvedValue([{ id: 1, itemId: 100, status: "pending" }])
  woiUpdateMany.mockResolvedValue({ count: 1 })
  woiCreateMany.mockResolvedValue({ count: 1 })
  miItemFindMany.mockResolvedValue([])
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
})

describe("reviseWorkOrderItems (F-2026-10-20-06)", () => {
  it("menolak WO bukan in_progress", async () => {
    woFindUniqueOrThrow.mockResolvedValue({ id: 10, status: "completed" })
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/hanya bisa direvisi saat Perintah Kerja berjalan/)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("menolak revisi kosong", async () => {
    const res = await reviseWorkOrderItems({ workOrderId: 10 })
    expect(res.success).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("menolak item yang sudah ter-issue lewat MI completed", async () => {
    miItemFindMany.mockResolvedValue([{ itemId: 100 }])
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah dikeluarkan lewat Pengeluaran Material/)
    expect(woiUpdateMany).not.toHaveBeenCalled()
  })

  it("menolak item milik WO lain / tidak ditemukan", async () => {
    woiFindMany.mockResolvedValue([])
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [99] })
    expect(res.success).toBe(false)
    expect(woiUpdateMany).not.toHaveBeenCalled()
  })

  it("menolak item yang sudah replaced", async () => {
    woiFindMany.mockResolvedValue([{ id: 1, itemId: 100, status: "replaced" }])
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })
    expect(res.success).toBe(false)
    expect(woiUpdateMany).not.toHaveBeenCalled()
  })

  it("sukses: tandai replaced + tambah item baru pending dalam satu transaksi", async () => {
    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      replacedItemIds: [1],
      newItems: [{ itemId: 200, qty: 2, cost: 5000, description: "winch baru" }],
    })
    expect(res.success).toBe(true)
    expect(woiUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, workOrderId: 10 },
      data: { status: "replaced" },
    })
    expect(woiCreateMany).toHaveBeenCalledWith({
      data: [
        {
          workOrderId: 10,
          itemId: 200,
          qty: 2,
          cost: 5000,
          description: "winch baru",
          status: "pending",
        },
      ],
    })
  })

  it("menolak input tidak valid (qty <= 0)", async () => {
    const res = await reviseWorkOrderItems({
      workOrderId: 10,
      newItems: [{ itemId: 200, qty: 0 }],
    })
    expect(res.success).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
