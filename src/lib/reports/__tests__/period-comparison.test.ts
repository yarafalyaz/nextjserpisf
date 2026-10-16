import { describe, it, expect } from "vitest"
import { buildComparison, previousWindow, toAccountBalances } from "../period-comparison"

const accounts = [
  { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE" },
  { id: 2, code: "5000", name: "HPP", type: "EXPENSE" },
  { id: 3, code: "1000", name: "Kas", type: "ASSET" },
]

describe("toAccountBalances", () => {
  it("uses the normal side per account type", () => {
    const sums = new Map([
      [1, { debit: 0, credit: 1000 }], // revenue → credit-normal → +1000
      [2, { debit: 400, credit: 0 }], // expense → debit-normal → +400
      [3, { debit: 700, credit: 200 }], // asset → debit-normal → +500
    ])
    const balances = toAccountBalances(accounts, sums)
    expect(balances.map((b) => b.balance)).toEqual([1000, 400, 500])
  })

  it("treats a missing sum as zero", () => {
    expect(toAccountBalances(accounts, new Map())[0].balance).toBe(0)
  })
})

describe("buildComparison", () => {
  const current = [
    { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE", balance: 1500 },
    { id: 2, code: "5000", name: "HPP", type: "EXPENSE", balance: 600 },
    { id: 3, code: "1000", name: "Kas", type: "ASSET", balance: 0 },
  ]
  const previous = [
    { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE", balance: 1000 },
    { id: 2, code: "5000", name: "HPP", type: "EXPENSE", balance: 600 },
    { id: 3, code: "1000", name: "Kas", type: "ASSET", balance: 0 },
  ]

  it("computes variance and percentage against the previous period", () => {
    const { rows } = buildComparison(current, previous)
    const revenue = rows.find((r) => r.code === "4000")
    expect(revenue).toMatchObject({ current: 1500, previous: 1000, variance: 500, percentage: 50 })
  })

  it("yields null percentage when the previous value is zero", () => {
    const { rows } = buildComparison(
      [{ id: 9, code: "6000", name: "Baru", type: "EXPENSE", balance: 300 }],
      [],
    )
    expect(rows[0]).toMatchObject({ current: 300, previous: 0, variance: 300, percentage: null })
  })

  it("drops accounts that are zero in both periods", () => {
    const { rows } = buildComparison(current, previous)
    expect(rows.map((r) => r.code)).toEqual(["4000", "5000"])
  })

  it("totals both periods and the variance", () => {
    const result = buildComparison(current, previous)
    expect(result.totalCurrent).toBe(2100)
    expect(result.totalPrevious).toBe(1600)
    expect(result.totalVariance).toBe(500)
  })
})

describe("previousWindow", () => {
  it("returns the same-length window immediately before the period", () => {
    const start = new Date(2026, 9, 1)
    const end = new Date(2026, 9, 31, 23, 59, 59)
    const previous = previousWindow(start, end)

    // Ends exactly before the current period starts, and is equally long.
    expect(previous.end.getTime()).toBe(start.getTime() - 1)
    expect(previous.end.getTime() - previous.start.getTime()).toBe(end.getTime() - start.getTime())
  })
})
