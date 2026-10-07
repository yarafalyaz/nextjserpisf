import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  toBaseFactor: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumberBatch: mocks.generateDocumentNumberBatch }))
vi.mock("@/lib/services/inventory-fifo", () => ({ consumeFifoLayers: mocks.consumeFifoLayers }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onPurchaseReturnProcessed } from "@/lib/hooks/purchase-return.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 240 })
  mocks.toBaseFactor.mockResolvedValue(12)
})

describe("purchase return UoM and receipt warehouse", () => {
  it("returns 2 BOX as 24 base units to the item's receipt warehouse", async () => {
    const spies = {
      executeRaw: vi.fn().mockResolvedValue(1),
      queryRaw: vi.fn().mockResolvedValue([]),
      moveFindFirst: vi.fn().mockResolvedValue(null),
      moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
      returnFindUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 7,
        documentNo: "PR-7",
        purchaseOrderId: 4,
        date: new Date("2026-10-01"),
        status: "processing",
        items: [{ itemId: 3, qty: 2, cost: 120 }],
      }),
      receiptItemFindMany: vi.fn().mockResolvedValue([{
        itemId: 3,
        uom: "BOX",
        warehouseId: 2,
        goodsReceipt: { warehouseId: 1 },
      }]),
      warehouseFindFirst: vi.fn().mockResolvedValue({ id: 5 }),
      itemFindMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 6 }]),
      returnUpdate: vi.fn().mockResolvedValue({}),
      settingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    }
    const tx = {
      $executeRaw: spies.executeRaw,
      $queryRaw: spies.queryRaw,
      purchaseReturn: { findUniqueOrThrow: spies.returnFindUniqueOrThrow, update: spies.returnUpdate },
      stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
      goodsReceiptItem: { findMany: spies.receiptItemFindMany },
      warehouse: { findFirst: spies.warehouseFindFirst },
      item: { findMany: spies.itemFindMany },
      systemSetting: { findFirst: spies.settingFindFirst },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))

    await onPurchaseReturnProcessed(7, 9)

    expect(mocks.toBaseFactor).toHaveBeenCalledWith(tx, 3, "BOX")
    expect(mocks.consumeFifoLayers).toHaveBeenCalledWith(tx, expect.objectContaining({
      itemId: 3,
      warehouseId: 2,
      qty: 24,
    }))
    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 3, warehouseId: 2, qty: 24 }),
    }))
    expect(spies.returnUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: { status: "returned" } }))
  })

  // Regression: the purchase-return hook must record the serial units that left
  // stock (consumeFifoLayers marks them "used" for trackSerial items) on the
  // return line, so the document keeps the attribution.
  it("persists the consumed serials on the return line", async () => {
    const spies = {
      executeRaw: vi.fn().mockResolvedValue(1),
      queryRaw: vi.fn().mockResolvedValue([]),
      moveFindFirst: vi.fn().mockResolvedValue(null),
      moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
      returnFindUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 7,
        documentNo: "PR-7",
        purchaseOrderId: 4,
        date: new Date("2026-10-01"),
        status: "processing",
        items: [{ id: 42, itemId: 3, qty: 2, cost: 120 }],
      }),
      receiptItemFindMany: vi.fn().mockResolvedValue([{
        itemId: 3, uom: "PCS", warehouseId: 2, goodsReceipt: { warehouseId: 1 },
      }]),
      warehouseFindFirst: vi.fn().mockResolvedValue({ id: 5 }),
      itemFindMany: vi.fn().mockResolvedValue([{ id: 3, defaultWarehouseId: 6 }]),
      returnUpdate: vi.fn().mockResolvedValue({}),
      returnItemUpdate: vi.fn().mockResolvedValue({}),
      settingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    }
    const tx = {
      $executeRaw: spies.executeRaw,
      $queryRaw: spies.queryRaw,
      purchaseReturn: { findUniqueOrThrow: spies.returnFindUniqueOrThrow, update: spies.returnUpdate },
      purchaseReturnItem: { update: spies.returnItemUpdate },
      stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
      goodsReceiptItem: { findMany: spies.receiptItemFindMany },
      warehouse: { findFirst: spies.warehouseFindFirst },
      item: { findMany: spies.itemFindMany },
      systemSetting: { findFirst: spies.settingFindFirst },
    }
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
    mocks.toBaseFactor.mockResolvedValue(1)
    mocks.consumeFifoLayers.mockResolvedValue({
      consumedCost: 240,
      consumedSerials: ["SN-9", "SN-10"],
      shortfall: 0,
    })

    await onPurchaseReturnProcessed(7, 9)

    expect(spies.returnItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: { serialNumbers: ["SN-9", "SN-10"] } }),
    )
  })
})
