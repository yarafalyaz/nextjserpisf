import { describe, expect, it } from "vitest"

import { normalizeFavoriteHref } from "@/lib/utils/favorite-href"

describe("normalizeFavoriteHref", () => {
  it("menerima jalur internal aplikasi", () => {
    expect(normalizeFavoriteHref("/penjualan/faktur/tambah")).toBe("/penjualan/faktur/tambah")
    expect(normalizeFavoriteHref("  /laporan/transaksi-bank  ")).toBe("/laporan/transaksi-bank")
  })

  it("menolak URL absolut, protokol, dan protokol-relatif", () => {
    expect(normalizeFavoriteHref("https://example.com")).toBeNull()
    expect(normalizeFavoriteHref("//example.com")).toBeNull()
    expect(normalizeFavoriteHref("javascript:alert(1)")).toBeNull()
    expect(normalizeFavoriteHref("penjualan/faktur")).toBeNull()
  })

  it("menolak spasi dan nilai bukan string", () => {
    expect(normalizeFavoriteHref("/a b")).toBeNull()
    expect(normalizeFavoriteHref(null)).toBeNull()
    expect(normalizeFavoriteHref(42)).toBeNull()
  })
})
