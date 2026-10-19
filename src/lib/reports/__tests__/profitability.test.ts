import { describe, expect, it } from "vitest"

import {
  buildProfitability,
  grossMarginPercent,
  profitabilitySummary,
  type ProfitLineInput,
} from "@/lib/reports/profitability"

function line(overrides: Partial<ProfitLineInput> = {}): ProfitLineInput {
  return {
    key: "k",
    label: "INV-001",
    revenue: 1_000_000,
    cogs: 600_000,
    revenueLinesWithoutCogs: 0,
    serviceLinesWithoutCogs: 0,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildProfitability>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice" ? row.text : row.kind === "group" ? row.label : row.kind === "total" ? `${row.label} ${row.cells.join(" | ")}` : row.cells.join(" | "),
    )
    .join("\n")
}

describe("grossMarginPercent", () => {
  it("menghitung margin dan null saat pendapatan nol", () => {
    expect(grossMarginPercent(1_000_000, 600_000)).toBeCloseTo(40)
    expect(grossMarginPercent(0, 100)).toBeNull()
  })
})

describe("buildProfitability", () => {
  it("menghitung laba kotor dan margin per kelompok serta totalnya", () => {
    const result = buildProfitability({
      lines: [line({ key: "a", revenue: 1_000_000, cogs: 600_000 }), line({ key: "b", label: "INV-002", revenue: 500_000, cogs: 400_000 })],
      dimension: "faktur",
    })

    expect(result.totals.revenue).toBe(1_500_000)
    expect(result.totals.cogs).toBe(1_000_000)
    expect(result.totals.grossProfit).toBe(500_000)
    expect(texts(result)).toContain("Jumlah")
  })

  it("mengurutkan baris menurut pendapatan terbesar", () => {
    const result = buildProfitability({
      lines: [line({ key: "a", label: "KECIL", revenue: 100 }), line({ key: "b", label: "BESAR", revenue: 900 })],
      dimension: "barang",
    })
    const labels = result.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[0] : ""))

    expect(labels).toEqual(["BESAR", "KECIL"])
  })

  it("memperingatkan baris barang berpendapatan tanpa HPP, tetapi tidak menghitung jasa", () => {
    const result = buildProfitability({
      lines: [
        line({ key: "stock", revenue: 1_000_000, cogs: 0, revenueLinesWithoutCogs: 1, serviceLinesWithoutCogs: 0, stockRevenueWithoutCogs: 1_000_000 }),
        line({ key: "service", label: "JASA", revenue: 500_000, cogs: 0, revenueLinesWithoutCogs: 1, serviceLinesWithoutCogs: 1 }),
      ],
      dimension: "barang",
    })

    expect(result.totals.missingCogsLines).toBe(1)
    expect(result.totals.revenueMissingCogs).toBe(1_000_000)
    expect(texts(result)).toContain("tidak punya HPP")
    expect(profitabilitySummary(result)).toContain("baris tanpa HPP")
  })

  it("mengakumulasi revenueMissingCogs per baris stok tanpa HPP, bukan se-bucket (R-08)", () => {
    // Bucket campuran: satu baris stok ber-HPP (2jt) + satu baris stok tanpa HPP (1jt)
    // + satu baris jasa tanpa HPP (5jt, dikecualikan). Total bucket 8jt,
    // tapi revenueMissingCogs hanya 1jt.
    const result = buildProfitability({
      lines: [
        line({
          key: "mixed",
          revenue: 8_000_000,
          cogs: 1_200_000,
          revenueLinesWithoutCogs: 2,
          serviceLinesWithoutCogs: 1,
          stockRevenueWithoutCogs: 1_000_000,
        }),
      ],
      dimension: "faktur",
    })

    expect(result.totals.missingCogsLines).toBe(1)
    expect(result.totals.revenueMissingCogs).toBe(1_000_000)
  })

  it("membedakan 'tidak ada penjualan' dari daftar kosong biasa", () => {
    const result = buildProfitability({ lines: [], dimension: "pelanggan" })

    expect(result.verdict).toContain("Tidak ada penjualan")
    expect(texts(result)).toContain("belum bisa dinilai")
    expect(profitabilitySummary(result)).toContain("Tidak ada penjualan")
  })

  it("menyatakan pendapatan sebelum pajak & sumber HPP", () => {
    const result = buildProfitability({ lines: [line()], dimension: "faktur" })

    expect(texts(result)).toContain("sebelum pajak")
    expect(texts(result)).toContain("Dimensi: per Faktur")
  })
})
