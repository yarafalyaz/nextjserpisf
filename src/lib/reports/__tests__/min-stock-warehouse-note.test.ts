import { describe, expect, it } from "vitest"

import { MIN_STOCK_WAREHOUSE_NOTE } from "@/lib/reports/min-stock-data"

describe("F-013 warehouseNote", () => {
  it("verbatim menyatakan minimum masih global, bukan per gudang", () => {
    expect(MIN_STOCK_WAREHOUSE_NOTE).toContain("minimum masih global")
    expect(MIN_STOCK_WAREHOUSE_NOTE).toContain("minimum per gudang belum diatur")
    expect(MIN_STOCK_WAREHOUSE_NOTE).not.toContain("minimum per gudang sudah")
  })
})
