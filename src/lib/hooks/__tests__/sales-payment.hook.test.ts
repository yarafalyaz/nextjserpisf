import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  invoiceFindUniqueOrThrow: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  paymentFindMany: vi.fn(),
  invoiceUpdate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    salesInvoice: {
      findUniqueOrThrow: (...a: unknown[]) => mocks.invoiceFindUniqueOrThrow(...a),
      update: (...a: unknown[]) => mocks.invoiceUpdate(...a),
    },
    salesPayment: {
      findUniqueOrThrow: (...a: unknown[]) => mocks.paymentFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => mocks.paymentFindMany(...a),
    },
  },
}))

import { onSalesPaymentCreated, onSalesPaymentUpdated, onSalesPaymentDeleted } from "../sales-payment.hook"

function makeTx() {
  return {
    salesInvoice: {
      findUniqueOrThrow: mocks.invoiceFindUniqueOrThrow,
      update: mocks.invoiceUpdate,
    },
    salesPayment: {
      findMany: mocks.paymentFindMany,
    },
  }
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.transaction.mockImplementation(async (fn: any) => fn(makeTx()))
  mocks.invoiceUpdate.mockResolvedValue({})
})

describe("sales-payment recalc — float drift precision", () => {
  it("marks invoice 'paid' when payments sum exactly to grandTotal despite float drift", async () => {
    // Two Decimal(15,2) payments of 0.1 and 0.7 should fully settle a 0.8
    // grand-total invoice. Naive `sum + Number(...)` produces
    // 0.7999999999999999 (well-known JS float artefact) and would mark the
    // invoice "partial" forever, breaking AR aging + payment-status reports.
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id: 50,
      grandTotal: 0.8,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([
      { amount: 0.1 },
      { amount: 0.7 },
    ])

    await onSalesPaymentUpdated(50)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({
          paidAmount: 0.8,
          status: "paid",
          paymentStatus: "paid",
        }),
      }),
    )
  })

  it("marks invoice 'paid' on payment-created path with drifted sum", async () => {
    // Mirrors the create path through onSalesPaymentCreated → recalcCore.
    mocks.paymentFindUniqueOrThrow.mockResolvedValueOnce({ salesInvoiceId: 77 })
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id: 77,
      grandTotal: 0.8,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([
      { amount: 0.1 },
      { amount: 0.7 },
    ])

    await onSalesPaymentCreated(1)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: expect.objectContaining({
          paidAmount: 0.8,
          status: "paid",
          paymentStatus: "paid",
        }),
      }),
    )
  })

  it("marks invoice 'paid' on payment-deleted path with drifted sum (3 payments → 2)", async () => {
    // Invoice is 0.9; after deleting a 0.1 payment, two payments (0.1 + 0.8)
    // should settle it. Float sum without rounding: 0.1 + 0.8 = 0.9 exactly
    // (one of the few cases that actually rounds), so use a more sensitive
    // case: payments (0.1, 0.7, 0.1) summing to 0.9, then on delete of 0.1
    // we still have 0.1 + 0.7 = 0.7999... — the recalc must recognise this
    // as fully paid and not leave it stuck on 'partial'.
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id: 88,
      grandTotal: 0.8,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([
      { amount: 0.1 },
      { amount: 0.7 },
    ])

    await onSalesPaymentDeleted(88)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", paymentStatus: "paid" }),
      }),
    )
  })

  it("still leaves a strictly-partial invoice on 'partial' (real drift, not underpayment)", async () => {
    // 0.2 + 0.3 = 0.5 (no float drift; gt 0.6) → should remain "partial".
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id: 99,
      grandTotal: 0.6,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([
      { amount: 0.2 },
      { amount: 0.3 },
    ])

    await onSalesPaymentUpdated(99)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "partial", paymentStatus: "partial" }),
      }),
    )
  })
})
