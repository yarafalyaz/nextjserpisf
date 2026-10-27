import { beforeEach, describe, expect, it, vi } from "vitest"

// INV-BR-010 (P0 TEST-STRATEGY skenario 6-7): koreksi stok posted HANYA lewat
// jalur terdokumentasi — processStockAdjustment (draft + assertApproved sebelum
// efek stok/jurnal, klaim atomik draft->processing, rollback klaim bila tx
// gagal), processPurchaseReturn (izin approve_* + status draft, hook stok +
// jurnal GL dalam SATU tx), completeSalesReturn (izin approve_* + SoD +
// status draft, hook stok + jurnal GL dalam SATU tx). Hook langsung atas
// dokumen non-draft/non-prosesable = no-op total tanpa StockMove/jurnal/
// perubahan qtyOnHand. Falsifikasi: hapus gate status di hook/action mana pun
// -> test jalur itu MERAH (moveCreate/journal/update terpanggil).

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  onStockAdjustment: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("SM-1"),
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
  createInLayer: mocks.createInLayer,
}))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onStockAdjustment: mocks.onStockAdjustment },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
  TxClient: class {},
}))

import { onPurchaseReturnProcessed } from "@/lib/hooks/purchase-return.hook"
import { onSalesReturnCompleted } from "@/lib/hooks/sales-return.hook"
import { onStockAdjustmentProcessed } from "@/lib/hooks/stock-adjustment.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 200, shortfall: 0, consumedSerials: [], consumedBatches: [] })
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.toBaseFactor.mockResolvedValue(1)
  mocks.onStockAdjustment.mockResolvedValue(undefined)
})

describe("INV-BR-010: dokumen non-draft ditolak hook stok (nol efek)", () => {
  it("stock adjustment cancelled -> no-op total (skenario 6)", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      adjUpdate: vi.fn().mockResolvedValue({}),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: spies.executeRaw,
      stockAdjustment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 50, documentNo: "ADJ-001", warehouseId: 1, status: "cancelled",
          date: new Date("2026-10-01"),
          items: [{ id: 1, itemId: 7, systemQty: 0, actualQty: 2, difference: 2, unitCost: 100 }],
        }),
        update: spies.adjUpdate,
      },
      stockAdjustmentItem: { update: vi.fn().mockResolvedValue({}) },
      // belum ada movement: lolos guard idempotensi, wajib berhenti di gate status
      stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: spies.moveCreate },
      item: { findMany: vi.fn().mockResolvedValue([]) },
      itemSerial: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      inventoryLayer: { groupBy: vi.fn().mockResolvedValue([]) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(mocks.onStockAdjustment).not.toHaveBeenCalled()
    expect(spies.adjUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })

  it("stock adjustment approved: diproses -> StockMove posted + jurnal + status processed (skenario 7)", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      adjUpdate: vi.fn().mockResolvedValue({}),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: spies.executeRaw,
      stockAdjustment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 50, documentNo: "ADJ-001", warehouseId: 1, status: "approved",
          date: new Date("2026-10-01"),
          items: [{ id: 1, itemId: 7, systemQty: 0, actualQty: 2, difference: 2, unitCost: 100, serialNumbers: null, batchNumbers: null }],
        }),
        update: spies.adjUpdate,
      },
      stockAdjustmentItem: { update: vi.fn().mockResolvedValue({}) },
      stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: spies.moveCreate },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 7, trackSerial: false, trackBatch: false }]) },
      itemSerial: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      inventoryLayer: { groupBy: vi.fn().mockResolvedValue([{ itemId: 7, _sum: { remaining: 0 } }]) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "posted", referenceType: "StockAdjustment", referenceId: 50, impact: "IN" }),
    }))
    expect(mocks.onStockAdjustment).toHaveBeenCalledTimes(1)
    expect(spies.adjUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "processed" }),
    }))
  })

  it("purchase return returned -> no-op total walau belum ada movement", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
      returnUpdate: vi.fn().mockResolvedValue({}),
    }
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      purchaseReturn: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7, documentNo: "PR-7", purchaseOrderId: 4, date: new Date("2026-10-01"),
          status: "returned",
          items: [{ id: 42, itemId: 3, qty: 2, cost: 120, price: null }],
          purchaseOrder: { id: 4 },
        }),
        update: spies.returnUpdate,
      },
      purchaseReturnItem: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      vendorBill: { findFirst: vi.fn().mockResolvedValue(null) },
      stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: spies.moveCreate },
      goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 6 }]) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onPurchaseReturnProcessed(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.returnUpdate).not.toHaveBeenCalled()
  })

  it("sales return cancelled -> no-op total walau belum ada movement", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
      returnUpdate: vi.fn().mockResolvedValue({}),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: spies.executeRaw,
      salesReturn: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7, salesInvoiceId: null, date: new Date("2026-10-01"), status: "cancelled",
          items: [{ itemId: 3, qty: 2, cost: 120 }],
        }),
        update: spies.returnUpdate,
      },
      stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: spies.moveCreate },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 5, trackSerial: false, trackBatch: false }]) },
      itemSerial: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      salesInvoiceItem: { findMany: vi.fn().mockResolvedValue([]) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.returnUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })
})
