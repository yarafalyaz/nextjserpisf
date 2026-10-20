import { describe, expect, it } from "vitest"

import { buildCashFlowTotals } from "../arus-kas"

const oct = (day: number) => new Date(2026, 9, day)
const nov = (day: number) => new Date(2026, 10, day)
const noActivity = { operating: 0, investing: 0, financing: 0 }

describe("buildCashFlowTotals sen", () => {
  it("akumulasi penerimaan 17 x 0.24 persis 4.08, bukan 4.080000000000002", () => {
    const entries = Array.from({ length: 17 }, () => ({ date: oct(5), debit: 0.24, credit: 0 }))
    const result = buildCashFlowTotals({ entries, priorBalances: [], activities: noActivity })
    expect(result.totalInflow).toBe(4.08)
    expect(result.netCashFlow).toBe(4.08)
    expect(result.monthly).toEqual([{ month: "2026-10", inflow: 4.08, outflow: 0, net: 4.08 }])
    expect(result.closingBalance).toBe(4.08)
  })

  it("bucket per bulan terpisah, arus bersih per bulan dan total sen persis", () => {
    const entries = [
      { date: oct(3), debit: 0.37, credit: 0.13 },
      { date: oct(20), debit: 0.37, credit: 0.13 },
      { date: nov(2), debit: 0, credit: 0.24 },
      { date: nov(9), debit: 0, credit: 0.24 },
    ]
    const result = buildCashFlowTotals({ entries, priorBalances: [], activities: noActivity })
    expect(result.monthly).toEqual([
      { month: "2026-10", inflow: 0.74, outflow: 0.26, net: 0.48 },
      { month: "2026-11", inflow: 0, outflow: 0.48, net: -0.48 },
    ])
    expect(result.totalInflow).toBe(0.74)
    expect(result.totalOutflow).toBe(0.74)
    expect(result.netCashFlow).toBe(0)
  })

  it("saldo awal dari selisih debit-kredit pra-periode sen persis, saldo akhir = awal + bersih", () => {
    const result = buildCashFlowTotals({
      entries: [{ date: oct(5), debit: 0.24, credit: 0 }],
      priorBalances: [
        { debit: 100.1, credit: 100.07 },
        { debit: 0.24, credit: 0 },
      ],
      activities: noActivity,
    })
    expect(result.openingBalance).toBe(0.27)
    expect(result.closingBalance).toBe(0.51)
  })

  it("neto aktivitas operasi+investasi+pendanaan sen persis (0.1+0.2 bukan 0.30000000000000004)", () => {
    const result = buildCashFlowTotals({
      entries: [],
      priorBalances: [],
      activities: { operating: 0.1, investing: 0.2, financing: 0 },
    })
    expect(result.activityNet).toBe(0.3)
    expect(result.monthly).toEqual([])
    expect(result.netCashFlow).toBe(0)
  })
})
