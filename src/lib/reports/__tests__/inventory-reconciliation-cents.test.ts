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

  it("selisih setengah rupiah tidak dilebihkan menjadi Rp 1", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 1, value: 100.3, byWarehouse: [] },
      ledger: { accountLabel: "1-1300 Persediaan", balance: 99.8 },
      periodEndIsToday: true,
    })

    const total = result.table.rows.find((row) => row.kind === "total")
    expect(total?.kind === "total" ? total.cells : []).toEqual(["(0,50)"])
    expect(result.verdict).toContain("0,50")
    expect(result.verdict).not.toContain("Rp 1")
  })
})
