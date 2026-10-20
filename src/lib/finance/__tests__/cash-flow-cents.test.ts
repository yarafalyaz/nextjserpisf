import { describe, expect, it } from "vitest"

import { buildCashFlowTotals } from "@/lib/finance/cash-flow"

const entry = (debit: number, credit: number, date = new Date("2026-10-05T00:00:00")) => ({ debit, credit, date })

describe("buildCashFlowTotals presisi sen", () => {
  it("akumulasi 17x0.24 per bulan/total persis sen, net dan saldo akhir konsisten", () => {
    const entries = Array.from({ length: 17 }, () => entry(0.24, 0))
    const result = buildCashFlowTotals(entries, 0)
    expect(result.months).toEqual([{ monthKey: "2026-10", inflow: 4.08, outflow: 0, net: 4.08 }])
    expect(result.totalInflow).toBe(4.08)
    expect(result.netCashFlow).toBe(4.08)
    expect(result.closingBalance).toBe(4.08)
  })

  it("outflow 0.335 dibulatkan ke sen per baris sebelum total", () => {
    const result = buildCashFlowTotals([entry(0, 0.335), entry(0, 0.335), entry(0, 0.335)], 0)
    expect(result.totalOutflow).toBe(1.02)
    expect(result.netCashFlow).toBe(-1.02)
    expect(result.months[0]?.net).toBe(-1.02)
  })

  it("saldo awal/akhir sen-aman dan bulan terurut", () => {
    const result = buildCashFlowTotals(
      [entry(0.1, 0, new Date("2026-11-02T00:00:00")), entry(0.1, 0), entry(0.1, 0)],
      0.07,
    )
    expect(result.months.map((m) => m.monthKey)).toEqual(["2026-10", "2026-11"])
    expect(result.totalInflow).toBe(0.3)
    expect(result.closingBalance).toBe(0.37)
  })
})
