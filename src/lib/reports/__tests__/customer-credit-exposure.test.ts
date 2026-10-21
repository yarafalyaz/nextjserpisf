import { describe, expect, it } from "vitest"

import { buildCustomerCreditExposure } from "@/lib/reports/customer-receivables"

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
