import { describe, expect, it } from "vitest"

import { priceSourceLabel } from "../price-source"

describe("priceSourceLabel (BR-TIER-09)", () => {
  it("tingkat: label dengan ambang minQty utuh", () => {
    expect(priceSourceLabel("price_list_tier", 10)).toBe("Harga tingkat >= 10 — Daftar Harga")
  })

  it("tingkat: minQty desimal diformat Indonesia maksimal 2 desimal", () => {
    expect(priceSourceLabel("price_list_tier", 2.5)).toBe("Harga tingkat >= 2,50 — Daftar Harga")
    expect(priceSourceLabel("price_list_tier", 1000)).toBe("Harga tingkat >= 1.000 — Daftar Harga")
  })

  it("tingkat tanpa minQty: tanpa klaim (null)", () => {
    expect(priceSourceLabel("price_list_tier", null)).toBeNull()
    expect(priceSourceLabel("price_list_tier", undefined)).toBeNull()
  })

  it("dasar dan master", () => {
    expect(priceSourceLabel("price_list_base", 1)).toBe("Harga daftar")
    expect(priceSourceLabel("item_master", null)).toBe("Harga master")
  })

  it("null / tak dikenal: tanpa label historis", () => {
    expect(priceSourceLabel(null)).toBeNull()
    expect(priceSourceLabel(undefined)).toBeNull()
    expect(priceSourceLabel("manual_discount")).toBeNull()
    expect(priceSourceLabel("")).toBeNull()
  })
})
