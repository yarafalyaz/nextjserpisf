import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const generateDocNumberMock = vi.fn()
const transactionMock = vi.fn()

const quotationCreateMock = vi.fn()
const vehicleFindFirstMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customerVehicle: { findFirst: (...a: unknown[]) => vehicleFindFirstMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: vi.fn(), onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(), deleteJournalByReference: vi.fn(), deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumberMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import { createQuotation } from "../sales.actions"

function fdData(data: unknown): FormData {
  const f = new FormData()
  f.set("data", JSON.stringify(data))
  return f
}

function wireTransaction() {
  const tx = {
    quotation: { create: quotationCreateMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, generateDocNumberMock,
    transactionMock, quotationCreateMock, vehicleFindFirstMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  generateDocNumberMock.mockResolvedValue("QUO-0001")
  quotationCreateMock.mockResolvedValue({ id: 99 })
  wireTransaction()
})

describe("createQuotation server-side total recompute", () => {
  it("ignores tampered client totals and recomputes from line items", async () => {
    // Client claims everything is free (subtotal/grandTotal/total = 0)
    // but the real lines are 2 x 100000 and 1 x 50000 = 250000.
    const data = {
      customerId: 10,
      date: "2026-06-09",
      subtotal: 0,        // tampered
      discount: 0,
      tax: 0,
      grandTotal: 0,      // tampered — would let goods leave for free
      sections: [
        {
          name: "Jasa",
          items: [
            { itemId: 1, qty: 2, unitPrice: 100000, discountType: "fixed", discount: 0, total: 0 },
            { itemId: 2, qty: 1, unitPrice: 50000, discountType: "fixed", discount: 0, total: 0 },
          ],
        },
      ],
    }
    const result = await createQuotation(fdData(data))
    expect(result.success).toBe(true)

    // Header persisted with the RECOMPUTED grandTotal, not the client's 0.
    // Line totals recomputed too (not the client-sent 0) through the nested writes.
    expect(quotationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 250000,
          grandTotal: 250000,
          sections: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                items: expect.objectContaining({
                  create: expect.arrayContaining([
                    expect.objectContaining({ qty: 2, unitPrice: 100000, total: 200000 }),
                    expect.objectContaining({ qty: 1, unitPrice: 50000, total: 50000 }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
      }),
    )
  })

  it("applies percent line discount and header discount/tax in the recompute", async () => {
    const data = {
      customerId: 10,
      date: "2026-06-09",
      subtotal: 999, discount: 100, tax: 50, grandTotal: 1, // garbage client values
      sections: [
        {
          name: "Parts",
          items: [
            // 4 x 1000 = 4000, 10% discount → line total 3600
            { itemId: 1, qty: 4, unitPrice: 1000, discountType: "percent", discount: 10, total: 999 },
          ],
        },
      ],
    }
    const result = await createQuotation(fdData(data))
    expect(result.success).toBe(true)
    // subtotal 3600, header discount 100, tax 50 → grandTotal 3550
    // Line discount 10% of 4 x 1000 = 400, line total 3600, asserted through the nested write.
    expect(quotationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 3600,
          discount: 100,
          tax: 50,
          grandTotal: 3550,
          sections: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                items: expect.objectContaining({
                  create: expect.arrayContaining([
                    expect.objectContaining({ discount: 400, total: 3600 }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
      }),
    )
  })

  it("clamps negative header discount and negative tax to 0", async () => {
    // Client tries to send negative discount and tax (to make grandTotal
    // artificially high) — both must be clamped to 0 so the persisted row stays
    // sane. Mirrors the updateSalesInvoice header clamp.
    const data = {
      customerId: 10,
      date: "2026-06-09",
      subtotal: 999, discount: -500, tax: -100, grandTotal: 1, // garbage client values
      sections: [
        {
          name: "Parts",
          // 1 x 1000 = 1000 (no line discount)
          items: [{ itemId: 1, qty: 1, unitPrice: 1000, discountType: "fixed", discount: 0, total: 999 }],
        },
      ],
    }
    const result = await createQuotation(fdData(data))
    expect(result.success).toBe(true)
    // subtotal 1000, header discount clamped from -500 to 0, tax clamped from -100 to 0
    // grandTotal = max(0, 1000 + 0 - 0) = 1000
    expect(quotationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 1000,
          discount: 0, // negative clamped
          tax: 0, // negative clamped
          grandTotal: 1000,
        }),
      }),
    )
  })

  it("clamps oversize header discount to the recomputed subtotal", async () => {
    // Header discount larger than subtotal: previously the grandTotal was clamped
    // to 0 but the discount was persisted as-is, so the row read back showed
    // discount > line total. Now both must agree: discount = subtotal.
    const data = {
      customerId: 10,
      date: "2026-06-09",
      subtotal: 999, discount: 99999, tax: 0, grandTotal: 1, // garbage client values
      sections: [
        {
          name: "Parts",
          items: [{ itemId: 1, qty: 1, unitPrice: 500, discountType: "fixed", discount: 0, total: 999 }],
        },
      ],
    }
    const result = await createQuotation(fdData(data))
    expect(result.success).toBe(true)
    // subtotal 500, header discount clamped from 99999 to 500
    // grandTotal = max(0, 500 + 0 - 500) = 0
    expect(quotationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 500,
          discount: 500, // clamped to subtotal
          tax: 0,
          grandTotal: 0,
        }),
      }),
    )
  })

  it("clamps per-line percent discount to [0, 100] so a tampered >100% can't produce a discount larger than the line subtotal", async () => {
    // Line sends discount 150% (which would normally yield lineSubtotal * 1.5) and
    // a negative percent (which would yield a negative line discount and a phantom
    // credit). Both must be clamped so the persisted discount amount stays within
    // [0, lineSubtotal]. The per-line total is already clamped to >= 0 by the
    // computeLine helper, so this clamp just protects the persisted discount value.
    const data = {
      customerId: 10,
      date: "2026-06-09",
      subtotal: 999, discount: 0, tax: 0, grandTotal: 1,
      sections: [
        {
          name: "Parts",
          items: [
            // 2 x 1000 = 2000 lineSubtotal
            { itemId: 1, qty: 2, unitPrice: 1000, discountType: "percent", discount: 150, total: 999 },
            { itemId: 2, qty: 1, unitPrice: 1000, discountType: "percent", discount: -50, total: 999 },
          ],
        },
      ],
    }
    const result = await createQuotation(fdData(data))
    expect(result.success).toBe(true)
    // Line 1: 150% clamped to 100% → discount 2000, line total 0
    // Line 2: -50% clamped to 0%   → discount 0,    line total 1000
    // subtotal 1000, grandTotal 1000
    expect(quotationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 1000,
          discount: 0,
          tax: 0,
          grandTotal: 1000,
          sections: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                items: expect.objectContaining({
                  create: expect.arrayContaining([
                    expect.objectContaining({ qty: 2, unitPrice: 1000, discount: 2000, total: 0 }),
                    expect.objectContaining({ qty: 1, unitPrice: 1000, discount: 0, total: 1000 }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
      }),
    )
  })
})
