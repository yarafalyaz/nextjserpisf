import { describe, it, expect } from "vitest"

import { entityEditHref, entityHref, isNumericId } from "../entity-url"

/**
 * Seluruh tautan entitas di aplikasi lewat sini (lihat tes ini kalau ada URL
 * yang tiba-tiba memakai id angka). Kontraknya: slug menang, dan baris yang
 * belum punya slug tetap bisa dibuka lewat id numeric.
 */
describe("entityHref", () => {
  it("memakai slug saat tersedia", () => {
    expect(entityHref("/master/barang", { id: 7, slug: "busi-iridium" })).toBe("/master/barang/busi-iridium")
  })

  it("jatuh ke id saat slug null atau kosong", () => {
    expect(entityHref("/master/barang", { id: 7, slug: null })).toBe("/master/barang/7")
    expect(entityHref("/master/barang", { id: 7, slug: "" })).toBe("/master/barang/7")
    expect(entityHref("/master/barang", { id: 7 })).toBe("/master/barang/7")
  })

  it("tidak menggandakan garis miring", () => {
    expect(entityHref("/laporan/pajak", { id: 1, slug: "2026-10" })).toBe("/laporan/pajak/2026-10")
  })
})

describe("entityEditHref", () => {
  it("menambahkan /ubah di belakang tautan entitas", () => {
    expect(entityEditHref("/master/barang", { id: 7, slug: "busi" })).toBe("/master/barang/busi/ubah")
    expect(entityEditHref("/master/barang", { id: 7, slug: null })).toBe("/master/barang/7/ubah")
  })
})

describe("isNumericId", () => {
  it("mengenali segmen id numeric", () => {
    expect(isNumericId("12")).toBe(true)
    expect(isNumericId("busi-iridium")).toBe(false)
    expect(isNumericId("2026-10")).toBe(false)
  })
})
