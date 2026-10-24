import { describe, expect, it } from "vitest"

import {
  buildCustomerLateFeeTerms,
  buildLateFeeOutstandingByInvoice,
  buildSalesLateFeePanel,
  lateFeeRateLabel,
} from "../sales-late-fee"

const doc = {
  id: 1,
  documentNo: "LF-0001",
  date: new Date(2026, 9, 15),
  dueReferenceDate: new Date(2026, 9, 1),
  overdueDays: 14,
  basisAmount: 6_000_000,
  ratePercentPerDay: 0.1,
  flatAmountPerDay: null,
  capAmount: null,
  amount: 84_000,
  paidAmount: 34_000,
  status: "partial",
  reversesId: null,
  notes: null,
  payments: [],
}

describe("sales-late-fee read-model F-2026-10-22-093-V", () => {
  it("sisa saldo dokumen dari snapshot tersimpan; nol hitung tarif ulang", () => {
    const panel = buildSalesLateFeePanel({
      salesInvoiceId: 9,
      invoiceDocumentNo: "INV-0009",
      customerId: 3,
      customerName: "PT Uji",
      documents: [doc],
      terms: [],
      lateFeeIncomeAccountSet: false,
    })
    expect(panel.documents[0].outstanding).toBe(50_000)
    expect(panel.documents[0].statusLabel).toBe("Sebagian Dibayar")
    expect(panel.documents[0].canPay).toBe(true)
    expect(panel.documents[0].canReverse).toBe(true)
    expect(panel.totalOutstanding).toBe(50_000)
    expect(panel.hasOutstandingLateFee).toBe(true)
    expect(panel.lateFeeIncomeAccountSet).toBe(false)
  })

  it("dokumen lunas/dibalik tidak bisa dibayar/dibalik lagi; reversal ditandai", () => {
    const panel = buildSalesLateFeePanel({
      salesInvoiceId: 9,
      invoiceDocumentNo: "INV-0009",
      customerId: 3,
      customerName: "PT Uji",
      documents: [
        { ...doc, id: 2, documentNo: "LF-0002", status: "paid", paidAmount: 84_000 },
        { ...doc, id: 3, documentNo: "LF-0003", status: "reversed", reversesId: 1, paidAmount: 0 },
      ],
      terms: [],
      lateFeeIncomeAccountSet: true,
    })
    expect(panel.documents[0].canPay).toBe(false)
    expect(panel.documents[0].canReverse).toBe(false)
    expect(panel.documents[1].isReversal).toBe(true)
    expect(panel.documents[1].statusLabel).toBe("Dibalik")
    expect(panel.totalOutstanding).toBe(0)
    expect(panel.hasOutstandingLateFee).toBe(false)
  })

  it("label tarif verbatim dari basis tersimpan", () => {
    expect(lateFeeRateLabel(0.1, null)).toBe("0.1% per hari")
    expect(lateFeeRateLabel(null, 5_000)).toBe("Nominal tetap per hari")
    expect(lateFeeRateLabel(null, null)).toBe("—")
    const terms = buildCustomerLateFeeTerms([
      {
        id: 7,
        ratePercentPerDay: null,
        flatAmountPerDay: 5_000,
        capAmount: 100_000,
        effectiveFrom: new Date(2026, 0, 1),
        effectiveTo: null,
        notes: null,
      },
    ])
    expect(terms[0].rateLabel).toBe("Nominal tetap per hari")
  })

  it("indikator antrean: hanya posted/partial non-reversal bersaldo", () => {
    const byInvoice = buildLateFeeOutstandingByInvoice([
      { salesInvoiceId: 1, amount: 100_000, paidAmount: 40_000, status: "posted", reversesId: null },
      { salesInvoiceId: 1, amount: 50_000, paidAmount: 0, status: "partial", reversesId: null },
      { salesInvoiceId: 1, amount: 999_000, paidAmount: 0, status: "paid", reversesId: null },
      { salesInvoiceId: 2, amount: 999_000, paidAmount: 0, status: "reversed", reversesId: null },
      { salesInvoiceId: 2, amount: 999_000, paidAmount: 0, status: "posted", reversesId: 5 },
    ])
    expect(byInvoice.get(1)).toBe(110_000)
    expect(byInvoice.get(2)).toBeUndefined()
  })
})
