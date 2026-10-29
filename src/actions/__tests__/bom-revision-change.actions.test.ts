import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi ganti revisi BOM order berjalan (F-2026-10-22-068-S). Mock Prisma
 * mandiri. Yang dijaga:
 * - izin kelola WO edit_work_orders (Q-BOM68-1 putusan BOT 1);
 * - belum ter-issue: pin diganti langsung di transaksi sama, status
 *   diterapkan_langsung (BR-BOM68-02);
 * - sudah ter-issue: status menunggu, pin TIDAK berubah (BR-BOM68-01);
 * - setujui oleh pengaju sendiri ditolak SoD + transaksi rollback —
 *   diuji lewat pin tidak berubah & status tetap menunggu
 *   (BR-BOM68-05); setujui oleh orang lain: klaim + pin diganti di
 *   transaksi yang sama (BR-BOM68-06);
 * - tolak tanpa alasan ditolak; target non-released / produk beda /
 *   pengajuan menunggu kedua ditolak;
 * - TIDAK ADA model StockMove/MaterialIssue(buat)/ProductionCost/
 *   journalEntry/stockReservation di mock tx: aksi menyentuhnya =
 *   tes meledak (BR-BOM68-09/10).
 */

const mocks = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 9 }]),
    workOrder: { findFirst: vi.fn(), update: vi.fn() },
    productionOrder: { findFirst: vi.fn(), update: vi.fn() },
    bomRevision: { findFirst: vi.fn() },
    bomRevisionChangeRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    materialIssueItem: { count: vi.fn() },
    productionOrderMaterial: { count: vi.fn() },
    // Sengaja TANPA stockMove / materialIssue.create / productionCost /
    // journalEntry / stockReservation: aksi menulis efek stok/biaya/jurnal
    // dari ganti revisi = tes meledak.
  }
  const prismaMock = {
    ...txMock,
    bomRevisionChangeRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
  }
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: "7" })
  const requireAuthMock = vi.fn().mockResolvedValue({ id: "7" })
  return { prismaMock, txMock, requirePermissionMock, requireAuthMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
  requireAuth: mocks.requireAuthMock,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import {
  requestBomRevisionChange,
  decideBomRevisionChange,
} from "../bom-revision-change.actions"

function woDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    documentNo: "WO-0009",
    status: "in_progress",
    bomRevisionId: 100,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: "7" })
  mocks.requireAuthMock.mockResolvedValue({ id: "7" })
  mocks.txMock.$queryRaw.mockResolvedValue([{ id: 9 }])
  mocks.txMock.workOrder.findFirst.mockResolvedValue(woDoc())
  mocks.txMock.workOrder.update.mockResolvedValue({ id: 9 })
  mocks.txMock.bomRevision.findFirst
    .mockResolvedValueOnce({ id: 100, productId: 5, revisionNo: 1 })
    .mockResolvedValueOnce({ id: 101, productId: 5, revisionNo: 2, status: "released" })
  mocks.txMock.bomRevisionChangeRequest.findFirst.mockResolvedValue(null)
  mocks.txMock.bomRevisionChangeRequest.create.mockResolvedValue({ id: 55 })
  mocks.txMock.bomRevisionChangeRequest.updateMany.mockResolvedValue({ count: 1 })
  mocks.txMock.bomRevisionChangeRequest.findUnique.mockResolvedValue({
    id: 55,
    workOrderId: 9,
    productionOrderId: null,
    fromRevisionId: 100,
    toRevisionId: 101,
    requestedBy: 8,
    reason: "Spec berubah",
  })
  mocks.txMock.materialIssueItem.count.mockResolvedValue(0)
  mocks.prismaMock.bomRevisionChangeRequest.findFirst.mockResolvedValue({
    workOrderId: 9,
    productionOrderId: null,
  })
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocks.txMock),
  )
})

