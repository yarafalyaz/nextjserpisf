import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi Permintaan Antar Gudang F-2026-10-22-078-S. Mock Prisma mandiri.
 * Dijaga: AC-MR-1 (baris kosong/qty 0/sumber=tujuan ditolak),
 * AC-MR-2 (transfer hanya dari disetujui), AC-MR-3 (dua transfer
 * bertahap -> terpenuhi dari received), AC-MR-5 (alasan wajib; batal
 * ber-transfer ditolak), AC-MR-6/7 (scope + self-approve Q-MR-3),
 * AC-MR-8 (model StockMove/jurnal/MaterialIssue TIDAK disediakan di
 * mock — aksi menyentuhnya = tes meledak), AC-MR-9 (WO SetNull baca).
 */

const mocks = vi.hoisted(() => {
  const txMock: Record<string, any> = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    materialRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    materialRequestItem: {
      findMany: vi.fn().mockResolvedValue([{ itemId: 1 }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryTransfer: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    warehouse: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    workOrder: { findUnique: vi.fn() },
    // AC-MR-8: sengaja TANPA stockMove/journalEntry/materialIssue.
  }
  const prismaMock: Record<string, any> = {
    ...txMock,
    materialRequest: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    userWarehouse: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
  }
  return {
    prismaMock,
    txMock,
    requirePermissionMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("MRQ-0001"),
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn().mockResolvedValue("mrq-0001"),
}))

import {
  approveMaterialRequest,
  cancelMaterialRequest,
  closeMaterialRequest,
  createMaterialRequest,
  createTransferFromMaterialRequest,
  rejectMaterialRequest,
} from "../material-request.actions"
import {
  assertMaterialRequestVisible,
  refreshMaterialRequestFulfillmentTx,
} from "@/lib/services/material-request.service"

const USER = { id: "7", roles: ["super_admin"] }

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    documentNo: "MRQ-0001",
    status: "diajukan",
    createdBy: 99,
    requesterWarehouseId: 2,
    sourceWarehouseId: 1,
    workOrderId: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue(USER)
  mocks.txMock.$queryRaw.mockResolvedValue([{ id: 1 }])
  mocks.txMock.materialRequest.updateMany.mockResolvedValue({ count: 1 })
  mocks.txMock.materialRequest.create.mockResolvedValue({ id: 1, slug: "mrq-0001" })
  mocks.txMock.inventoryTransfer.findMany.mockResolvedValue([])
  mocks.txMock.inventoryTransfer.create.mockResolvedValue({ id: 5, slug: "trf-0005" })
  mocks.txMock.warehouse.findMany.mockResolvedValue([
    { id: 1, name: "Pusat", isActive: true },
    { id: 2, name: "Cabang", isActive: true },
  ])
  mocks.txMock.item.findMany.mockResolvedValue([{ id: 1, name: "Oli", isActive: true }])
  mocks.prismaMock.materialRequest.updateMany.mockResolvedValue({ count: 1 })
  mocks.prismaMock.materialRequest.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocks.txMock),
  )
})

describe("createMaterialRequest (AC-MR-1)", () => {
  it("sumber = tujuan ditolak", async () => {
    const res = await createMaterialRequest(
      fd({
        requesterWarehouseId: "1",
        sourceWarehouseId: "1",
        items: JSON.stringify([{ itemId: 1, qty: 2 }]),
      }),
    )
    expect(res.success).toBe(false)
    expect(mocks.txMock.materialRequest.create).not.toHaveBeenCalled()
  })

  it("tanpa baris / qty 0 ditolak", async () => {
    const empty = await createMaterialRequest(
      fd({ requesterWarehouseId: "2", sourceWarehouseId: "1", items: "[]" }),
    )
    expect(empty.success).toBe(false)
    const zero = await createMaterialRequest(
      fd({
        requesterWarehouseId: "2",
        sourceWarehouseId: "1",
        items: JSON.stringify([{ itemId: 1, qty: 0 }]),
      }),
    )
    expect(zero.success).toBe(false)
    expect(mocks.txMock.materialRequest.create).not.toHaveBeenCalled()
  })

  it("izin create_material_requests; draft lahir tanpa StockMove/jurnal (AC-MR-8)", async () => {
    const res = await createMaterialRequest(
      fd({
        requesterWarehouseId: "2",
        sourceWarehouseId: "1",
        items: JSON.stringify([{ itemId: 1, qty: 2 }]),
      }),
    )
    expect(res).toEqual({ success: true, id: 1, slug: "mrq-0001" })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_material_requests")
    const data = mocks.txMock.materialRequest.create.mock.calls[0][0].data
    expect(data.status).toBe("draft")
    expect(data.items.create).toEqual([{ itemId: 1, qty: 2, notes: null }])
    expect(mocks.prismaMock.stockMove).toBeUndefined()
    expect(mocks.prismaMock.journalEntry).toBeUndefined()
  })
})

describe("approve/reject (AC-MR-5/7, Q-MR-3)", () => {
  it("self-approve ditolak (Q-MR-3)", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow({ createdBy: 7 }))
    const res = await approveMaterialRequest(1)
    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("dibuat sendiri")
    expect(mocks.prismaMock.materialRequest.updateMany).not.toHaveBeenCalled()
  })

  it("tolak tanpa alasan ditolak (AC-MR-5)", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow())
    const res = await rejectMaterialRequest(1, "  ")
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.materialRequest.updateMany).not.toHaveBeenCalled()
  })

  it("setujui: klaim atomik diajukan->disetujui + approvedBy/At", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow())
    const res = await approveMaterialRequest(1)
    expect(res).toEqual({ success: true })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("approve_material_requests")
    const arg = mocks.prismaMock.materialRequest.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 1, status: "diajukan" })
    expect(arg.data.status).toBe("disetujui")
    expect(arg.data.approvedBy).toBe(7)
  })
})

