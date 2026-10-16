import { describe, expect, it } from "vitest"

import { buildStockValuation, layerValue, resolveCostingMethod } from "@/lib/reports/stock-valuation"

const warehouses = new Map([
  [1, { name: "Gudang Utama", code: "GD1" }],
])

function layer(overrides: Partial<Parameters<typeof buildStockValuation>[0][number]> = {}) {
  return {
    itemId: 1,
    warehouseId: 1,
    remaining: 10,
    unitCost: 1000,
    item: {
      sku: "BRG-1",
      name: "Busi",
      unitOfMeasure: "PCS",
      cost: 1500,
      costingMethod: "fifo",
      category: { name: "Sparepart", costingMethod: null },
    },
    ...overrides,
  }
}

describe("resolveCostingMethod", () => {
  it("kategori menang atas barang, dan bawaannya fifo", () => {
    expect(resolveCostingMethod({ costingMethod: "fifo", category: { costingMethod: "average" } })).toBe("average")
    expect(resolveCostingMethod({ costingMethod: "average", category: null })).toBe("average")
    expect(resolveCostingMethod({ costingMethod: null, category: null })).toBe("fifo")
  })
})

describe("layerValue", () => {
  it("barang average dinilai dari harga pokok barang, bukan harga lapisan", () => {
    const input = { remaining: 10, unitCost: 1000, item: { cost: 1500 } }

    expect(layerValue(input, "average")).toBe(15_000)
    expect(layerValue(input, "fifo")).toBe(10_000)
  })
})

describe("buildStockValuation", () => {
  it("menjumlahkan lapisan per barang+gudang dan memberi total", () => {
    const result = buildStockValuation(
      [layer({ remaining: 4 }), layer({ remaining: 6, unitCost: 2000 })],
      (id) => warehouses.get(id ?? 0),
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].qty).toBe(10)
    expect(result.rows[0].value).toBe(4 * 1000 + 6 * 2000)
    expect(result.totals.value).toBe(result.rows[0].value)
    expect(result.rows[0].warehouse).toBe("Gudang Utama")
    expect(result.rows[0].warehouseCode).toBe("GD1")
  })

  it("memisahkan baris per gudang dan meringkas per gudang", () => {
    const result = buildStockValuation(
      [layer(), layer({ warehouseId: null, remaining: 2 })],
      (id) => warehouses.get(id ?? 0),
    )

    expect(result.rows).toHaveLength(2)
    expect(result.byWarehouse.map((w) => w.code)).toEqual(["-", "GD1"])
    expect(result.totals.qty).toBe(12)
  })

  it("menandai metode pada baris dan menangani kategori kosong", () => {
    const result = buildStockValuation(
      [layer({ item: { ...layer().item, category: null, costingMethod: "average" } })],
      () => undefined,
    )

    expect(result.rows[0].costingMethod).toBe("AVERAGE")
    expect(result.rows[0].category).toBe("-")
    expect(result.rows[0].uom).toBe("PCS")
  })

  it("daftar lapisan kosong menghasilkan nol, bukan galat", () => {
    const result = buildStockValuation([], () => undefined)

    expect(result.rows).toEqual([])
    expect(result.totals).toEqual({ qty: 0, value: 0 })
    expect(result.byWarehouse).toEqual([])
  })
})
