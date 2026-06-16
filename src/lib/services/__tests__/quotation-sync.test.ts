import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma so the service runs against in-memory fixtures. The
// sales-payment.hook recalc runs for real against the same mock so we can
// observe whether resyncOnEdit re-derives the invoice payment status after
// changing grandTotal.
const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    quotation: { findUnique: vi.fn() },
    salesOrder: { findMany: vi.fn(), update: vi.fn() },
    salesOrderItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    salesInvoice: { findMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    salesInvoiceItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  }
  // Re-derive payment status using the same logic as recalcCore. This is what
  // the sales-payment.hook does; we simulate it so the test exercises the
  // resyncOnEdit -> onSalesPaymentUpdated plumbing.
  const onSalesPaymentUpdatedMock = vi.fn(async (invoiceId: number, db: any) => {
    const inv = await db.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })
    const payments = await db.salesPayment.findMany({
      where: { salesInvoiceId: invoiceId },
      select: { amount: true },
    })
    const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    const grandTotal = Number(inv.grandTotal ?? 0)
    let status = "posted"
    let paymentStatus = "posted"
    if (totalPaid >= grandTotal && grandTotal > 0) {
      status = "paid"
      paymentStatus = "paid"
    } else if (totalPaid > 0) {
      status = "partial"
      paymentStatus = "partial"
    }
    await db.salesInvoice.update({
      where: { id: invoiceId },
      data: { paidAmount: totalPaid, status, paymentStatus },
    })
  })
  return { prismaMock, onSalesPaymentUpdatedMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentUpdated: mocks.onSalesPaymentUpdatedMock,
}))

import { resyncOnEdit } from "../quotation-sync.service"

describe("quotation-sync.service / resyncOnEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("recomputes payment status of a partially-paid invoice when the edited quotation lowers grandTotal below paidAmount", async () => {
    const p = mocks.prismaMock

    // Quotation edited down to a 500 total (was 1000).
    p.quotation.findUnique.mockResolvedValue({
      id: 1,
      status: "draft",
      subtotal: 500,
      discount: 0,
      tax: 0,
      grandTotal: 500,
      sections: [{ items: [] }],
    })

    p.salesOrder.findMany.mockResolvedValue([{ id: 10 }])
    p.salesOrder.update.mockResolvedValue({})
    p.salesOrderItem.deleteMany.mockResolvedValue({ count: 0 })

    // Linked invoice: already partially paid (600 of 1000) → status "partial".
    p.salesInvoice.findMany.mockResolvedValue([
      { id: 100, salesOrderId: 10, status: "partial", paidAmount: 600, grandTotal: 1000 },
    ])
    p.salesInvoiceItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesInvoice.update.mockResolvedValue({})

    // recalcCore re-reads the invoice (now with the new 500 total) + payments.
    p.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 100,
      status: "partial",
      grandTotal: 500,
    })
    p.salesPayment.findMany.mockResolvedValue([{ amount: 600 }])

    await resyncOnEdit(1)

    // After lowering grandTotal to 500 with 600 already paid, the invoice must
    // be reclassified as fully paid. Before the fix, resyncOnEdit only rewrote
    // the totals and left status/paymentStatus stuck at "partial".
    expect(p.salesInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", paymentStatus: "paid" }),
      }),
    )
  })

  it("batches the linked-invoice lookup into a single findMany (N+1 fix) when multiple SOs are being re-synced", async () => {
    const p = mocks.prismaMock

    // Quotation with 2 SOs and 2 items per SO. Re-edited → 2 unfinished SOs need
    // to be re-synced, each with its own linked unpaid invoice. The pre-fix code
    // would call tx.salesInvoice.findMany once per SO (2 calls). The post-fix
    // code calls it exactly once with salesOrderId: { in: [10, 20] }.
    p.quotation.findUnique.mockResolvedValue({
      id: 2,
      status: "draft",
      subtotal: 800,
      discount: 0,
      tax: 0,
      grandTotal: 800,
      sections: [
        {
          items: [
            { itemId: 1, qty: 2, unitPrice: 100, discount: 0, total: 200 },
            { itemId: 2, qty: 1, unitPrice: 200, discount: 0, total: 200 },
          ],
        },
      ],
    })

    p.salesOrder.findMany.mockResolvedValue([{ id: 10 }, { id: 20 }])
    p.salesOrder.update.mockResolvedValue({})
    p.salesOrderItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesOrderItem.createMany.mockResolvedValue({ count: 2 })

    // Both invoices are returned in a single findMany (the batched shape).
    p.salesInvoice.findMany.mockResolvedValue([
      { id: 100, salesOrderId: 10, status: "posted", paidAmount: 0, grandTotal: 800 },
      { id: 200, salesOrderId: 20, status: "posted", paidAmount: 0, grandTotal: 800 },
    ])
    p.salesInvoiceItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesInvoiceItem.createMany.mockResolvedValue({ count: 2 })
    p.salesInvoice.update.mockResolvedValue({})

    // recalcCore re-reads each invoice (still 800 grandTotal, 0 paid → status "posted").
    p.salesInvoice.findUniqueOrThrow.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      status: "posted",
      grandTotal: 800,
    }))
    p.salesPayment.findMany.mockResolvedValue([])

    await resyncOnEdit(2)

    // The single batched invoice lookup must use salesOrderId: { in: [10, 20] }
    // — exactly once — not once-per-SO.
    const invoiceFindManyCalls = p.salesInvoice.findMany.mock.calls.filter(
      (call: any[]) => call[0]?.where?.salesOrderId?.in,
    )
    expect(invoiceFindManyCalls).toHaveLength(1)
    expect(invoiceFindManyCalls[0][0].where.salesOrderId.in).toEqual([10, 20])
    // Both invoices must still be processed (deleteMany / createMany fire once
    // each per invoice). salesInvoice.update fires TWICE per invoice (once in
    // resyncOnEdit to overwrite totals, once again in onSalesPaymentUpdated
    // via recalcCore to re-derive status), so we expect 4 calls here.
    expect(p.salesInvoiceItem.deleteMany).toHaveBeenCalledTimes(2)
    expect(p.salesInvoiceItem.createMany).toHaveBeenCalledTimes(2)
    expect(p.salesInvoice.update).toHaveBeenCalledTimes(4)
    // The two SOs themselves are updated exactly once each.
    expect(p.salesOrder.update).toHaveBeenCalledTimes(2)
  })
})
