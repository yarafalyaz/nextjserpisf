import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  invoiceFindUniqueOrThrow: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  paymentFindMany: vi.fn(),
  invoiceUpdate: vi.fn(),
  transaction: vi.fn(),
  customerFindUnique: vi.fn(),
  customerCommissionRateFindMany: vi.fn(),
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
    customer: {
      findUnique: (...a: unknown[]) => mocks.customerFindUnique(...a),
    },
    customerCommissionRate: {
      findMany: (...a: unknown[]) => mocks.customerCommissionRateFindMany(...a),
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
    // F-036-S: fixture faktur drift tanpa commissionRatePercent terbaca
    // undefined -> snapshot dibekukan lewat helper bersama (tarif 0 jujur
    // karena panel tarif kosong).
    customer: { findUnique: mocks.customerFindUnique },
    customerCommissionRate: { findMany: mocks.customerCommissionRateFindMany },
  }
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.transaction.mockImplementation(async (fn: any) => fn(makeTx()))
  mocks.invoiceUpdate.mockResolvedValue({})
  mocks.customerFindUnique.mockResolvedValue({ customerCategoryId: null })
  mocks.customerCommissionRateFindMany.mockResolvedValue([])
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

  // FIN-BR-006: satu helper bersama dua sisa batas (dalam vs luar toleransi).
  async function recalcWithPaid(id: number, amount: number) {
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id,
      grandTotal: 1000,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([{ amount }])
    await onSalesPaymentUpdated(id)
  }

  it("FIN-BR-006: sisa 0,50 dalam toleransi Rp1 -> 'paid'", async () => {
    await recalcWithPaid(61, 999.5)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", paymentStatus: "paid" }),
      }),
    )
  })

  it("FIN-BR-006: sisa 1,01 di luar toleransi -> 'partial'", async () => {
    await recalcWithPaid(62, 998.99)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "partial", paymentStatus: "partial" }),
      }),
    )
  })

  it("still leaves an underpaid invoice beyond tolerance on 'partial'", async () => {
    // FIN-BR-006: sisa 100 jauh di luar toleransi Rp1 -> tetap "partial".
    // (Fixture lama grandTotal 0.6 / bayar 0.5 gugur: sisa 0,10 kini
    // dalam toleransi sehingga lunas — perilaku baru yang disengaja.)
    mocks.invoiceFindUniqueOrThrow.mockResolvedValueOnce({
      id: 99,
      grandTotal: 600,
      status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValueOnce([
      { amount: 200 },
      { amount: 300 },
    ])

    await onSalesPaymentUpdated(99)

    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "partial", paymentStatus: "partial" }),
      }),
    )
  })
})
