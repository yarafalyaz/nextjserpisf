import { describe, expect, it } from "vitest"

import {
  buildVendorPriceListing,
  lowestPriceByItem,
  vendorPriceSummary,
  type VendorPriceInput,
} from "@/lib/reports/vendor-prices"

function row(overrides: Partial<VendorPriceInput> = {}): VendorPriceInput {
  return {
    vendorName: "PT Sumber Jaya",
    itemKey: "1",
    itemLabel: "BS-001 — Busi Iridium",
    minQty: 1,
    price: 50_000,
    effectiveDate: null,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildVendorPriceListing>) {
  return result.table.rows
    .map((r) =>
      r.kind === "notice" ? r.text : r.kind === "group" ? r.label : r.kind === "total" ? `${r.label} ${r.cells.join(" | ")}` : r.cells.join(" | "),
    )
    .join("\n")
}

describe("lowestPriceByItem", () => {
  it("tidak menandai apa pun bila hanya ada satu penawaran (tak ada pembanding)", () => {
    const lowest = lowestPriceByItem([row({ itemKey: "1", price: 50_000 })])

    expect(lowest.size).toBe(0)
  })

  it("mengambil harga terendah bila ada beberapa penawaran", () => {
    const lowest = lowestPriceByItem([
      row({ itemKey: "1", price: 55_000 }),
      row({ itemKey: "1", price: 48_000 }),
      row({ itemKey: "1", price: 52_000 }),
    ])

    expect(lowest.get("1")).toBe(48_000)
  })

  it("memisahkan pembanding per barang", () => {
    const lowest = lowestPriceByItem([row({ itemKey: "1", price: 10 }), row({ itemKey: "1", price: 20 }), row({ itemKey: "2", price: 5 })])

    expect(lowest.get("1")).toBe(10)
    expect(lowest.has("2")).toBe(false)
  })
})

describe("buildVendorPriceListing", () => {
  it("menandai hanya penawaran termurah, dan hanya bila ada pembanding", () => {
    const result = buildVendorPriceListing([
      row({ vendorName: "A", itemKey: "1", price: 100 }),
      row({ vendorName: "B", itemKey: "1", price: 90 }),
      row({ vendorName: "C", itemKey: "2", price: 70 }),
    ])

    const marked = result.table.rows
      .filter((r) => r.kind === "data" && r.cells[5] === "✓")
      .map((r) => (r.kind === "data" ? r.cells[0] : ""))
    expect(marked).toEqual(["B"])
  })

  it("menyebut barang yang hanya punya satu penawaran tidak bisa dibandingkan", () => {
    const result = buildVendorPriceListing([row({ itemKey: "1", price: 100 })])

    expect(texts(result)).toContain("hanya punya satu penawaran")
  })

  it("menegaskan ini data rujukan, bukan harga yang mengikat transaksi", () => {
    const result = buildVendorPriceListing([row()])

    expect(texts(result)).toContain("data rujukan")
  })

  it("membedakan 'belum ada harga' dari daftar kosong", () => {
    const result = buildVendorPriceListing([])

    expect(result.verdict).toContain("Belum ada harga pemasok")
    expect(vendorPriceSummary(result)).toContain("Belum ada harga pemasok")
  })

  it("menghitung pemasok & barang unik dan barisnya", () => {
    const result = buildVendorPriceListing([
      row({ vendorName: "A", itemKey: "1" }),
      row({ vendorName: "A", itemKey: "2" }),
      row({ vendorName: "B", itemKey: "2" }),
    ])

    expect(result.totals).toEqual({ count: 3, vendors: 2, items: 2 })
  })
})