describe("requestBomRevisionChange", () => {
  it("belum ter-issue: diterapkan langsung, pin diganti di transaksi sama", async () => {
    const res = await requestBomRevisionChange({
      workOrderId: 9,
      toRevisionId: 101,
      reason: "Revisi engineering",
    })
    expect(res).toEqual({ success: true, id: 55, status: "diterapkan_langsung" })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_work_orders")
    const createData = mocks.txMock.bomRevisionChangeRequest.create.mock.calls[0][0].data
    expect(createData.status).toBe("diterapkan_langsung")
    expect(createData.fromRevisionId).toBe(100)
    expect(mocks.txMock.workOrder.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { bomRevisionId: 101 },
    })
  })

  it("sudah ter-issue: status menunggu, pin TIDAK berubah", async () => {
    mocks.txMock.materialIssueItem.count.mockResolvedValue(2)
    const res = await requestBomRevisionChange({
      workOrderId: 9,
      toRevisionId: 101,
      reason: "Revisi engineering",
    })
    expect(res).toEqual({ success: true, id: 55, status: "menunggu" })
    expect(mocks.txMock.workOrder.update).not.toHaveBeenCalled()
  })

  it("target belum released ditolak; alasan kosong ditolak", async () => {
    mocks.txMock.bomRevision.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 100, productId: 5, revisionNo: 1 })
      .mockResolvedValueOnce({ id: 101, productId: 5, revisionNo: 2, status: "draft" })
    const res = await requestBomRevisionChange({
      workOrderId: 9,
      toRevisionId: 101,
      reason: "Coba",
    })
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("belum dirilis")
    const res2 = await requestBomRevisionChange({
      workOrderId: 9,
      toRevisionId: 101,
      reason: "  ",
    })
    expect(res2.success).toBe(false)
    expect((res2 as { error?: string }).error).toContain("wajib diisi")
  })

  it("pengajuan menunggu kedua ditolak", async () => {
    mocks.txMock.bomRevisionChangeRequest.findFirst.mockResolvedValue({ id: 77 })
    const res = await requestBomRevisionChange({
      workOrderId: 9,
      toRevisionId: 101,
      reason: "Kedua",
    })
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("menunggu keputusan")
    expect(mocks.txMock.bomRevisionChangeRequest.create).not.toHaveBeenCalled()
  })
})

describe("decideBomRevisionChange", () => {
  it("setujui orang lain: klaim menunggu -> pin diganti transaksi sama", async () => {
    const res = await decideBomRevisionChange({ changeRequestId: 55, decision: "setujui" })
    expect(res).toEqual({ success: true, id: 55, status: "disetujui" })
    const claim = mocks.txMock.bomRevisionChangeRequest.updateMany.mock.calls[0][0]
    expect(claim.where).toEqual({ id: 55, status: "menunggu" })
    expect(claim.data.decidedBy).toBe(7)
    expect(mocks.txMock.workOrder.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { bomRevisionId: 101 },
    })
  })

  it("SoD: pengaju sendiri menyetujui ditolak, pin tidak berubah", async () => {
    mocks.txMock.bomRevisionChangeRequest.findUnique.mockResolvedValue({
      id: 55,
      workOrderId: 9,
      productionOrderId: null,
      fromRevisionId: 100,
      toRevisionId: 101,
      requestedBy: 7,
      reason: "Spec berubah",
    })
    const res = await decideBomRevisionChange({ changeRequestId: 55, decision: "setujui" })
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("pemisahan tugas")
    expect(mocks.txMock.workOrder.update).not.toHaveBeenCalled()
  })

  it("tolak tanpa alasan ditolak sebelum tulis", async () => {
    const res = await decideBomRevisionChange({ changeRequestId: 55, decision: "tolak" })
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("wajib mengisi alasan")
    expect(mocks.txMock.bomRevisionChangeRequest.updateMany).not.toHaveBeenCalled()
  })

  it("pin sudah berubah sejak ajuan: persetujuan ditolak berisik", async () => {
    mocks.txMock.workOrder.findFirst.mockResolvedValue(woDoc({ bomRevisionId: 999 }))
    const res = await decideBomRevisionChange({ changeRequestId: 55, decision: "setujui" })
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("sudah berubah sejak pengajuan")
    expect(mocks.txMock.workOrder.update).not.toHaveBeenCalled()
  })
})
