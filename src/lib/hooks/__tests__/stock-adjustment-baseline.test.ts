import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the stock-adjustment client-trust fix (fcda272): the
// adjustment's stored `difference` (and `systemQty`) were derived from a
// client-supplied currentQty at create time. The process hook used to apply
// that stored `difference` as a blind delta to qtyOnHand. A stale or forged
// baseline therefore made the final qtyOnHand diverge from actualQty.
// The hook now reads the LIVE qtyOnHand under the item row lock and computes
// delta = actualQty - liveQty, so the result converges to actualQty regardless.

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  consumeFifoLayers: vi.fn(),
  createInLayer: vi.fn(),
  onStockAdjustment: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
  createInLayer: mocks.createInLayer,
}))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onStockAdjustment: mocks.onStockAdjustment },
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onStockAdjustmentProcessed } from "@/lib/hooks/stock-adjustment.hook"

function wireTx(opts: {
  items: Array<{ itemId: number; systemQty: number; actualQty: number; difference: number; unitCost: number }>
  liveQty: Record<number, number>
}) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    adjFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 50,
      documentNo: "ADJ-001",
      warehouseId: 1,
      status: "draft",
      items: opts.items,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    itemFindUnique: vi.fn().mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve({ qtyOnHand: opts.liveQty[where.id] ?? 0 }),
    ),
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    executeRaw: vi.fn().mockResolvedValue(1),
    adjUpdate: vi.fn().mockResolvedValue({ id: 50 }),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    stockAdjustment: { findUniqueOrThrow: spies.adjFindUniqueOrThrow, update: spies.adjUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    item: { findUnique: spies.itemFindUnique },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`)
  mocks.consumeFifoLayers.mockResolvedValue({ consumedCost: 0, shortfall: 0 })
})

describe("onStockAdjustmentProcessed live-qty baseline", () => {
  it("applies delta against LIVE qtyOnHand, not the stored client baseline", async () => {
    // Client claimed systemQty=0 and difference=10 (actualQty=10). But the LIVE
    // on-hand is 8 (stock moved since the form was loaded). The real delta is
    // 10 - 8 = +2, NOT the stored +10.
    const spies = wireTx({
      items: [{ itemId: 7, systemQty: 0, actualQty: 10, difference: 10, unitCost: 100 }],
      liveQty: { 7: 8 },
    })

    await onStockAdjustmentProcessed(50, 1)

    // qtyOnHand update must carry +2 (the live-based delta), never +10.
    expect(spies.executeRaw).toHaveBeenCalledTimes(1)
    // Tagged-template call: args are (strings, ...values). The qtyDiff value is
    // the first interpolated value.
    const callArgs = spies.executeRaw.mock.calls[0]
    const interpolated = callArgs.slice(1)
    expect(interpolated).toContain(2)
    expect(interpolated).not.toContain(10)

    // IN move (positive delta) created with qty 2.
    const inMove = spies.moveCreate.mock.calls[0][0] as { data: { qty: number; impact: string } }
    expect(inMove.data.qty).toBe(2)
    expect(inMove.data.impact).toBe("IN")
  })

  it("skips the item when live qty already equals actualQty (zero real delta)", async () => {
    // Stored difference says +5, but live qty already matches actualQty -> no-op.
    const spies = wireTx({
      items: [{ itemId: 9, systemQty: 0, actualQty: 5, difference: 5, unitCost: 100 }],
      liveQty: { 9: 5 },
    })

    await onStockAdjustmentProcessed(50, 1)

    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(spies.executeRaw).not.toHaveBeenCalled()
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
  })

  it("consumes FIFO when live qty exceeds actualQty (negative real delta)", async () => {
    // actualQty=3, live=8 -> delta -5 -> OUT, consume 5 from FIFO.
    const spies = wireTx({
      items: [{ itemId: 11, systemQty: 8, actualQty: 3, difference: -5, unitCost: 100 }],
      liveQty: { 11: 8 },
    })

    await onStockAdjustmentProcessed(50, 1)

    expect(mocks.consumeFifoLayers).toHaveBeenCalledTimes(1)
    const consumeArg = mocks.consumeFifoLayers.mock.calls[0][1] as { qty: number; itemId: number }
    expect(consumeArg.qty).toBe(5)
    expect(consumeArg.itemId).toBe(11)
    const outMove = spies.moveCreate.mock.calls[0][0] as { data: { qty: number; impact: string } }
    expect(outMove.data.impact).toBe("OUT")
  })
})
