import { beforeEach, describe, expect, it, vi } from "vitest"

// INV-BR-012: posting ulang dokumen yang sama TIDAK boleh membuat StockMove
// kedua. Enam hook posting stok sudah punya guard `existingMoves -> return`
// di dalam transaksi pemanggil (dengan kunci baris dokumen FOR UPDATE di
// sebagian besar jalur), tapi cakupan regresinya tersebar: goods-receipt,
// transfer, dan faktur penjualan sudah teruji; material-issue,
// purchase-return, sales-return, dan stock-adjustment belum. Berkas ini
// mengunci perilaku no-op untuk empat jalur itu dengan pola mock yang sama
// seperti berkas uji hook tetangganya. Falsifikasi: menghapus guard
// `if (existingMoves) return` pada hook mana pun membuat test jalur itu
// MERAH (moveCreate terpanggil).

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  onMaterialIssue: vi.fn(),
  onStockAdjustment: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
  createInLayer: mocks.createInLayer,
}))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: {
    onMaterialIssue: mocks.onMaterialIssue,
    onStockAdjustment: mocks.onStockAdjustment,
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
  TxClient: class {},
}))

import { onMaterialIssueCompleted } from "@/lib/hooks/material-issue.hook"
import { onPurchaseReturnProcessed } from "@/lib/hooks/purchase-return.hook"
import { onSalesReturnCompleted } from "@/lib/hooks/sales-return.hook"
import { onStockAdjustmentProcessed } from "@/lib/hooks/stock-adjustment.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumber.mockResolvedValue("SM-1")
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 200, shortfall: 0, consumedSerials: [], consumedBatches: [] })
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.toBaseFactor.mockResolvedValue(1)
})

describe("INV-BR-012: posting ulang tidak membuat StockMove kedua", () => {
  it("material issue: movement sudah ada -> no-op total", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 99 }),
      issueUpdate: vi.fn().mockResolvedValue({}),
      issueItemUpdate: vi.fn().mockResolvedValue({}),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: spies.executeRaw,
      materialIssue: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7,
          documentNo: "MI-001",
          date: new Date("2026-10-01"),
          status: "draft",
          warehouseId: 5,
          costCenterId: null,
          workOrderId: null,
          items: [{ id: 55, itemId: 3, qty: 2, cost: 100 }],
        }),
        update: spies.issueUpdate,
      },
      materialIssueItem: { update: spies.issueItemUpdate },
      stockMove: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: spies.moveCreate },
      workOrderItem: { findMany: vi.fn().mockResolvedValue([]) },
      item: { update: vi.fn().mockResolvedValue({}) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onMaterialIssueCompleted(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.issueUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })

  it("purchase return: movement sudah ada -> no-op total", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
      returnUpdate: vi.fn().mockResolvedValue({}),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $executeRaw: spies.executeRaw,
      $queryRaw: vi.fn().mockResolvedValue([]),
      purchaseReturn: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7,
          documentNo: "PR-7",
          purchaseOrderId: 4,
          date: new Date("2026-10-01"),
          status: "processing",
          items: [{ id: 42, itemId: 3, qty: 2, cost: 120 }],
          purchaseOrder: { id: 4 },
        }),
        update: spies.returnUpdate,
      },
      purchaseReturnItem: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      vendorBill: { findFirst: vi.fn().mockResolvedValue(null) },
      taxInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
      stockMove: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: spies.moveCreate },
      goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 6 }]) },
      systemSetting: { findFirst: vi.fn().mockResolvedValue({ periodLockDate: null }) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onPurchaseReturnProcessed(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.returnUpdate).not.toHaveBeenCalled()
  })

  it("sales return: movement sudah ada -> no-op total", async () => {
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
          id: 7,
          salesInvoiceId: null,
          date: new Date("2026-10-01"),
          status: "draft",
          items: [{ itemId: 3, qty: 2, cost: 120 }],
        }),
        update: spies.returnUpdate,
      },
      stockMove: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: spies.moveCreate },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 5, isScrapSaleItem: false }]) },
      itemSerial: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      salesInvoiceItem: { findMany: vi.fn().mockResolvedValue([]) },
      systemSetting: { findFirst: vi.fn().mockResolvedValue({ periodLockDate: null }) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.returnUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })

  it("stock adjustment: movement sudah ada -> no-op total", async () => {
    const spies = {
      moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      adjUpdate: vi.fn().mockResolvedValue({ id: 50 }),
      executeRaw: vi.fn().mockResolvedValue(1),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: spies.executeRaw,
      stockAdjustment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 50,
          documentNo: "ADJ-001",
          warehouseId: 1,
          status: "draft",
          date: new Date("2024-06-15"),
          items: [{ id: 1, itemId: 7, systemQty: 0, actualQty: 2, difference: 2, unitCost: 100 }],
        }),
        update: spies.adjUpdate,
      },
      stockAdjustmentItem: { update: vi.fn().mockResolvedValue({ id: 1 }) },
      stockMove: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: spies.moveCreate },
      item: { findUnique: vi.fn().mockResolvedValue({ qtyOnHand: 0 }), findMany: vi.fn().mockResolvedValue([]) },
      itemSerial: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      inventoryLayer: { groupBy: vi.fn().mockResolvedValue([]) },
      systemSetting: { findFirst: vi.fn().mockResolvedValue({ periodLockDate: null }) },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.adjUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })
})
