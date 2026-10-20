import { describe, expect, it } from "vitest"

import { buildStockCount, type StockCountItemInput } from "@/lib/reports/stock-count"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function item(over: Partial<StockCountItemInput> = {}): StockCountItemInput {
  return { sku: "SKU-01", name: "Busi", systemQty: 10, actualQty: 8, unit: "PCS", unitCost: 0.24, ...over }
}

describe("buildStockCount sen", () => {
  it("nilai selisih 17 baris x -2 x 0.24 sen persis, bukan -8.160000000000004", () => {
    const items = Array.from({ length: 17 }, (_, i) => item({ sku: `SKU-${i}` }))
    const result = buildStockCount({
      documents: [{ documentNo: "SA-0001", date: new Date("2026-10-05"), warehouseName: "GU", status: "approved", items }],
      start: period.start,
      end: period.end,
    })
    expect(result.totals.differenceValue).toBe(-8.16)
    const totals = result.table.rows.filter((r) => r.kind === "total")
    expect(totals[totals.length - 1].cells?.[5]).toBe("(8)")
  })
})
