import { describe, expect, it } from "vitest"

import { buildMinStockByWarehouse } from "@/lib/reports/min-stock"
import { effectiveMinStock } from "@/lib/reports/min-stock-effective"
import { MIN_STOCK_WAREHOUSE_NOTE, MIN_STOCK_OVERRIDE_LABEL } from "@/lib/reports/min-stock-data"

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

describe("F-070-S effectiveMinStock (BR-MS-02)", () => {
  it("override ada -> pakai override; tidak ada -> warisi global", () => {
    expect(effectiveMinStock(5, 2)).toEqual({ minStock: 2, source: "override" })
    expect(effectiveMinStock(5, null)).toEqual({ minStock: 5, source: "global" })
    expect(effectiveMinStock(5, undefined)).toEqual({ minStock: 5, source: "global" })
    expect(effectiveMinStock(5, 0)).toEqual({ minStock: 0, source: "override" })
    // PR #936/BR-ROP-01: baris lead-time minStock null -> warisi global,
    // label jujur "global"; 0 tetap override eksplisit (beda makna).
    expect(effectiveMinStock(10, null)).toEqual({ minStock: 10, source: "global" })
    expect(effectiveMinStock(10, 0)).toEqual({ minStock: 0, source: "override" })
  })
})

describe("F-070-S buildMinStockByWarehouse sumber efektif (AC-MS-1..3)", () => {
  it("AC-MS-1: global 5, override bengkel 2, stok bengkel 3 -> tidak menipis, sumber override", () => {
    const r = buildMinStockByWarehouse([
      row({ warehouseId: 1, warehouseName: "Gudang Pusat", qtyAtWarehouse: 100, minStock: 5, minStockSource: "global" }),
      row({ warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 3, minStock: 2, minStockSource: "override" }),
    ])
    expect(r).toEqual([])
  })

  it("AC-MS-1 falsifikasi: stok bengkel 1 di bawah override 2 -> menipis sumber override", () => {
    const r = buildMinStockByWarehouse([
      row({ warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 1, minStock: 2, minStockSource: "override" }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ minStock: 2, minStockSource: "override", shortage: 1 })
  })

  it("AC-MS-2: tanpa override keluaran identik lapis aman (sumber global)", () => {
    const r = buildMinStockByWarehouse([row({ qtyAtWarehouse: 0 })])
    expect(r).toHaveLength(1)
    expect(r[0].minStockSource).toBe("global")
    expect(MIN_STOCK_WAREHOUSE_NOTE).toContain("minimum masih global")
  })

  it("AC-MS-3 / BR-MS-03: builder tidak mengarang baris dari pasangan tanpa input lapisan", () => {
    // Loader hanya meneruskan pasangan berlapisan; builder kosong tetap kosong
    // walau override ada di tempat lain (diwakili tidak adanya baris input).
    expect(buildMinStockByWarehouse([])).toEqual([])
  })

  it("label override verbatim BR-MS-04", () => {
    expect(MIN_STOCK_OVERRIDE_LABEL).toBe("Minimum per gudang")
  })
})
