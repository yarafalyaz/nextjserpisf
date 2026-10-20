import { describe, expect, it } from "vitest"

import { buildStockValuation, layerValue } from "@/lib/reports/stock-valuation"

const warehouses = new Map([[1, { name: "Gudang Utama", code: "GD1" }]])

function layer(i: number) {
  return {
    itemId: 1,
    warehouseId: 1,
    remaining: 1,
    unitCost: 0.24,
    item: {
      sku: "BRG-1",
      name: "Busi",
      unitOfMeasure: "PCS",
      cost: 0.24,
      costingMethod: "fifo",
      category: { name: "Sparepart", costingMethod: null },
    },
    _i: i,
  }
}

describe("stock-valuation presisi sen", () => {
  it("nilai 17 lapisan x 0.24 persis 4.08 (layerValue + agregat + total)", () => {
    expect(layerValue({ remaining: 1, unitCost: 0.24, item: { cost: 0.24 } }, "fifo")).toBe(0.24)
    const layers = Array.from({ length: 17 }, (_, i) => layer(i))
    const r = buildStockValuation(layers as never, (id) => warehouses.get(id ?? 0))
    expect(r.rows[0].value).toBe(4.08)
    expect(r.totals.value).toBe(4.08)
    expect(r.byWarehouse[0].value).toBe(4.08)
  })

  it("metode average: 17 lapisan x cost 0.24 persis 4.08", () => {
    const layers = Array.from({ length: 17 }, (_, i) => ({
      ...layer(i),
      unitCost: 999,
      item: { sku: "BRG-1", name: "Busi", unitOfMeasure: "PCS", cost: 0.24, costingMethod: "average", category: { name: "Sparepart", costingMethod: null } },
    }))
    const r = buildStockValuation(layers as never, (id) => warehouses.get(id ?? 0))
    expect(r.rows[0].value).toBe(4.08)
    expect(r.totals.value).toBe(4.08)
  })
})
