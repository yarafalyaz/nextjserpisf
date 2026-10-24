import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-21-012 inti (BR-RES-11 + AC-RES-5/6): aksi batal WO
 * in_progress, lepas manual, reservasi ulang. Izin existing
 * complete_work_orders / edit_work_orders — TANPA izin baru.
 */

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const woFindUniqueOrThrowMock = vi.fn()
const woUpdateManyMock = vi.fn()
const woiFindFirstMock = vi.fn()
const miItemAggregateMock = vi.fn()
const srUpdateManyMock = vi.fn()
const srFindFirstMock = vi.fn()
const srCreateMock = vi.fn()
const scopeMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  const prisma = {
    workOrder: {
      findUniqueOrThrow: (...a: unknown[]) => woFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => woUpdateManyMock(...a),
    },
    workOrderItem: { findFirst: (...a: unknown[]) => woiFindFirstMock(...a) },
    materialIssueItem: { aggregate: (...a: unknown[]) => miItemAggregateMock(...a) },
    stockReservation: {
      updateMany: (...a: unknown[]) => srUpdateManyMock(...a),
      findFirst: (...a: unknown[]) => srFindFirstMock(...a),
      create: (...a: unknown[]) => srCreateMock(...a),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    $transaction: vi.fn((cb: unknown) =>
      typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
    ),
  }
  return { prisma }
})
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: (...a: unknown[]) => scopeMock(...a),
  assertWarehouseAccess: (scope: { kind: string; warehouseIds?: number[] }, warehouseId: number) => {
    if (scope.kind === "all") return
    if (!scope.warehouseIds?.includes(warehouseId)) throw new Error("Anda tidak memiliki akses ke gudang ini.")
  },
}))
vi.mock("@/lib/services/qc.service", () => ({
  assertWorkOrderQcCleared: vi.fn().mockResolvedValue(undefined),
  assertProductionOrderQcCleared: vi.fn().mockResolvedValue(undefined),
  assertWorkOrderVehicleIntakeRecorded: vi.fn().mockResolvedValue(undefined),
}))

import { cancelWorkOrder, releaseStockReservation, reserveStockForWorkOrder } from "../manufacturing.actions"

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 7 })
  woUpdateManyMock.mockResolvedValue({ count: 1 })
  srUpdateManyMock.mockResolvedValue({ count: 1 })
  scopeMock.mockResolvedValue({ kind: "all" })
})

describe("cancelWorkOrder (BR-RES-11)", () => {
  it("tanpa alasan → ditolak, status tak berubah", async () => {
    const res = await cancelWorkOrder(9, "   ")
    expect(res.success).toBe(false)
    expect(woUpdateManyMock).not.toHaveBeenCalled()
  })

  it("izin complete_work_orders; in_progress → cancelled + sisa aktif released satu tx", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "in_progress" })
    const res = await cancelWorkOrder(9, "pelanggan batal")
    expect(res.success).toBe(true)
    expect(requirePermissionMock).toHaveBeenCalledWith("complete_work_orders")
    expect(woUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, status: "in_progress" }, data: { status: "cancelled" } }),
    )
    expect(srUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, status: "active" },
        data: expect.objectContaining({ status: "released", releasedBy: 7 }),
      }),
    )
    expect(logActivityMock).toHaveBeenCalledWith("cancel", "WorkOrder", 9, expect.stringContaining("pelanggan batal"))
  })

  it("AC-RIL-2: cancel dengan alasan → releaseNotice verbatim + releaseReason persis memuat alasan", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "in_progress" })
    srUpdateManyMock.mockResolvedValue({ count: 2 })
    const res = await cancelWorkOrder(9, "pelanggan batal")
    expect(res.success).toBe(true)
    expect((res as { releaseNotice?: string | null }).releaseNotice).toBe(
      "Dibatalkan — 2 reservasi sisa dilepas karena pembatalan",
    )
    expect(srUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          releaseReason: "Perintah kerja dibatalkan: pelanggan batal",
        }),
      }),
    )
  })

  it("cancel tanpa sisa aktif → releaseNotice null (tanpa pemberitahuan rilis)", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "in_progress" })
    srUpdateManyMock.mockResolvedValue({ count: 0 })
    const res = await cancelWorkOrder(9, "pelanggan batal")
    expect(res.success).toBe(true)
    expect((res as { releaseNotice?: string | null }).releaseNotice).toBeNull()
  })

  it("WO bukan in_progress → ditolak", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "pending" })
    const res = await cancelWorkOrder(9, "alasan sah")
    expect(res.success).toBe(false)
    expect(srUpdateManyMock).not.toHaveBeenCalled()
  })
})

describe("releaseStockReservation (AC-RES-6)", () => {
  it("tanpa alasan → ditolak", async () => {
    const res = await releaseStockReservation(3, "")
    expect(res.success).toBe(false)
    expect(srUpdateManyMock).not.toHaveBeenCalled()
  })

  it("dengan alasan → released + jejak siapa/alasan", async () => {
    srUpdateManyMock.mockResolvedValue({ count: 1 })
    const res = await releaseStockReservation(3, "stok dipakai job darurat")
    expect(res.success).toBe(true)
    expect(requirePermissionMock).toHaveBeenCalledWith("complete_work_orders")
    expect(logActivityMock).toHaveBeenCalledWith(
      "release",
      "StockReservation",
      3,
      expect.stringContaining("stok dipakai job darurat"),
    )
  })

  it("reservasi sudah tidak aktif → gagal berisik", async () => {
    srUpdateManyMock.mockResolvedValue({ count: 0 })
    const res = await releaseStockReservation(3, "alasan sah")
    expect(res.success).toBe(false)
  })
})

describe("reserveStockForWorkOrder (AC-RES-5)", () => {
  it("pengguna tanpa akses gudang → ditolak server", async () => {
    scopeMock.mockResolvedValue({ kind: "assigned", warehouseIds: [1] })
    const res = await reserveStockForWorkOrder({ workOrderId: 9, workOrderItemId: 41, warehouseId: 5, qty: 1 })
    expect(res.success).toBe(false)
    expect(srCreateMock).not.toHaveBeenCalled()
  })

  it("baris aktif sama sudah ada → ditolak (idempoten per WO/item/gudang)", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "in_progress", startDate: new Date(), endDate: null })
    woiFindFirstMock.mockResolvedValue({ id: 41, itemId: 10, qty: 3, status: "in_progress" })
    srFindFirstMock.mockResolvedValue({ id: 88 })
    const res = await reserveStockForWorkOrder({ workOrderId: 9, workOrderItemId: 41, warehouseId: 5, qty: 1 })
    expect(res.success).toBe(false)
    expect(srCreateMock).not.toHaveBeenCalled()
  })

  it("reservasi ulang sesudah expired → baris active BARU lahir", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 9, status: "in_progress", startDate: new Date(), endDate: null })
    woiFindFirstMock.mockResolvedValue({ id: 41, itemId: 10, qty: 3, status: "in_progress" })
    srFindFirstMock.mockResolvedValue(null)
    miItemAggregateMock.mockResolvedValue({ _sum: { qty: 1 } })
    srCreateMock.mockResolvedValue({ id: 99, itemId: 10 })
    const res = await reserveStockForWorkOrder({ workOrderId: 9, workOrderItemId: 41, warehouseId: 5, qty: 2 })
    expect(res.success).toBe(true)
    expect(srCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workOrderId: 9, itemId: 10, warehouseId: 5, status: "active" }),
      }),
    )
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_work_orders")
  })
})
