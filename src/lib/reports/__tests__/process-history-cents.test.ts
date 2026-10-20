import { describe, expect, it } from "vitest"

import { sumInvoiceAmounts } from "@/lib/reports/sales-process-history-data"
import { sumBillAmounts } from "@/lib/reports/purchase-process-history-data"
import { sumExchangeAmounts } from "@/lib/reports/invoice-exchanges-data"
import { buildSalesProcessHistory } from "@/lib/reports/sales-process-history"
import { buildPurchaseProcessHistory } from "@/lib/reports/purchase-process-history"

const sen = (n: number) => Array.from({ length: n }, () => ({ grandTotal: 0.37, paidAmount: 0.13 }))

describe("process history presisi sen", () => {
  it("sales loader: 17x(0.37-0.13) = 4.08 persis, bukan 4.080000000000002", () => {
    const r = sumInvoiceAmounts(sen(17))
    expect(r.invoiced).toBe(6.29)
    expect(r.paid).toBe(2.21)
    expect(r.invoiced - r.paid).toBe(4.08)
  })

  it("purchase loader: 17x(0.37-0.13) = 4.08 persis", () => {
    const r = sumBillAmounts(sen(17))
    expect(r.billed).toBe(6.29)
    expect(r.paid).toBe(2.21)
    expect(r.billed - r.paid).toBe(4.08)
  })

  it("exchange loader: 17x(0.37-0.13) = 4.08 persis", () => {
    const r = sumExchangeAmounts(sen(17).map((i) => ({ salesInvoice: i })))
    expect(r.amount).toBe(6.29)
    expect(r.paid).toBe(2.21)
    expect(r.amount - r.paid).toBe(4.08)
  })

  it("builder sales: totals 17 baris sen persis + sisa lunas tidak ditandai unpaid", () => {
    const lines = Array.from({ length: 17 }, (_, i) => ({
      orderNo: `SO-${i}`,
      date: new Date("2026-10-05T00:00:00Z"),
      customerName: "Toko",
      status: "confirmed",
      deliveryCount: 1,
      invoiceCount: 1,
      invoiced: 0.37,
      paid: 0.13,
    }))
    const r = buildSalesProcessHistory(lines)
    expect(r.totals.invoiced).toBe(6.29)
    expect(r.totals.paid).toBe(2.21)
    expect(r.totals.outstanding).toBe(4.08)
  })

  it("builder purchase: totals 17 baris sen persis", () => {
    const lines = Array.from({ length: 17 }, (_, i) => ({
      orderNo: `PO-${i}`,
      date: new Date("2026-10-05T00:00:00Z"),
      vendorName: "Vendor",
      status: "confirmed",
      requestNo: null,
      receiptCount: 1,
      billCount: 1,
      billed: 0.37,
      paid: 0.13,
    }))
    const r = buildPurchaseProcessHistory(lines)
    expect(r.totals.billed).toBe(6.29)
    expect(r.totals.paid).toBe(2.21)
    expect(r.totals.outstanding).toBe(4.08)
  })
})
