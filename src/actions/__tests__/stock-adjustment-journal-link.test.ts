import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `StockAdjustment.journalId` ada di skema tetapi tak pernah diisi: hook stok
 * memposting jurnalnya (referenceType/referenceId = StockAdjustment) tanpa
 * mengembalikan id jurnal, dan aksi hanya menulis status. Akibatnya dokumen
 * penyesuaian tak bisa menautkan jurnalnya (arah balik hanya lewat kolom
 * `reference*` jurnal).
 *
 * Dua arah yang dijaga:
 *  - jurnal ada → `journalId` tersimpan.
 *  - jurnal tidak ada (nilai net 0 / akun belum dipetakan) → kolomnya TIDAK
 *    ditulis null, supaya tautan lama tidak terhapus.
 */

const mocks = vi.hoisted(() => {
  const prismaMock: Record<string, unknown> = {
    stockAdjustment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, status: "draft", warehouseId: 1, items: [] }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    journal: { findFirst: vi.fn().mockResolvedValue(null) },
  }
  prismaMock.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function" ? (ops as (tx: unknown) => unknown)(prismaMock) : Promise.all(ops as unknown[]),
  )
  return {
    prismaMock: prismaMock as any,
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    stockAdjustmentHookMock: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, TxClient: class {} }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("SM-0001"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: (...a: unknown[]) => mocks.stockAdjustmentHookMock(...a),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn(),
  onTransferReceived: vi.fn(),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({ onMaterialIssueCompleted: vi.fn() }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: vi.fn().mockResolvedValue({ kind: "all" }),
  assertWarehouseAccess: vi.fn(),
  assertWarehouseAccessMulti: vi.fn(),
}))

import { processStockAdjustment } from "../inventory.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    status: "draft",
    warehouseId: 1,
    items: [],
  })
  mocks.prismaMock.stockAdjustment.updateMany.mockResolvedValue({ count: 1 })
})

describe("processStockAdjustment — tautan jurnal", () => {
  it("menyimpan journalId jurnal penyesuaian yang baru dibuat", async () => {
    mocks.prismaMock.journal.findFirst.mockResolvedValue({ id: 55 })

    const res = await processStockAdjustment(1)

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.journal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ referenceType: "StockAdjustment", referenceId: 1 }),
      }),
    )
    expect(mocks.prismaMock.stockAdjustment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "processed", journalId: 55 } }),
    )
  })

  it("tidak menulis null saat penyesuaian tidak menghasilkan jurnal", async () => {
    mocks.prismaMock.journal.findFirst.mockResolvedValue(null)

    const res = await processStockAdjustment(1)

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.stockAdjustment.update.mock.calls[0][0].data
    expect(data.status).toBe("processed")
    expect("journalId" in data).toBe(false)
  })
})
