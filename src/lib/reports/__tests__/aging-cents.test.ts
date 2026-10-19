import { describe, expect, it } from "vitest"

import { buildAgingTotals, payableOutstanding, receivableOutstanding, sumMoney } from "../aging-amounts"

describe("aging-amounts safe-math", () => {
  it("sisa piutang presisi sen", () => {
    expect(receivableOutstanding(10_000_000.1, 0.1)).toBe(10_000_000)
    expect(receivableOutstanding("10000000.10", "0.10")).toBe(10_000_000)
  })

  it("sisa utang neto withholding presisi sen", () => {
    expect(payableOutstanding(10_000_000.1, 0.1, 0)).toBe(10_000_000)
    expect(payableOutstanding(10_000_000.1, null, 10_000_000.1)).toBe(0)
  })

  it("3x 10.000.000,10 = 30000000.3 persis, bukan drift float", () => {
    expect(sumMoney([10_000_000.1, 10_000_000.1, 10_000_000.1])).toBe(30_000_000.3)
  })

  it("total bucket + grand total presisi sen", () => {
    const items = [0, 1, 2].map((i) => ({
      party: `P${i}`,
      documentNo: `DOC-${i}`,
      dueDate: new Date(2026, 0, 1),
      outstanding: receivableOutstanding(10_000_000.1, 0),
    }))
    const totals = buildAgingTotals(items, () => "1–30 Hari", ["Belum Jatuh Tempo", "1–30 Hari"])
    expect(totals.buckets).toEqual([
      { key: "Belum Jatuh Tempo", count: 0, total: 0 },
      { key: "1–30 Hari", count: 3, total: 30_000_000.3 },
    ])
    expect(totals.grandTotal).toBe(30_000_000.3)
  })
})
