import { describe, it, expect, vi, beforeEach } from "vitest"
import { reviseWorkOrderItems } from "../inventory.actions"

const m = await vi.hoisted(async () => (await import("./work-order-test-utils")).createWorkOrderMocks())
const { requirePermissionMock, woFindUniqueOrThrow, transactionMock } = m

const woUpdateMany = vi.fn()
const woiFindMany = vi.fn()
const woiUpdateMany = vi.fn()
const woiCreateMany = vi.fn()
const miItemFindMany = vi.fn()

vi.mock("@/lib/auth/permissions", () => m.mockAuth())
vi.mock("@/lib/db/prisma", () => m.mockPrisma())
vi.mock("@/lib/services/activity-log.service", () => m.mockActivity())
vi.mock("next/cache", () => m.mockCache())
vi.mock("@/lib/services/period-lock.service", () => m.mockPeriod())

const tx = {
  workOrder: { updateMany: (...a: unknown[]) => woUpdateMany(...a) },
  workOrderItem: {
    findMany: (...a: unknown[]) => woiFindMany(...a),
    updateMany: (...a: unknown[]) => woiUpdateMany(...a),
    createMany: (...a: unknown[]) => woiCreateMany(...a),
  },
  materialIssueItem: { findMany: (...a: unknown[]) => miItemFindMany(...a) },
  stockReservation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

  it("F-39(a): baris saudara item sama belum ter-issue TIDAK terblokir (guard per baris WO)", async () => {
    // Dua baris WO memakai itemId 100; hanya baris 2 yang ter-issue.
    const allLines = [
      { id: 1, itemId: 100, status: "pending" },
      { id: 2, itemId: 100, status: "pending" },
    ]
    woiFindMany.mockImplementation(async (args: any) => {
      const ids: number[] = args?.where?.id?.in ?? []
      return allLines.filter((l) => ids.includes(l.id))
    })
    // Tiru semantik DB: filter OR guard baru atas baris issue completed.
    const issuedRows = [{ itemId: 100, workOrderItemId: 2 }]
    miItemFindMany.mockImplementation(async (args: any) => {
      const ors = args?.where?.OR ?? []
      return issuedRows.filter((r) =>
        ors.some((o: any) =>
          o.workOrderItemId?.in
            ? o.workOrderItemId.in.includes(r.workOrderItemId)
            : r.workOrderItemId == null && o.itemId?.in?.includes(r.itemId),
        ),
      )
    })
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })
    expect(res.success).toBe(true)
    const res2 = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [2] })
    expect(res2.success).toBe(false)
    expect(res2.error).toMatch(/sudah dikeluarkan lewat Pengeluaran Material/)
  })

  it("F-39(a): baris issue legacy tanpa workOrderItemId tetap memblokir lewat itemId", async () => {
    const issuedRows = [{ itemId: 100, workOrderItemId: null }]
    miItemFindMany.mockImplementation(async (args: any) => {
      const ors = args?.where?.OR ?? []
      return issuedRows.filter((r) =>
        ors.some((o: any) =>
          o.workOrderItemId?.in
            ? o.workOrderItemId.in.includes(r.workOrderItemId as never)
            : r.workOrderItemId == null && o.itemId?.in?.includes(r.itemId),
        ),
      )
    })
    const res = await reviseWorkOrderItems({ workOrderId: 10, replacedItemIds: [1] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah dikeluarkan lewat Pengeluaran Material/)
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
