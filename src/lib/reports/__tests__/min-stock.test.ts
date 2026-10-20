import { describe, expect, it } from "vitest"

import { buildMinStock, minStockSummary } from "@/lib/reports/min-stock"

function item(overrides: Partial<Parameters<typeof buildMinStock>[0][number]> = {}) {
  return {
    sku: "BRG-1",
    name: "Busi",
    unit: "PCS",
    categoryName: "Sparepart",
    warehouseName: "Gudang Utama",
    vendorName: "CV Sumber",
    qtyOnHand: 5,
    minStock: 10,
    cost: 1000,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildMinStock>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice" ? row.text : row.kind === "total" ? row.label : row.kind === "data" ? row.cells.join(" | ") : "",
    )
    .join("\n")
}

describe("buildMinStock", () => {
  it("mendaftar barang yang menembus minimum beserta kekurangan dan nilainya", () => {
    const result = buildMinStock([item()])

    expect(result.totals.items).toBe(1)
    expect(result.totals.shortageValue).toBe(5_000)
    expect(result.shortageLines).toEqual([{ itemId: null, shortage: 5 }])
    expect(texts(result)).toContain("BRG-1 Busi")
    expect(texts(result)).toContain("CV Sumber")
    expect(result.verdict).toContain("1 barang")
  })

  it("menyandingkan stok yang persis sama dengan minimum sebagai mencapai batas", () => {
    const result = buildMinStock([item({ qtyOnHand: 10, minStock: 10 })])

    expect(result.totals.items).toBe(1)
    expect(result.totals.shortageValue).toBe(0)
  })

  it("mengurutkan barang yang habis lebih dulu, lalu kekurangan bernilai terbesar", () => {
    const result = buildMinStock([
      item({ sku: "A-KECIL", qtyOnHand: 9, minStock: 10, cost: 100 }),
      item({ sku: "B-HABIS", qtyOnHand: 0, minStock: 2, cost: 100 }),
      item({ sku: "C-BESAR", qtyOnHand: 1, minStock: 100, cost: 1000 }),
    ])
    const urutan = result.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[0] : ""))

    expect(urutan[0]).toContain("B-HABIS")
    expect(urutan[1]).toContain("C-BESAR")
    expect(urutan[2]).toContain("A-KECIL")
    expect(result.totals.outOfStock).toBe(1)
  })

  it("membedakan 'batas minimum belum diisi' dari 'semua stok aman'", () => {
    const belumDiisi = buildMinStock([item({ minStock: 0, qtyOnHand: 0 })])
    const aman = buildMinStock([item({ minStock: 10, qtyOnHand: 50 })])

    expect(belumDiisi.totals.hasAnyMinimum).toBe(false)
    expect(texts(belumDiisi)).toContain("Belum ada satu pun barang yang diisi batas minimum")
    expect(texts(belumDiisi)).toContain("bukan berarti semua stok aman")
    expect(minStockSummary(belumDiisi)).toContain("Batas minimum belum diisi")

    expect(aman.totals.hasAnyMinimum).toBe(true)
    expect(aman.totals.items).toBe(0)
    expect(texts(aman)).toContain("masih di atas batasnya")
    expect(minStockSummary(aman)).toContain("Tidak ada barang")
  })

  it("menyatakan stok yang dibandingkan adalah total seluruh gudang", () => {
    const result = buildMinStock([item()])

    expect(texts(result)).toContain("total seluruh gudang")
  })

  it("tidak menjumlahkan kuantitas lintas satuan", () => {
    const result = buildMinStock([
      item({ sku: "A", unit: "PCS" }),
      item({ sku: "B", unit: "LITER", qtyOnHand: 0, minStock: 4, cost: 2000 }),
    ])

    expect(texts(result)).toContain("TIDAK dijumlahkan")
    expect(result.totals.shortageValue).toBe(5_000 + 8_000)
  })

  it("meringkas untuk KPI saat ada barang di bawah minimum", () => {
    const result = buildMinStock([item(), item({ sku: "B", qtyOnHand: 0, minStock: 4, cost: 2000 })])

    expect(minStockSummary(result)).toContain("2 barang mencapai minimum")
    expect(minStockSummary(result)).toContain("(1 habis)")
    expect(minStockSummary(result)).toContain("perkiraan belanja")
  })
})
