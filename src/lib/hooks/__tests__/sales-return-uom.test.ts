import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  createInLayer: vi.fn(),
  toBaseFactor: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumberBatch: mocks.generateDocumentNumberBatch }))
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: mocks.createInLayer }))
vi.mock("@/lib/services/uom.service", () => ({ toBaseFactor: mocks.toBaseFactor }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onSalesReturnCompleted } from "@/lib/hooks/sales-return.hook"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.createInLayer.mockResolvedValue(undefined)
  mocks.toBaseFactor.mockResolvedValue(12)
})

/** Build a fully-stubbed tx and wire it into the prisma.$transaction mock. */
function wireTx(overrides: {
  items: { itemId: number; qty: number; cost: number }[]
  itemRows: Array<{ id: number; defaultWarehouseId: number | null; trackSerial?: boolean }>
  invoiceItemRows: Array<{ itemId: number; uom: string | null }>
  serialFindMany: ReturnType<typeof vi.fn>
  serialUpdateMany?: ReturnType<typeof vi.fn>
}) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    returnFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 7,
      salesInvoiceId: 4,
      date: new Date("2026-10-01"),
      status: "draft",
      items: overrides.items,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 10 }),
    warehouseFindFirst: vi.fn().mockResolvedValue({ id: 5 }),
    itemFindMany: vi.fn().mockResolvedValue(overrides.itemRows),
    invoiceItemFindMany: vi.fn().mockResolvedValue(overrides.invoiceItemRows),
    serialFindMany: overrides.serialFindMany,
    serialUpdateMany: overrides.serialUpdateMany ?? vi.fn().mockResolvedValue({ count: 0 }),
    systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    returnUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    salesReturn: { findUniqueOrThrow: spies.returnFindUniqueOrThrow, update: spies.returnUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    warehouse: { findFirst: spies.warehouseFindFirst },
    item: { findMany: spies.itemFindMany },
    itemSerial: { findMany: spies.serialFindMany, updateMany: spies.serialUpdateMany },
    salesInvoiceItem: { findMany: spies.invoiceItemFindMany },
    systemSetting: { findFirst: spies.systemSettingFindFirst },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return { spies, tx }
}

describe("sales return UoM", () => {
  it("returns 2 BOX as 24 base units and values the inventory layer per base unit", async () => {
    const { spies, tx } = wireTx({
      items: [{ itemId: 3, qty: 2, cost: 120 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5 }],
      invoiceItemRows: [{ itemId: 3, uom: "BOX" }],
      serialFindMany: vi.fn().mockResolvedValue([]),
    })

    await onSalesReturnCompleted(7, 9)

    expect(spies.moveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 3, qty: 24, cost: 10 }),
    }))
    expect(mocks.createInLayer).toHaveBeenCalledWith(tx, expect.objectContaining({ qty: 24, unitCost: 10 }))
    expect(spies.returnUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: { status: "completed" } }))
  })

  // Regression: a sales return puts previously-sold units back in stock, so a
  // serial-tracked item's serials must be revived to "available" (they were
  // marked "used" by the sale). Without this the returned serials stay "used"
  // forever and can never be sold/issued again.
  it("revives returned serials to available for a serial-tracked item", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    const { spies } = wireTx({
      items: [{ itemId: 3, qty: 2, cost: 100 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany: vi.fn().mockResolvedValue([{ id: 91 }, { id: 92 }]),
      serialUpdateMany: vi.fn().mockResolvedValue({ count: 2 }),
    })

    await onSalesReturnCompleted(7, 9)

    // Prefers serials already in the destination warehouse.
    expect(spies.serialFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId: 3, status: "used", warehouseId: 5 },
        take: 2,
      })
    )
    expect(spies.serialUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [91, 92] } },
        data: { status: "available", warehouseId: 5 },
      })
    )
  })

  it("prefers destination-warehouse serials and only falls back for the remainder", async () => {
    mocks.toBaseFactor.mockResolvedValue(1)
    // First (destination-warehouse) query yields 1 of the 2 needed; the fallback
    // query must exclude it and take the remaining 1.
    const serialFindMany = vi
      .fn()
      .mockImplementationOnce(async () => [{ id: 91 }])
      .mockImplementationOnce(async () => [{ id: 92 }])
    const { spies } = wireTx({
      items: [{ itemId: 3, qty: 2, cost: 100 }],
      itemRows: [{ id: 3, defaultWarehouseId: 5, trackSerial: true }],
      invoiceItemRows: [{ itemId: 3, uom: "PCS" }],
      serialFindMany,
      serialUpdateMany: vi.fn().mockResolvedValue({ count: 2 }),
    })

    await onSalesReturnCompleted(7, 9)

    expect(serialFindMany.mock.calls.length).toBe(2)
    expect(serialFindMany.mock.calls[0][0].where).toEqual({
      itemId: 3,
      status: "used",
      warehouseId: 5,
    })
    expect(spies.serialUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [91, 92] } } })
    )
  })
})
