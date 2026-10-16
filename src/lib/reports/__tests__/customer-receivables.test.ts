import { describe, it, expect } from "vitest"
import { averagePaymentDays, buildCustomerReceivables } from "../customer-receivables"

describe("buildCustomerReceivables", () => {
  it("computes remaining credit and utilisation", () => {
    const rows = buildCustomerReceivables([
      { customerId: 1, customerName: "CV A", creditLimit: 1000, outstanding: 250, overdue: 0, invoiceCount: 2 },
    ])
    expect(rows[0]).toMatchObject({ remainingCredit: 750, utilization: 25 })
  })

  it("leaves utilisation null when no credit limit is set", () => {
    const rows = buildCustomerReceivables([
      { customerId: 2, customerName: "CV B", creditLimit: 0, outstanding: 500, overdue: 0, invoiceCount: 1 },
    ])
    expect(rows[0].utilization).toBeNull()
  })

  it("sorts by outstanding descending", () => {
    const rows = buildCustomerReceivables([
      { customerId: 1, customerName: "Kecil", creditLimit: 0, outstanding: 100, overdue: 0, invoiceCount: 1 },
      { customerId: 2, customerName: "Besar", creditLimit: 0, outstanding: 900, overdue: 0, invoiceCount: 1 },
    ])
    expect(rows.map((r) => r.customerName)).toEqual(["Besar", "Kecil"])
  })
})

describe("averagePaymentDays", () => {
  it("returns the amount-weighted average delay", () => {
    const days = averagePaymentDays([
      { invoiceDate: new Date(2026, 9, 1), paymentDate: new Date(2026, 9, 11), amount: 900 }, // 10 days
      { invoiceDate: new Date(2026, 9, 1), paymentDate: new Date(2026, 9, 31), amount: 100 }, // 30 days
    ])
    // (10×900 + 30×100) / 1000 = 12
    expect(days).toBe(12)
  })

  it("never reports a negative delay", () => {
    const days = averagePaymentDays([
      { invoiceDate: new Date(2026, 9, 10), paymentDate: new Date(2026, 9, 5), amount: 100 },
    ])
    expect(days).toBe(0)
  })

  it("returns null without payments", () => {
    expect(averagePaymentDays([])).toBeNull()
  })
})
