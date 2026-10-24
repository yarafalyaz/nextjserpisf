import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader antrean F-2026-10-22-078-S: incoming = scope SUMBER,
 * outgoing = scope TUJUAN; kind none -> kosong (fail-closed);
 * sisa per baris dari transfer received saja (AC-MR-3/6).
 */
const mocks = vi.hoisted(() => ({
  prismaMock: {
    materialRequest: { findMany: vi.fn() },
    userWarehouse: { findMany: vi.fn() },
  },
  requirePermissionMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

import {
  getMaterialRequestByWorkOrder,
  getMaterialRequestQueue,
} from "../material-request-data"

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "mrq-0001",
    documentNo: "MRQ-0001",
    status: "terpenuhi_sebagian",
    requesterWarehouseId: 2,
    sourceWarehouseId: 1,
    workOrderId: null,
    neededBy: null,
    createdBy: 9,
    createdAt: new Date(2026, 9, 22),
    approvedBy: 7,
    approvedAt: new Date(2026, 9, 22),
    rejectionReason: null,
    requesterWarehouse: { name: "Cabang" },
    sourceWarehouse: { name: "Pusat" },
    workOrder: null,
    items: [
      {
        itemId: 1,
        qty: 10,
        notes: null,
        item: { name: "Oli", sku: "OLI-1", unitOfMeasure: "PCS" },
      },
    ],
    transfers: [
      { status: "draft", items: [{ itemId: 1, qty: 10, receivedQty: 0 }] },
      { status: "received", items: [{ itemId: 1, qty: 4, receivedQty: 4 }] },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.materialRequest.findMany.mockResolvedValue([row()])
  mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 1 }])
  mocks.requirePermissionMock.mockResolvedValue({ id: "7", roles: ["warehouse"] })
})

describe("getMaterialRequestQueue", () => {
  it("scope sumber saja: incoming terisi oleh sourceWarehouseId, outgoing kosong filter", async () => {
    const q = await getMaterialRequestQueue({ id: "7", roles: ["warehouse"] })
    expect(q.incoming).toHaveLength(1)
    const first = mocks.prismaMock.materialRequest.findMany.mock.calls[0][0]
    expect(first.where).toEqual({ sourceWarehouseId: { in: [1] } })
    const second = mocks.prismaMock.materialRequest.findMany.mock.calls[1][0]
    expect(second.where).toEqual({ requesterWarehouseId: { in: [1] } })
  })

  it("sisa dihitung dari received saja, draft tidak mengurangi (AC-MR-3)", async () => {
    const q = await getMaterialRequestQueue({ id: "7", roles: ["super_admin"] })
    const line = q.incoming[0].lines[0]
    expect(line).toMatchObject({ requestedQty: 10, receivedQty: 4, remainingQty: 6 })
    expect(q.incoming[0].statusLabel).toBe("Terpenuhi Sebagian")
    expect(q.incoming[0].transferCount).toBe(2)
    expect(q.incoming[0].receivedTransferCount).toBe(1)
  })

  it("tanpa penugasan gudang: fail-closed kosong, DB tidak ditanya (AC-MR-6)", async () => {
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([])
    const q = await getMaterialRequestQueue({ id: "7", roles: ["warehouse"] })
    expect(q).toEqual({ incoming: [], outgoing: [] })
    expect(mocks.prismaMock.materialRequest.findMany).not.toHaveBeenCalled()
  })
})

describe("getMaterialRequestByWorkOrder (M-2: gerbang izin + scope)", () => {
  it("menerapkan izin view + scope kedua gudang pada where", async () => {
    const rows = await getMaterialRequestByWorkOrder(42)
    expect(rows).toHaveLength(1)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("view_material_requests")
    const arg = mocks.prismaMock.materialRequest.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      workOrderId: 42,
      OR: [
        { requesterWarehouseId: { in: [1] } },
        { sourceWarehouseId: { in: [1] } },
      ],
    })
  })

  it("scope all: tanpa filter OR, izin tetap ditegakkan", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: "7", roles: ["super_admin"] })
    const rows = await getMaterialRequestByWorkOrder(42)
    expect(rows).toHaveLength(1)
    const arg = mocks.prismaMock.materialRequest.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ workOrderId: 42 })
    expect(mocks.prismaMock.userWarehouse.findMany).not.toHaveBeenCalled()
  })

  it("kind none: kosong fail-closed, query permintaan tidak jalan", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: "7", roles: ["warehouse"] })
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([])
    const rows = await getMaterialRequestByWorkOrder(42)
    expect(rows).toEqual([])
    expect(mocks.prismaMock.materialRequest.findMany).not.toHaveBeenCalled()
  })

  it("workOrderId tidak valid: kosong tanpa izin/DB", async () => {
    expect(await getMaterialRequestByWorkOrder(0)).toEqual([])
    expect(mocks.requirePermissionMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.materialRequest.findMany).not.toHaveBeenCalled()
  })
})
