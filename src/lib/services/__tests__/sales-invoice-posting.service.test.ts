import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for reverseSalesInvoicePostingTx — the shared reversal used by the
// delete/void flows AND the "edit a posted-but-unpaid invoice" flow. When an
// invoice's items change after posting, the old stock-out must be restored and
// the AR/revenue + COGS journals REVERSED (entry lawan, histori utuh — P1-7)
// before the new lines are re-posted.

const stockMoveFindMany = vi.fn()
const stockMoveCreate = vi.fn()
const stockMoveUpdateMany = vi.fn()
const inventoryLayerCreateMany = vi.fn()
const inventoryLayerFindMany = vi.fn()
const itemBatchFindFirst = vi.fn()
const itemBatchUpdate = vi.fn()
const itemBatchCreate = vi.fn()
const executeRaw = vi.fn()
const salesPaymentFindMany = vi.fn()
const salesInvoiceItemFindMany = vi.fn()
const itemSerialUpdateMany = vi.fn()
const reverseJournalsByReferenceTx = vi.fn()

vi.mock("@/lib/hooks/accounting.hook", () => ({
  reverseJournalsByReferenceTx: (...a: unknown[]) => reverseJournalsByReferenceTx(...a),
}))

const client = {
  stockMove: {
    findMany: (...a: unknown[]) => stockMoveFindMany(...a),
    create: (...a: unknown[]) => stockMoveCreate(...a),
    updateMany: (...a: unknown[]) => stockMoveUpdateMany(...a),
  },
  inventoryLayer: {
    createMany: (...a: unknown[]) => inventoryLayerCreateMany(...a),
    findMany: (...a: unknown[]) => inventoryLayerFindMany(...a),
  },
  itemBatch: {
    findFirst: (...a: unknown[]) => itemBatchFindFirst(...a),
    update: (...a: unknown[]) => itemBatchUpdate(...a),
    create: (...a: unknown[]) => itemBatchCreate(...a),
  },
  salesPayment: {
    findMany: (...a: unknown[]) => salesPaymentFindMany(...a),
  },
  salesInvoiceItem: {
    findMany: (...a: unknown[]) => salesInvoiceItemFindMany(...a),
  },
  itemSerial: {
    updateMany: (...a: unknown[]) => itemSerialUpdateMany(...a),
  },
  $executeRaw: (...a: unknown[]) => executeRaw(...a),
}

import { reverseSalesInvoicePostingTx } from "@/lib/services/sales-invoice-posting.service"

beforeEach(() => {
  vi.clearAllMocks()
  stockMoveFindMany.mockResolvedValue([])
  stockMoveCreate.mockImplementation(({ data }: { data: { id?: number } }) =>
    Promise.resolve({ ...data, id: 99 }),
  )
  stockMoveUpdateMany.mockResolvedValue({ count: 0 })
  salesInvoiceItemFindMany.mockResolvedValue([])
  itemSerialUpdateMany.mockResolvedValue({ count: 0 })
  inventoryLayerCreateMany.mockResolvedValue({ count: 0 })
  inventoryLayerFindMany.mockResolvedValue([])
  itemBatchFindFirst.mockResolvedValue(null)
  itemBatchUpdate.mockResolvedValue({})
  itemBatchCreate.mockResolvedValue({})
  executeRaw.mockResolvedValue(0)
  salesPaymentFindMany.mockResolvedValue([])
})

