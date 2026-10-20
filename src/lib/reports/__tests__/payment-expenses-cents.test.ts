import { describe, expect, it } from "vitest"

import { buildPaymentExpenses, type PaymentExpenseInput } from "@/lib/reports/payment-expenses"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function expense(over: Partial<PaymentExpenseInput> = {}): PaymentExpenseInput {
  return { date: new Date("2026-10-05"), documentNo: "VP-0001", source: "Pembayaran Vendor", counterparty: "Vendor A", adminFee: 0.24, ...over }
}

describe("buildPaymentExpenses sen", () => {
  it("subtotal+total 17 x 0.24 sen persis, bukan 4.080000000000002", () => {
    const expenses = Array.from({ length: 17 }, (_, i) => expense({ documentNo: `VP-${i}` }))
    const result = buildPaymentExpenses({ expenses, start: period.start, end: period.end })
    expect(result.bySource[0].adminFee).toBe(4.08)
    expect(result.totals.adminFee).toBe(4.08)
  })
})
