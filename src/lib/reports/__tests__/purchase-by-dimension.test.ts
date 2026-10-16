import { describe, expect, it } from "vitest"

import {
  buildPurchasesByDimension,
  purchaseByDimensionSummary,
  type PurchaseLineInput,
} from "@/lib/reports/purchase-by-dimension"

function line(overrides: Partial<PurchaseLineInput> = {}): PurchaseLineInput {
  return {
    key: "k",
    label: "PT Sumber Jaya",
    documentNos: ["VB-001"],
    dpp: 1_000_000,
    tax: 110_000,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildPurchasesByDimension>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice"
        ? row.text
        : row.kind === "group"
          ? row.label
          : row.kind === "total"
            ? `${row.label} ${row.cells.join(" | ")}`
            : row.cells.join(" | "),
    )
    .join("\n")
}

describe("buildPurchasesByDimension", () => {
  it("menjumlahkan DPP, PPN, dan total", () => {
    const result = buildPurchasesByDimension({
      lines: [line({ key: "a", dpp: 1_000_000, tax: 110_000 }), line({ key: "b", label: "PT Lain", dpp: 500_000, tax: 55_000 })],
      dimension: "pemasok",
      documentCount: 2,
    })

    expect(result.totals.dpp).toBe(1_500_000)
    expect(result.totals.tax).toBe(165_000)
    expect(result.totals.total).toBe(1_665_000)
    expect(texts(result)).toContain("Jumlah")
  })

  it("memakai jumlah dokumen unik, bukan penjumlahan kolom Dokumen", () => {
    const result = buildPurchasesByDimension({
      lines: [line({ key: "a", documentNos: ["VB-001"] }), line({ key: "b", label: "B", documentNos: ["VB-001"] })],
      dimension: "barang",
      documentCount: 1,
    })

    const total = result.table.rows.find((row) => row.kind === "total")
    expect(total && total.kind === "total" ? total.cells[0] : null).toBe("1")
  })

  it("mengurutkan baris menurut nilai terbesar", () => {
    const result = buildPurchasesByDimension({
      lines: [line({ key: "a", label: "KECIL", dpp: 100 }), line({ key: "b", label: "BESAR", dpp: 900 })],
      dimension: "pemasok",
      documentCount: 2,
    })
    const labels = result.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[0] : ""))

    expect(labels).toEqual(["BESAR", "KECIL"])
  })

  it("membedakan 'tidak ada pembelian' dari daftar kosong biasa", () => {
    const result = buildPurchasesByDimension({ lines: [], dimension: "biaya", documentCount: 0 })

    expect(result.verdict).toContain("Tidak ada pembelian")
    expect(texts(result)).toContain("Tidak ada pembelian pada periode ini")
    expect(purchaseByDimensionSummary(result)).toContain("Tidak ada pembelian")
  })

  it("menyatakan DPP sebelum pajak, dokumen unik, dan dimensi", () => {
    const result = buildPurchasesByDimension({ lines: [line()], dimension: "barang", documentCount: 1 })

    expect(texts(result)).toContain("DPP")
    expect(texts(result)).toContain("tagihan unik")
    expect(texts(result)).toContain("Dimensi: per Barang")
  })
})