describe("reverseSalesInvoicePostingTx", () => {
  it("restores qtyOnHand and creates a reversing inbound FIFO layer for each OUT move", async () => {
    stockMoveFindMany.mockResolvedValue([
      { id: 1, itemId: 10, warehouseId: 2, qty: 5, cost: 1000 },
    ])

    await reverseSalesInvoicePostingTx(client as never, 7)

    // qtyOnHand restored
    expect(executeRaw).toHaveBeenCalledTimes(1)
    // reversing IN move created
    expect(stockMoveCreate).toHaveBeenCalled()
    // FIFO layer created for the reversal
    expect(inventoryLayerCreateMany).toHaveBeenCalled()
    // P1-7: original OUT move ditandai reversed — TIDAK dihapus.
    expect(stockMoveUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { status: "reversed" },
    })
    // journals reversed via reversal entry (bukan hapus)
    expect(reverseJournalsByReferenceTx).toHaveBeenCalledWith(
      client,
      ["SalesInvoice", "SalesInvoiceCOGS"],
      7,
      expect.stringContaining("7"),
      null,
    )
  })

  it("is a no-op for stock when there are no OUT moves", async () => {
    stockMoveFindMany.mockResolvedValue([])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(executeRaw).not.toHaveBeenCalled()
    expect(stockMoveCreate).not.toHaveBeenCalled()
    expect(inventoryLayerCreateMany).not.toHaveBeenCalled()
    expect(stockMoveUpdateMany).not.toHaveBeenCalled()
    expect(reverseJournalsByReferenceTx).toHaveBeenCalledWith(
      client,
      ["SalesInvoice", "SalesInvoiceCOGS"],
      7,
      expect.stringContaining("7"),
      null,
    )
  })

  it("reverses payment journals by default", async () => {
    salesPaymentFindMany.mockResolvedValue([{ id: 11 }, { id: 12 }])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(reverseJournalsByReferenceTx).toHaveBeenCalledWith(
      client,
      "SalesPayment",
      [11, 12],
      expect.stringContaining("7"),
      null,
    )
  })

  it("restores consumed batch lots on reversal (layer batchNumber + ItemBatch qty)", async () => {
    stockMoveFindMany.mockResolvedValue([
      { id: 1, itemId: 10, warehouseId: 2, qty: 5, cost: 1000 },
    ])
    inventoryLayerFindMany.mockResolvedValue([
      { batchNumber: "LOT-A", warehouseId: 2, qtyOut: 5 },
    ])
    itemBatchFindFirst.mockResolvedValue({ id: 77 })

    await reverseSalesInvoicePostingTx(client as never, 7)

    // Layer pulih membawa identitas lot asalnya (bukan tanpa batch).
    expect(inventoryLayerCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ batchNumber: "LOT-A", qtyIn: 5, remaining: 5 }),
        ]),
      }),
    )
    // Lot fisik ditambah kembali, simetris dengan pemulihan serial.
    expect(itemBatchUpdate).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { qty: { increment: 5 } },
    })
    expect(itemBatchCreate).not.toHaveBeenCalled()
  })

  it("recreates the batch lot on reversal when the lot row is gone", async () => {
    stockMoveFindMany.mockResolvedValue([
      { id: 1, itemId: 10, warehouseId: 2, qty: 5, cost: 1000 },
    ])
    inventoryLayerFindMany.mockResolvedValue([
      { batchNumber: "LOT-A", warehouseId: 2, qtyOut: 5 },
    ])
    itemBatchFindFirst.mockResolvedValue(null)

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(itemBatchCreate).toHaveBeenCalledWith({
      data: { itemId: 10, batchNumber: "LOT-A", warehouseId: 2, qty: 5 },
    })
  })

  it("restores sold serials to available from the invoice lines (P1-7)", async () => {
    stockMoveFindMany.mockResolvedValue([])
    salesInvoiceItemFindMany.mockResolvedValue([
      { itemId: 10, serialNumbers: ["SN-1", "SN-2"] },
      { itemId: 11, serialNumbers: null },
    ])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(itemSerialUpdateMany).toHaveBeenCalledWith({
      where: { itemId: 10, serialNumber: { in: ["SN-1", "SN-2"] }, status: "used" },
      data: { status: "available" },
    })
    expect(itemSerialUpdateMany).toHaveBeenCalledTimes(1)
  })

  it("only reverses POSTED out moves (second reversal is a no-op for stock)", async () => {
    stockMoveFindMany.mockResolvedValue([])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(stockMoveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "posted" }),
      }),
    )
  })

  it("keeps payment journals when reversePaymentJournals is false (invoice re-price)", async () => {
    salesPaymentFindMany.mockResolvedValue([{ id: 11 }])

    await reverseSalesInvoicePostingTx(client as never, 7, { reversePaymentJournals: false })

    // must NOT touch the payment (DP/cash) journals when re-pricing an invoice
    expect(
      reverseJournalsByReferenceTx.mock.calls.some((c) => c[1] === "SalesPayment"),
    ).toBe(false)
    expect(salesPaymentFindMany).not.toHaveBeenCalled()
  })
})