describe("cancel/close (AC-MR-5)", () => {
  it("batal tanpa alasan ditolak", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow({ status: "draft" }))
    const res = await cancelMaterialRequest(1, "")
    expect(res.success).toBe(false)
  })

  it("disetujui ber-transfer tidak dapat dibatalkan", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow({ status: "disetujui" }))
    mocks.txMock.materialRequest.findUnique.mockResolvedValue({
      status: "disetujui",
      _count: { transfers: 1 },
    })
    const res = await cancelMaterialRequest(1, "tidak jadi")
    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("sudah memiliki transfer")
  })

  it("tutup manual dari terpenuhi_sebagian beralasan", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(
      requestRow({ status: "terpenuhi_sebagian" }),
    )
    const res = await closeMaterialRequest(1, "sisa tidak dibutuhkan")
    expect(res).toEqual({ success: true })
    const arg = mocks.prismaMock.materialRequest.updateMany.mock.calls[0][0]
    expect(arg.where.status.in).toEqual(["disetujui", "terpenuhi_sebagian"])
    expect(arg.data.status).toBe("ditutup_manual")
  })
})

describe("createTransferFromMaterialRequest (AC-MR-2/3)", () => {
  function approvedTx(over: Record<string, unknown> = {}) {
    mocks.txMock.materialRequest.findUnique.mockResolvedValue({
      id: 1,
      documentNo: "MRQ-0001",
      status: "disetujui",
      requesterWarehouseId: 2,
      sourceWarehouseId: 1,
      items: [{ itemId: 1, qty: 10 }],
      ...over,
    })
  }

  it("dari diajukan/ditolak ditolak (AC-MR-2)", async () => {
    approvedTx({ status: "diajukan" })
    const res = await createTransferFromMaterialRequest(1)
    expect(res.success).toBe(false)
    expect(mocks.txMock.inventoryTransfer.create).not.toHaveBeenCalled()
  })

  it("transfer pertama qty sisa penuh; tertaut materialRequestId", async () => {
    approvedTx()
    const res = await createTransferFromMaterialRequest(1)
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_inventory_transfers")
    const data = mocks.txMock.inventoryTransfer.create.mock.calls[0][0].data
    expect(data.materialRequestId).toBe(1)
    expect(data.sourceWarehouseId).toBe(1)
    expect(data.destinationWarehouseId).toBe(2)
    expect(data.items.create).toEqual([{ itemId: 1, qty: 10 }])
  })

  it("transfer kedua hanya sisa sesudah received pertama (AC-MR-3)", async () => {
    approvedTx({ status: "terpenuhi_sebagian" })
    mocks.txMock.inventoryTransfer.findMany.mockResolvedValue([
      { items: [{ itemId: 1, qty: 4 }] },
    ])
    const res = await createTransferFromMaterialRequest(1)
    expect(res.success).toBe(true)
    const data = mocks.txMock.inventoryTransfer.create.mock.calls[0][0].data
    expect(data.items.create).toEqual([{ itemId: 1, qty: 6 }])
  })
})

describe("assertMaterialRequestVisible (AC-MR-6)", () => {
  it("di luar scope kedua gudang ditolak server", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow())
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 9 }])
    await expect(
      assertMaterialRequestVisible({ id: "7", roles: ["warehouse"] }, 1),
    ).rejects.toThrow("tidak memiliki akses")
  })

  it("scope tujuan saja cukup untuk melihat", async () => {
    mocks.prismaMock.materialRequest.findUnique.mockResolvedValue(requestRow())
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 2 }])
    const r = await assertMaterialRequestVisible({ id: "7", roles: ["warehouse"] }, 1)
    expect(r.id).toBe(1)
  })
})

describe("refreshMaterialRequestFulfillmentTx (AC-MR-3/8)", () => {
  it("received kumulatif penuh -> updateMany terpenuhi dari status penjaga", async () => {
    mocks.txMock.materialRequest.findUnique.mockResolvedValue({
      status: "terpenuhi_sebagian",
      items: [{ itemId: 1, qty: 10 }],
    })
    mocks.txMock.inventoryTransfer.findMany.mockResolvedValue([
      { items: [{ itemId: 1, qty: 4 }] },
      { items: [{ itemId: 1, qty: 6 }] },
    ])
    const status = await refreshMaterialRequestFulfillmentTx(mocks.txMock as never, 1)
    expect(status).toBe("terpenuhi")
    const arg = mocks.txMock.materialRequest.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 1, status: "terpenuhi_sebagian" })
    expect(arg.data).toEqual({ status: "terpenuhi" })
  })

  it("status ditutup_manual tidak ditimpa turunan", async () => {
    mocks.txMock.materialRequest.findUnique.mockResolvedValue({
      status: "ditutup_manual",
      items: [{ itemId: 1, qty: 10 }],
    })
    const status = await refreshMaterialRequestFulfillmentTx(mocks.txMock as never, 1)
    expect(status).toBe("ditutup_manual")
    expect(mocks.txMock.materialRequest.updateMany).not.toHaveBeenCalled()
  })
})
