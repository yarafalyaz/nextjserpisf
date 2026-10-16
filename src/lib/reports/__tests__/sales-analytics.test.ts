import { describe, it, expect } from "vitest"
import { aggregateSales, monthlySales, type SalesLine } from "../sales-analytics"

function line(overrides: Partial<SalesLine>): SalesLine {
  return {
    itemKey: "1",
    itemLabel: "BRG-01 — Baut",
    brandName: "Bosch",
    customerId: 1,
    customerName: "CV Sumber Makmur",
    qty: 1,
    revenue: 100,
    ...overrides,
  }
}

describe("aggregateSales", () => {
  const lines: SalesLine[] = [
    line({ itemKey: "1", itemLabel: "BRG-01 — Baut", revenue: 300, qty: 3 }),
    line({ itemKey: "1", itemLabel: "BRG-01 — Baut", revenue: 200, qty: 2 }),
    line({ itemKey: "2", itemLabel: "BRG-02 — Mur", brandName: "NSK", revenue: 500, qty: 5 }),
    line({ itemKey: null, itemLabel: "(tanpa barang)", brandName: null, customerId: 2, customerName: "PT Lain", revenue: 100, qty: 1 }),
  ]

  it("groups by barang and sums qty + revenue", () => {
    const rows = aggregateSales(lines, "barang")
    const baut = rows.find((r) => r.label === "BRG-01 — Baut")
    expect(baut).toMatchObject({ qty: 5, revenue: 500, lineCount: 2 })
  })

  it("sorts by revenue descending", () => {
    const rows = aggregateSales(lines, "barang")
    expect(rows.map((r) => r.revenue)).toEqual([500, 500, 100])
  })

  it("groups by pelanggan", () => {
    const rows = aggregateSales(lines, "pelanggan")
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.label === "CV Sumber Makmur")).toMatchObject({ revenue: 1000, lineCount: 3 })
  })

  it("groups by merek and buckets missing brands", () => {
    const rows = aggregateSales(lines, "merek")
    expect(rows.find((r) => r.label === "Bosch")).toMatchObject({ revenue: 500 })
    expect(rows.find((r) => r.label === "NSK")).toMatchObject({ revenue: 500 })
    expect(rows.find((r) => r.label === "(tanpa merek)")).toMatchObject({ revenue: 100 })
  })

  it("labels a line without an item as '(tanpa barang)'", () => {
    const rows = aggregateSales([line({ itemKey: null, revenue: 42 })], "barang")
    expect(rows[0]).toMatchObject({ label: "(tanpa barang)", revenue: 42 })
  })

  it("returns nothing for no lines", () => {
    expect(aggregateSales([], "barang")).toEqual([])
  })
})

describe("monthlySales", () => {
  it("buckets by month and labels in Indonesian", () => {
    const rows = monthlySales([
      { date: new Date(2026, 8, 5), grandTotal: 1000 },
      { date: new Date(2026, 8, 20), grandTotal: 500 },
      { date: new Date(2026, 9, 2), grandTotal: 2000 },
    ])
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-10"])
    expect(rows[0]).toMatchObject({ label: "September 2026", revenue: 1500, invoiceCount: 2 })
    expect(rows[1]).toMatchObject({ label: "Oktober 2026", revenue: 2000, invoiceCount: 1 })
  })

  it("is empty without invoices", () => {
    expect(monthlySales([])).toEqual([])
  })
})
