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
      { id: 100, status: "partial", paidAmount: 600, grandTotal: 1000 },
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
      })
    )
  })
})
