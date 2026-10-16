import { describe, expect, it } from "vitest"

import {
  buildStockCount,
  type StockCountDocumentInput,
  type StockCountItemInput,
} from "@/lib/reports/stock-count"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function item(over: Partial<StockCountItemInput> = {}): StockCountItemInput {
  return {
    sku: "SKU-01",
    name: "Busi Iridium",
    systemQty: 10,
    actualQty: 8,
    unit: "PCS",
    unitCost: 50_000,
    ...over,
  }
}

function document(over: Partial<StockCountDocumentInput> = {}): StockCountDocumentInput {
  return {
    documentNo: "SA-0001",
    date: new Date("2026-10-05T00:00:00"),
    warehouseName: "Gudang Utama",
    status: "approved",
    items: [item()],
    ...over,
  }
}

describe("buildStockCount", () => {
  it("menghitung selisih dari hasil hitung − sistem dan menilainya dengan harga satuan", () => {
    const result = buildStockCount({
      documents: [document({ items: [item(), item({ sku: "SKU-02", name: "Filter Oli", systemQty: 5, actualQty: 7, unitCost: 20_000 })] })],
      start: period.start,
      end: period.end,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(2)
    // -2 pcs × 50.000 → minus (format akuntansi memakai tanda kurung).
    expect(data[0].cells).toEqual(["SKU-01 Busi Iridium", "10", "8", "-2", "PCS", "(100.000)"])
    expect(data[1].cells).toEqual(["SKU-02 Filter Oli", "5", "7", "2", "PCS", "40.000"])

    expect(result.totals).toEqual({
      documents: 1,
      items: 2,
      differenceValue: -60_000,
      itemsWithDifference: 2,
    })
  })

  it("memberi subtotal nilai per dokumen dan jumlah akhir", () => {
    const result = buildStockCount({
      documents: [
        document({ documentNo: "SA-0001" }),
        document({ documentNo: "SA-0002", items: [item({ actualQty: 10 })] }),
      ],
      start: period.start,
      end: period.end,
    })

    const totals = result.table.rows.filter((row) => row.kind === "total")
    expect(String(totals[0].label)).toBe("Nilai selisih SA-0001")
    expect(totals[0].cells?.[5]).toBe("(100.000)")
    expect(String(totals[1].label)).toBe("Nilai selisih SA-0002")
    // Baris cocok (hasil hitung = sistem) → nilai 0.
    expect(totals[1].cells?.[5]).toBe("0")
    expect(totals[2].grand).toBe(true)
    expect(totals[2].cells?.[5]).toBe("(100.000)")
  })

  it("tidak menjumlahkan kuantitas dan memberi catatan saat satuannya campur", () => {
    const result = buildStockCount({
      documents: [document({ items: [item(), item({ sku: "SKU-03", name: "Oli", unit: "LITER", systemQty: 20, actualQty: 18, unitCost: 15_000 })] })],
      start: period.start,
      end: period.end,
    })

    expect(result.hasMixedUnits).toBe(true)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("lebih dari satu satuan"))).toBe(true)

    // Tidak ada baris total yang membawa angka kuantitas — hanya kolom nilai.
    const totals = result.table.rows.filter((row) => row.kind === "total")
    for (const row of totals) {
      expect(row.cells?.slice(0, 5)).toEqual(["", "", "", "", ""])
    }
  })

  it("memberi catatan bila seluruh baris cocok dengan sistem", () => {
    const result = buildStockCount({
      documents: [document({ items: [item({ actualQty: 10 })] })],
      start: period.start,
      end: period.end,
    })

    expect(result.totals.itemsWithDifference).toBe(0)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("tidak ada selisih"))).toBe(true)
  })

  it("mengabaikan lembar di luar periode dan menjelaskan bila kosong", () => {
    const outside = buildStockCount({
      documents: [document({ date: new Date("2026-09-30T00:00:00") })],
      start: period.start,
      end: period.end,
    })
    expect(outside.totals.documents).toBe(0)

    const empty = buildStockCount({ documents: [], start: period.start, end: period.end })
    const notices = empty.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada lembar penghitungan stok"))).toBe(true)
  })

  it("menampilkan nomor dokumen, tanggal, gudang, dan status pada kepala blok", () => {
    const result = buildStockCount({ documents: [document({ status: "draft" })], start: period.start, end: period.end })
    const group = result.table.rows.find((row) => row.kind === "group")
    expect(String(group?.label)).toBe("SA-0001 · 05 Okt 2026 · Gudang Utama · draft")
  })
})
