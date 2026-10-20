import { describe, expect, it } from "vitest"

import { buildProfitability } from "@/lib/reports/profitability"

function line(key: string, revenue: number, cogs: number, extra: Partial<{ revenueLinesWithoutCogs: number; serviceLinesWithoutCogs: number; stockRevenueWithoutCogs: number }> = {}) {
  return {
    key,
    label: key,
    revenue,
    cogs,
    revenueLinesWithoutCogs: extra.revenueLinesWithoutCogs ?? 0,
    serviceLinesWithoutCogs: extra.serviceLinesWithoutCogs ?? 0,
    ...(extra.stockRevenueWithoutCogs !== undefined ? { stockRevenueWithoutCogs: extra.stockRevenueWithoutCogs } : {}),
  }
}

describe("profitability sen precision", () => {
  it("total pendapatan/HPP/laba kotor persis sen untuk 17 baris pecahan", () => {
    const lines = Array.from({ length: 17 }, (_, i) => line(`L${i}`, 0.24, 0.13))
    const result = buildProfitability({ lines, dimension: "faktur" })
    // 17*0.24=4.08, 17*0.13=2.21, laba 1.87 persis; float mentah 4.080000000000002 / 1.8700000000000028
    expect(result.totals.revenue).toBe(4.08)
    expect(result.totals.cogs).toBe(2.21)
    expect(result.totals.grossProfit).toBe(1.87)
  })

  it("revenueMissingCogs persis sen untuk baris stok tanpa HPP berulang", () => {
    const lines = Array.from({ length: 17 }, (_, i) =>
      line(`S${i}`, 0.24, 0, { revenueLinesWithoutCogs: 1, serviceLinesWithoutCogs: 0, stockRevenueWithoutCogs: 0.24 }),
    )
    const result = buildProfitability({ lines, dimension: "barang" })
    expect(result.totals.revenueMissingCogs).toBe(4.08)
    expect(result.totals.missingCogsLines).toBe(17)
  })
})
