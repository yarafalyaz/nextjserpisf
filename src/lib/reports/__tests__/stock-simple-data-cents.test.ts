import { describe, expect, it } from "vitest"

import {
  aggregateLayersByItem,
  aggregateLayersByWarehouse,
  sumRemainingQty,
} from "@/lib/reports/stock-simple-data"

const layer = (over: Record<string, unknown> = {}) => ({
  itemId: 9,
  warehouseId: 1,
  remaining: 1,
  unitCost: 0.24,
  ...over,
})

describe("stock-simple-data sen precision", () => {
  it("nilai 17 lapisan x 0,24 per gudang persis 4,08", () => {
    const byWarehouse = aggregateLayersByWarehouse(
      Array.from({ length: 17 }, () => layer()),
    )
    const entry = byWarehouse.get(1)
    expect(entry?.qty).toBe(17)
    expect(entry?.value).toBe(4.08)
    expect(entry?.items.size).toBe(1)
  })

  it("nilai 17 lapisan x 0,24 per barang persis 4,08", () => {
    const byItem = aggregateLayersByItem(Array.from({ length: 17 }, () => layer()))
    expect(byItem.get(9)?.layerQty).toBe(17)
    expect(byItem.get(9)?.layerValue).toBe(4.08)
  })

  it("nilai lapisan qty x cost pecahan sen dibulatkan per lapisan (3 x 0,335)", () => {
    const byItem = aggregateLayersByItem([
      layer({ remaining: 3, unitCost: 0.335 }),
    ])
    expect(byItem.get(9)?.layerValue).toBe(1.01)
  })

  it("lapisan tanpa gudang teragregasi di kunci 0", () => {
    const byWarehouse = aggregateLayersByWarehouse([
      layer({ warehouseId: null }),
    ])
    expect(byWarehouse.get(0)?.value).toBe(0.24)
  })

  it("total kuantitas persis 2 desimal (17 x 0,1)", () => {
    expect(
      sumRemainingQty(Array.from({ length: 17 }, () => ({ remaining: 0.1 }))),
    ).toBe(1.7)
  })
})
