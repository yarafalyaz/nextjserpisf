import { describe, expect, it } from "vitest"

import { buildMinStockByWarehouse } from "@/lib/reports/min-stock"

const row = (over: Partial<Parameters<typeof buildMinStockByWarehouse>[0][number]> = {}) => ({
  itemId: 1,
  sku: "BRG-1",
  name: "Busi",
  warehouseId: 1,
  warehouseName: "Gudang Pusat",
  qtyAtWarehouse: 5,
  minStock: 10,
  cost: 1000,
  ...over,
})

describe("F-013 buildMinStockByWarehouse", () => {
  it("global cukup tetapi gudang bengkel kosong -> baris shortage per gudang", () => {
    const r = buildMinStockByWarehouse([
      row({ warehouseId: 1, warehouseName: "Gudang Pusat", qtyAtWarehouse: 20 }),
      row({ warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 0 }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ warehouseName: "Gudang Bengkel", shortage: 10, shortageValue: 10_000 })
  })

  it("minimum 0 atau stok gudang di atas minimum -> tidak dinilai", () => {
    expect(buildMinStockByWarehouse([row({ minStock: 0, qtyAtWarehouse: 0 })])).toEqual([])
    expect(buildMinStockByWarehouse([row({ qtyAtWarehouse: 11 })])).toEqual([])
  })

  it("urut kekurangan bernilai terbesar dulu", () => {
    const r = buildMinStockByWarehouse([
      row({ sku: "A", qtyAtWarehouse: 9, cost: 100 }),
      row({ sku: "B", qtyAtWarehouse: 0, cost: 100 }),
    ])
    expect(r.map((l) => l.sku)).toEqual(["B", "A"])
  })
})
