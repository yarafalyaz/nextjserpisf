import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for reverseSalesInvoicePostingTx — the shared reversal used by the
// delete/void flows AND the "edit a posted-but-unpaid invoice" flow. When an
// invoice's items change after posting, the old stock-out must be restored and
// the AR/revenue + COGS journals removed before the new lines are re-posted.

const stockMoveFindMany = vi.fn()
const stockMoveCreate = vi.fn()
const stockMoveDeleteMany = vi.fn()
const inventoryLayerCreateMany = vi.fn()
const executeRaw = vi.fn()
const salesPaymentFindMany = vi.fn()
const deleteJournalByReferenceTx = vi.fn()

vi.mock("@/lib/hooks/accounting.hook", () => ({
  deleteJournalByReferenceTx: (...a: unknown[]) => deleteJournalByReferenceTx(...a),
}))

const client = {
  stockMove: {
    findMany: (...a: unknown[]) => stockMoveFindMany(...a),
    create: (...a: unknown[]) => stockMoveCreate(...a),
    deleteMany: (...a: unknown[]) => stockMoveDeleteMany(...a),
  },
  inventoryLayer: {
    createMany: (...a: unknown[]) => inventoryLayerCreateMany(...a),
  },
  salesPayment: {
    findMany: (...a: unknown[]) => salesPaymentFindMany(...a),
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
  stockMoveDeleteMany.mockResolvedValue({ count: 0 })
  inventoryLayerCreateMany.mockResolvedValue({ count: 0 })
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
    // original OUT move removed
    expect(stockMoveDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } })
    // journals reversed
    expect(deleteJournalByReferenceTx).toHaveBeenCalledWith(
      client,
      ["SalesInvoice", "SalesInvoiceCOGS"],
      7,
    )
  })

  it("is a no-op for stock when there are no OUT moves", async () => {
    stockMoveFindMany.mockResolvedValue([])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(executeRaw).not.toHaveBeenCalled()
    expect(stockMoveCreate).not.toHaveBeenCalled()
    expect(inventoryLayerCreateMany).not.toHaveBeenCalled()
    expect(stockMoveDeleteMany).not.toHaveBeenCalled()
    expect(deleteJournalByReferenceTx).toHaveBeenCalledWith(
      client,
      ["SalesInvoice", "SalesInvoiceCOGS"],
      7,
    )
  })

  it("reverses payment journals by default", async () => {
    salesPaymentFindMany.mockResolvedValue([{ id: 11 }, { id: 12 }])

    await reverseSalesInvoicePostingTx(client as never, 7)

    expect(deleteJournalByReferenceTx).toHaveBeenCalledWith(client, "SalesPayment", [11, 12])
  })

  it("keeps payment journals when reversePaymentJournals is false (invoice re-price)", async () => {
    salesPaymentFindMany.mockResolvedValue([{ id: 11 }])

    await reverseSalesInvoicePostingTx(client as never, 7, { reversePaymentJournals: false })

    // must NOT touch the payment (DP/cash) journals when re-pricing an invoice
    expect(deleteJournalByReferenceTx).not.toHaveBeenCalledWith(client, "SalesPayment", [11])
    expect(salesPaymentFindMany).not.toHaveBeenCalled()
  })
})
