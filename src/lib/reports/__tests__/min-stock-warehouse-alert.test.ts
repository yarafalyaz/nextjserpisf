import { describe, expect, it } from "vitest"

import { findWarehouseLowStock } from "@/lib/reports/min-stock-warehouse-alert"

describe("F-070-S findWarehouseLowStock (AC-MS-4, BR-MS-05)", () => {
  const items = [{ id: 1, name: "Busi", minStock: 5 }]
  const pairs = [
    { itemId: 1, itemName: "Busi", warehouseId: 1, warehouseName: "Gudang Pusat", qtyAtWarehouse: 100 },
    { itemId: 1, itemName: "Busi", warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 3 },
  ]

  it("bengkel di bawah minimum efektif walau total global aman -> terbit per gudang", () => {
    // Tanpa override: bengkel 3 <= global 5 -> menipis walau pusat 100.
    expect(findWarehouseLowStock({ items, pairs, settings: [] })).toMatchObject([
      { warehouseName: "Gudang Bengkel", minStock: 5, minStockSource: "global" },
    ])
  })

  it("override bengkel 2: stok 3 aman; stok 1 menipis vs override", () => {
    const settings = [{ itemId: 1, warehouseId: 2, minStock: 2 }]
    expect(findWarehouseLowStock({ items, pairs, settings })).toEqual([])
    expect(
      findWarehouseLowStock({
        items,
        settings,
        pairs: pairs.map((p) => (p.warehouseId === 2 ? { ...p, qtyAtWarehouse: 1 } : p)),
      }),
    ).toMatchObject([{ warehouseName: "Gudang Bengkel", minStock: 2, minStockSource: "override" }])
  })

  it("pasangan tanpa lapisan tidak dinilai (BR-MS-03)", () => {
    expect(findWarehouseLowStock({ items, pairs: [], settings: [{ itemId: 1, warehouseId: 9, minStock: 10 }] })).toEqual([])
  })
})
