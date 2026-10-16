import { describe, it, expect } from "vitest"

import {
  buildReportHref,
  encodeReportFilters,
  parseReportFilters,
} from "@/lib/reports/report-href"

describe("encodeReportFilters", () => {
  it("menulis pasangan kunci/nilai berurutan", () => {
    expect(encodeReportFilters({ barang: "busi-iridium", gudang: "gudang-utama" })).toEqual([
      "barang",
      "busi-iridium",
      "gudang",
      "gudang-utama",
    ])
  })

  it("melewati filter yang kosong, null, dan undefined", () => {
    expect(encodeReportFilters({ barang: "", gudang: null, akun: undefined })).toEqual([])
    expect(encodeReportFilters({ barang: "busi", gudang: "" })).toEqual(["barang", "busi"])
  })

  it("tetap menulis nilai 0 (bukan dianggap kosong)", () => {
    expect(encodeReportFilters({ pusat: 0 })).toEqual(["pusat", "0"])
  })
})

describe("parseReportFilters", () => {
  it("membaca kembali pasangan kunci/nilai", () => {
    expect(parseReportFilters(["barang", "busi-iridium", "gudang", "gudang-utama"])).toEqual({
      barang: "busi-iridium",
      gudang: "gudang-utama",
    })
  })

  it("tidak terpengaruh urutan", () => {
    expect(parseReportFilters(["gudang", "gudang-utama", "barang", "busi"])).toEqual({
      gudang: "gudang-utama",
      barang: "busi",
    })
  })

  it("mengabaikan segmen terakhir yang menggantung", () => {
    // URL yang terpotong saat disalin harus tetap menampilkan laporan.
    expect(parseReportFilters(["barang", "busi", "gudang"])).toEqual({ barang: "busi" })
  })

  it("mengembalikan objek kosong tanpa filter", () => {
    expect(parseReportFilters([])).toEqual({})
  })

  it("bolak-balik dengan encode", () => {
    const filters = { barang: "busi-iridium", gudang: "gudang-utama" }
    expect(parseReportFilters(encodeReportFilters(filters))).toEqual(filters)
  })
})

describe("buildReportHref", () => {
  it("menyusun periode + filter sebagai path, tanpa query string", () => {
    expect(
      buildReportHref("/laporan/kartu-stok", "2026-01-01_2026-10-13", {
        barang: "busi-iridium",
        gudang: "gudang-utama",
      }),
    ).toBe("/laporan/kartu-stok/2026-01-01_2026-10-13/barang/busi-iridium/gudang/gudang-utama")
  })

  it("tanpa filter hanya periode", () => {
    expect(buildReportHref("/laporan/buku-besar", "2026-10")).toBe("/laporan/buku-besar/2026-10")
  })

  it("tidak pernah menyisakan segmen kosong", () => {
    const href = buildReportHref("/laporan/kartu-stok", "2026-10", { barang: "busi", gudang: null })
    expect(href).toBe("/laporan/kartu-stok/2026-10/barang/busi")
    expect(href).not.toContain("//")
    expect(href).not.toContain("?")
  })

  it("boleh tanpa periode (laporan seperti valuasi stok)", () => {
    expect(buildReportHref("/laporan/valuasi-stok", undefined, { gudang: "gudang-utama" })).toBe(
      "/laporan/valuasi-stok/gudang/gudang-utama",
    )
    expect(buildReportHref("/laporan/valuasi-stok", null, {})).toBe("/laporan/valuasi-stok")
  })
})
