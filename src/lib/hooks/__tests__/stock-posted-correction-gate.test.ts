import { beforeEach, describe, expect, it, vi } from "vitest"

// INV-BR-010 (P0 TEST-STRATEGY skenario 6-7): koreksi stok posted HANYA lewat
// jalur terdokumentasi — processStockAdjustment (draft + assertApproved sebelum
// efek stok/jurnal, klaim atomik draft->processing, rollback klaim bila tx
// gagal), processPurchaseReturn (izin approve_* + status draft, hook stok +
// jurnal GL dalam SATU tx), completeSalesReturn (izin approve_* + SoD +
// status draft, hook stok + jurnal GL dalam SATU tx). Hook langsung atas
// dokumen non-draft/non-prosesable = no-op total tanpa StockMove/jurnal/
// perubahan qtyOnHand. Falsifikasi: hapus gate status di hook mana pun
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

const DATE = new Date("2026-10-01")
const itemRow = { id: 3, defaultWarehouseId: 5, trackSerial: false, trackBatch: false }

function makeSpies() {
  return {
    moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
    docUpdate: vi.fn().mockResolvedValue({}),
    executeRaw: vi.fn().mockResolvedValue(1),
  }
}

function wireTx(tx: Record<string, unknown>) {
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
}

function baseTx(spies: ReturnType<typeof makeSpies>) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: spies.executeRaw,
    stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: spies.moveCreate },
    item: { findMany: vi.fn().mockResolvedValue([itemRow]) },
    itemSerial: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    itemBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
  }
}

describe("INV-BR-010: dokumen non-draft ditolak hook stok (nol efek)", () => {
  it("stock adjustment cancelled -> no-op total (skenario 6)", async () => {
    const spies = makeSpies()
    wireTx({
      ...baseTx(spies),
      stockAdjustment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 50, documentNo: "ADJ-001", warehouseId: 1, status: "cancelled", date: DATE,
          items: [{ id: 1, itemId: 7, systemQty: 0, actualQty: 2, difference: 2, unitCost: 100 }],
        }),
        update: spies.docUpdate,
      },
      stockAdjustmentItem: { update: vi.fn().mockResolvedValue({}) },
      inventoryLayer: { groupBy: vi.fn().mockResolvedValue([]) },
    })

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(mocks.onStockAdjustment).not.toHaveBeenCalled()
    expect(spies.docUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })

  it("stock adjustment approved: diproses -> StockMove posted + jurnal + status processed (skenario 7)", async () => {
    const spies = makeSpies()
    wireTx({
      ...baseTx(spies),
      stockAdjustment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 50, documentNo: "ADJ-001", warehouseId: 1, status: "approved", date: DATE,
          items: [{ id: 1, itemId: 7, systemQty: 0, actualQty: 2, difference: 2, unitCost: 100, serialNumbers: null, batchNumbers: null }],
        }),
        update: spies.docUpdate,
      },
      stockAdjustmentItem: { update: vi.fn().mockResolvedValue({}) },
      inventoryLayer: { groupBy: vi.fn().mockResolvedValue([{ itemId: 7, _sum: { remaining: 0 } }]) },
    })

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "posted", referenceType: "StockAdjustment", referenceId: 50, impact: "IN" }),
    }))
    expect(mocks.onStockAdjustment).toHaveBeenCalledTimes(1)
    expect(spies.docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "processed" }),
    }))
  })

  it("purchase return returned -> no-op total walau belum ada movement", async () => {
    const spies = makeSpies()
    wireTx({
      ...baseTx(spies),
      purchaseReturn: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7, documentNo: "PR-7", purchaseOrderId: 4, date: DATE, status: "returned",
          items: [{ id: 42, itemId: 3, qty: 2, cost: 120, price: null }],
          purchaseOrder: { id: 4 },
        }),
        update: spies.docUpdate,
      },
      purchaseReturnItem: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      vendorBill: { findFirst: vi.fn().mockResolvedValue(null) },
      goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
    })

    await onPurchaseReturnProcessed(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.docUpdate).not.toHaveBeenCalled()
  })

  it("sales return cancelled -> no-op total walau belum ada movement", async () => {
    const spies = makeSpies()
    wireTx({
      ...baseTx(spies),
      salesReturn: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7, salesInvoiceId: null, date: DATE, status: "cancelled",
          items: [{ itemId: 3, qty: 2, cost: 120 }],
        }),
        update: spies.docUpdate,
      },
      warehouse: { findFirst: vi.fn().mockResolvedValue({ id: 5 }) },
      salesInvoiceItem: { findMany: vi.fn().mockResolvedValue([]) },
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(mocks.createInLayer).not.toHaveBeenCalled()
    expect(spies.docUpdate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
  })
})
