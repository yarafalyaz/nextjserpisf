import { describe, expect, it } from "vitest"

import {
  accumulateAccountSums,
  balanceTotals,
  type FinancialChartAccount,
} from "@/lib/reports/financial-charts-data"

const accounts: FinancialChartAccount[] = [
  { id: 1, code: "1100", name: "Kas", type: "ASSET", reportGroup: "BANK" },
  { id: 2, code: "2100", name: "Utang", type: "LIABILITY", reportGroup: "APAY" },
  { id: 3, code: "3100", name: "Modal", type: "EQUITY", reportGroup: null },
]

describe("financial-charts-data sen precision", () => {
  it("akumulasi kumulatif 17 bulan x 0,24 persis sen, bukan 4.080000000000002", () => {
    let cumulative = new Map<number, { debit: number; credit: number }>()
    for (let i = 0; i < 17; i++) {
      cumulative = accumulateAccountSums(
        cumulative,
        new Map([[1, { debit: 0.24, credit: 0 }]]),
      )
    }
    expect(cumulative.get(1)?.debit).toBe(4.08)
    expect(cumulative.get(1)?.credit).toBe(0)
  })

  it("total posisi 17 akun aset x 0,24 persis sen di balanceTotals", () => {
    const many: FinancialChartAccount[] = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      code: "1100",
      name: "Kas",
      type: "ASSET",
      reportGroup: "BANK",
    }))
    const sums = new Map(many.map((a) => [a.id, { debit: 0.24, credit: 0 }]))
    const totals = balanceTotals(many, sums)
    expect(totals.totalAssets).toBe(4.08)
    expect(totals.currentAssets).toBe(4.08)
  })

  it("pendapatan/biaya gabungan persis sen (0,24 + 0,24)", () => {
    // revenue = totalRevenue + totalOtherIncome; expense serupa.
    // Dibuktikan lewat balanceTotals tidak cukup — pakai accumulate untuk sisi kredit ekuitas.
    let cumulative = new Map<number, { debit: number; credit: number }>()
    cumulative = accumulateAccountSums(cumulative, new Map([[3, { debit: 0, credit: 0.24 }]]))
    cumulative = accumulateAccountSums(cumulative, new Map([[3, { debit: 0, credit: 0.24 }]]))
    const totals = balanceTotals(accounts, cumulative)
    expect(totals.totalEquity).toBe(0.48)
  })
})
