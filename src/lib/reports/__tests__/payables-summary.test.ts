import { describe, it, expect } from "vitest"
import { buildPayablesSummary, NO_DUE_DATE_BUCKET, type PayableBill } from "../payables-summary"

const asOf = new Date(2026, 2, 31) // 31 Mar 2026

function bill(overrides: Partial<PayableBill>): PayableBill {
  return {
    vendorId: 1,
    vendorName: "PT A",
    documentNo: "VB-000",
    dueDate: null,
    grandTotal: 0,
    paidAmount: 0,
    ...overrides,
  }
}

describe("buildPayablesSummary", () => {
  const bills: PayableBill[] = [
    // 80 days overdue → "61–90 Hari"
    bill({ vendorId: 1, vendorName: "PT A", documentNo: "VB-001", dueDate: new Date(2026, 0, 10), grandTotal: 1_000_000, paidAmount: 250_000 }),
    // not yet due → "Belum Jatuh Tempo"
    bill({ vendorId: 1, vendorName: "PT A", documentNo: "VB-002", dueDate: new Date(2026, 3, 15), grandTotal: 500_000 }),
    // no due date → "Tanpa Jatuh Tempo"
    bill({ vendorId: 2, vendorName: "PT B", documentNo: "VB-003", dueDate: null, grandTotal: 300_000 }),
    // fully paid → excluded from rows
    bill({ vendorId: 2, vendorName: "PT B", documentNo: "VB-004", dueDate: new Date(2026, 2, 1), grandTotal: 200_000, paidAmount: 200_000 }),
  ]

  it("computes outstanding as grandTotal - paidAmount", () => {
    const summary = buildPayablesSummary(bills, asOf)
    const first = summary.rows.find((r) => r.documentNo === "VB-001")
    expect(first?.outstanding).toBe(750_000)
  })

  it("drops fully paid bills from the rows", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.rows.map((r) => r.documentNo)).not.toContain("VB-004")
    expect(summary.billCount).toBe(3)
  })

  it("buckets no-due-date bills as 'Tanpa Jatuh Tempo' and still counts them", () => {
    const summary = buildPayablesSummary(bills, asOf)
    const noDue = summary.rows.find((r) => r.documentNo === "VB-003")
    expect(noDue?.overdueDays).toBeNull()
    expect(noDue?.ageBucket).toBe(NO_DUE_DATE_BUCKET)
    // Regression: the old aging report silently dropped these, understating the total.
    expect(summary.noDueDateOutstanding).toBe(300_000)
    expect(summary.totalOutstanding).toBe(1_550_000)
  })

  it("sums billed/paid over every bill but outstanding only over open ones", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.totalBilled).toBe(2_000_000)
    expect(summary.totalPaid).toBe(450_000)
    expect(summary.totalOutstanding).toBe(1_550_000)
  })

  it("splits overdue vs not-yet-due outstanding", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.overdueOutstanding).toBe(750_000)
    expect(summary.notYetDueOutstanding).toBe(500_000)
  })

  it("orders the aging buckets, no-due-date last", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.aging.map((a) => a.key)).toEqual([
      "Belum Jatuh Tempo",
      "1–30 Hari",
      "31–60 Hari",
      "61–90 Hari",
      "> 90 Hari",
      NO_DUE_DATE_BUCKET,
    ])
    const aged = summary.aging.find((a) => a.key === "61–90 Hari")
    expect(aged).toEqual({ key: "61–90 Hari", count: 1, total: 750_000 })
    const empty = summary.aging.find((a) => a.key === "31–60 Hari")
    expect(empty).toEqual({ key: "31–60 Hari", count: 0, total: 0 })
  })

  it("aggregates per vendor, ordered by outstanding desc", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.vendorCount).toBe(2)
    expect(summary.vendors[0]).toEqual({
      vendorId: 1,
      vendorName: "PT A",
      billCount: 2,
      totalBilled: 1_500_000,
      totalPaid: 250_000,
      outstanding: 1_250_000,
    })
    expect(summary.vendors[1]).toMatchObject({ vendorId: 2, billCount: 1, outstanding: 300_000 })
  })

  it("sorts rows by overdue days desc, missing due dates last", () => {
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.rows.map((r) => r.documentNo)).toEqual(["VB-001", "VB-002", "VB-003"])
  })

  it("keeps currency arithmetic free of float drift", () => {
    const summary = buildPayablesSummary(
      [bill({ documentNo: "VB-X", grandTotal: 10.3, paidAmount: 0.1 })],
      asOf,
    )
    expect(summary.rows[0].outstanding).toBe(10.2)
  })

  it("returns an empty summary for no bills", () => {
    const summary = buildPayablesSummary([], asOf)
    expect(summary.totalOutstanding).toBe(0)
    expect(summary.vendorCount).toBe(0)
    expect(summary.rows).toEqual([])
    expect(summary.aging).toHaveLength(6)
  })
})
