import { describe, expect, it } from "vitest"

import { buildMinStock } from "@/lib/reports/min-stock"

function item(sku: string, overrides: Partial<Parameters<typeof buildMinStock>[0][number]> = {}) {
  return {
    sku,
    name: "Busi",
    unit: "PCS",
    categoryName: "Sparepart",
    warehouseName: "Gudang Utama",
    vendorName: "CV Sumber",
    qtyOnHand: 0,
    minStock: 17,
    cost: 0.24,
    ...overrides,
  }
}

describe("buildMinStock presisi sen", () => {
  it("nilai kekurangan 17x0.24 persis 4.08 bukan 4.080000000000002", () => {
    const result = buildMinStock([item("A")])
    expect(result.totals.shortageValue).toBe(4.08)
  })

  it("akumulasi 17 baris sen persis ditambah baris 3x0.335", () => {
    const rows = Array.from({ length: 17 }, (_, i) => item(`S${i}`))
    rows.push(item("B", { minStock: 3, qtyOnHand: 0, cost: 0.335 }))
    const result = buildMinStock(rows)
    expect(result.totals.shortageValue).toBe(70.37)
  })
})
