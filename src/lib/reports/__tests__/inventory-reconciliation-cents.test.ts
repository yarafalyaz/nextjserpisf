import { describe, expect, it } from "vitest"

import { buildInventoryReconciliation } from "@/lib/reports/inventory-reconciliation"

describe("buildInventoryReconciliation presisi sen", () => {
  it("selisih buku besar - nilai barang tepat sen, bukan float mentah", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 1, value: 100.07, byWarehouse: [] },
      ledger: { accountLabel: "1-1300 Persediaan", balance: 100.10 },
      periodEndIsToday: true,
    })
    expect(result.totals.difference).toBe(0.03)
    expect(result.totals.valuationValue).toBe(100.07)
    expect(result.totals.ledgerBalance).toBe(100.10)
  })

  it("selisih negatif tepat sen", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 1, value: 100.10, byWarehouse: [] },
      ledger: { accountLabel: "1-1300 Persediaan", balance: 100.07 },
      periodEndIsToday: true,
    })
    expect(result.totals.difference).toBe(-0.03)
  })
})
