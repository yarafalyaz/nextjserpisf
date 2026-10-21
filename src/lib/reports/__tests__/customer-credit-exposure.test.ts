import { describe, expect, it } from "vitest"

import {
  buildCustomerCreditExposure,
  effectiveConfirmedDownPaymentByCustomer,
  openCustomerCreditByCustomer,
  woUnrepresentedByCustomer,
} from "@/lib/reports/customer-receivables"

const base = (over: Partial<Parameters<typeof buildCustomerCreditExposure>[0][number]> = {}) => ({
  customerId: 1,
  customerName: "PT Fleet",
  creditLimit: 100,
  outstanding: 60,
  overdue: 0,
  invoiceCount: 1,
  openOrderAmount: 0,
  ...over,
})

describe("F-017 buildCustomerCreditExposure", () => {
  it("piutang saja aman, tambah SO terbuka melewati limit -> over", () => {
    const [row] = buildCustomerCreditExposure([base({ openOrderAmount: 50 })])
    expect(row).toMatchObject({ exposure: 110, remainingCredit: -10, utilization: 110, status: "over" })
  })

  it("limit 0 = unset, bukan tanpa limit maupun over", () => {
    const [row] = buildCustomerCreditExposure([base({ creditLimit: 0, outstanding: 500, openOrderAmount: 500 })])
    expect(row).toMatchObject({ utilization: null, status: "unset", exposure: 1000 })
  })

  it("80% = warning, di bawahnya ok", () => {
    expect(buildCustomerCreditExposure([base({ outstanding: 85 })])[0].status).toBe("warning")
    expect(buildCustomerCreditExposure([base({ outstanding: 50 })])[0].status).toBe("ok")
  })

  it("DP confirmed mengurangi paparan: 60+50-60=50 -> ok", () => {
    const [row] = buildCustomerCreditExposure([base({ openOrderAmount: 50, confirmedDownPayment: 60 })])
    expect(row).toMatchObject({ exposure: 50, remainingCredit: 50, utilization: 50, status: "ok" })
  })

  it("DP melebihi paparan dijepit 0, bukan negatif", () => {
    const [row] = buildCustomerCreditExposure([base({ outstanding: 10, confirmedDownPayment: 500 })])
    expect(row).toMatchObject({ exposure: 0, utilization: 0, status: "ok" })
  })
})

describe("F-017-S AC-CR (vonis BOT 4 F-2026-10-22-044-V)", () => {
  it("AC-CR-01: grossExposure K1+K2 sebelum pengurang", () => {
    const [row] = buildCustomerCreditExposure([base({ openOrderAmount: 50 })])
    expect(row).toMatchObject({ grossExposure: 110, exposure: 110, status: "over" })
  })

  it("AC-CR-07: K5 masuk kasar, WO-only K1=0 tetap terwakili", () => {
    const [row] = buildCustomerCreditExposure([base({ outstanding: 0, invoiceCount: 0, woUnrepresented: 80 })])
    expect(row).toMatchObject({ grossExposure: 80, exposure: 80, status: "warning" })
  })

  it("AC-CR-10: K4 mengurangi bersih, tampil terpisah", () => {
    const [row] = buildCustomerCreditExposure([base({ openCustomerCredit: 25 })])
    expect(row).toMatchObject({ grossExposure: 60, exposure: 35, openCustomerCredit: 25 })
  })

  it("AC-CR-14: tepat 80 warning, tepat 100 over, 79.99 ok", () => {
    expect(buildCustomerCreditExposure([base({ outstanding: 80 })])[0].status).toBe("warning")
    expect(buildCustomerCreditExposure([base({ outstanding: 100 })])[0].status).toBe("over")
    expect(buildCustomerCreditExposure([base({ outstanding: 79.99 })])[0].status).toBe("ok")
  })

  it("K3(b): DP quotation terkonversi gugur, pra-invoice tetap", () => {
    const byCustomer = effectiveConfirmedDownPaymentByCustomer(
      [
        { customerId: 1, quotationId: 10, amount: 60 },
        { customerId: 1, quotationId: 11, amount: 40 },
        { customerId: 2, quotationId: 11, amount: 5 },
      ],
      new Set([10]),
    )
    expect(byCustomer.get(1)).toBe(40)
    expect(byCustomer.get(2)).toBe(5)
  })

  it("AC-CR-10 helper: saldo open per baris max(0, received-allocated-refunded)", () => {
    const byCustomer = openCustomerCreditByCustomer([
      { customerId: 1, receivedAmount: 50, allocatedAmount: 20, refundedAmount: 5 },
      { customerId: 1, receivedAmount: 10, allocatedAmount: 20, refundedAmount: 0 },
    ])
    expect(byCustomer.get(1)).toBe(25)
  })

  it("AC-CR-07/08/09 anti-ganda: K5 per quotation, SO membatalkan, null berbendera", () => {
    const { byCustomer, withoutQuotationByCustomer } = woUnrepresentedByCustomer({
      workOrders: [
        { customerId: 1, quotationId: 10 },
        { customerId: 1, quotationId: 10 },
        { customerId: 1, quotationId: 11 },
        { customerId: 1, quotationId: null },
        { customerId: 1, quotationId: 12 },
      ],
      quotations: [
        { id: 10, customerId: 1, grandTotal: 80 },
        { id: 11, customerId: 1, grandTotal: 100 },
        { id: 12, customerId: 1, grandTotal: 90 },
      ],
      salesOrders: [{ quotationId: 11, grandTotal: 100 }],
      invoices: [{ quotationId: 12, grandTotal: 30 }],
    })
    expect(byCustomer.get(1)).toBe(140)
    expect(withoutQuotationByCustomer.get(1)).toBe(1)
  })

  it("K5 nol bila invoice recognised menutup quotation", () => {
    const { byCustomer } = woUnrepresentedByCustomer({
      workOrders: [{ customerId: 1, quotationId: 10 }],
      quotations: [{ id: 10, customerId: 1, grandTotal: 80 }],
      salesOrders: [],
      invoices: [{ quotationId: 10, grandTotal: 80 }],
    })
    expect(byCustomer.size).toBe(0)
  })
})
