import { describe, expect, it } from "vitest"

import {
  buildPurchaseOutstanding,
  type PurchaseOrderOutstandingInput,
  type PurchaseOutstandingItemInput,
} from "@/lib/reports/purchase-outstanding"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function item(over: Partial<PurchaseOutstandingItemInput> = {}): PurchaseOutstandingItemInput {
  return {
    sku: "SKU-01",
    name: "Busi Iridium",
    unit: "PCS",
    orderedQty: 10,
    receivedQty: 4,
    unitPrice: 50_000,
    ...over,
  }
}

function order(over: Partial<PurchaseOrderOutstandingInput> = {}): PurchaseOrderOutstandingInput {
  return {
    documentNo: "PO-0001",
    date: new Date("2026-10-05T00:00:00"),
    vendorName: "CV Sumber",
    status: "ordered",
    items: [item()],
    ...over,
  }
}

describe("buildPurchaseOutstanding", () => {
  it("menghitung sisa per baris dan nilainya, serta membedakan sebagian vs belum diterima", () => {
    const result = buildPurchaseOutstanding({
      orders: [
        order({
          items: [
            item(),
            item({ sku: "SKU-02", name: "Filter Oli", orderedQty: 5, receivedQty: 0, unitPrice: 20_000 }),
          ],
        }),
      ],
      start: period.start,
      end: period.end,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(2)
    expect(data[0].cells).toEqual(["SKU-01 Busi Iridium", "10", "4", "6", "PCS", "300.000"])
    expect(data[1].cells).toEqual(["SKU-02 Filter Oli", "5", "0", "5", "PCS", "100.000"])

    expect(result.totals).toEqual({
      orders: 1,
      items: 2,
      partiallyReceived: 1,
      notReceived: 1,
      outstandingValue: 400_000,
    })

    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("1 baris yang sudah diterima sebagian"))).toBe(true)
  })

  it("membuang baris yang sudah diterima penuh dan pesanan tanpa sisa", () => {
    const result = buildPurchaseOutstanding({
      orders: [
        order({ documentNo: "PO-0001", items: [item({ orderedQty: 3, receivedQty: 3 })] }),
        order({ documentNo: "PO-0002", items: [item(), item({ orderedQty: 1, receivedQty: 1 })] }),
      ],
      start: period.start,
      end: period.end,
    })

    const groups = result.table.rows.filter((row) => row.kind === "group").map((row) => String(row.label))
    expect(groups).toHaveLength(1)
    expect(groups[0]).toContain("PO-0002")
    expect(result.totals.orders).toBe(1)
    expect(result.totals.items).toBe(1)
  })

  it("tidak menjumlahkan kuantitas dan memberi catatan saat satuannya campur", () => {
    const result = buildPurchaseOutstanding({
      orders: [order({ items: [item(), item({ unit: "LITER", orderedQty: 20, receivedQty: 5, unitPrice: 15_000 })] })],
      start: period.start,
      end: period.end,
    })

    expect(result.hasMixedUnits).toBe(true)
    const totals = result.table.rows.filter((row) => row.kind === "total")
    for (const row of totals) {
      expect(row.cells?.slice(0, 5)).toEqual(["", "", "", "", ""])
    }
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("lebih dari satu satuan"))).toBe(true)
  })

  it("memberi subtotal nilai per pesanan dan jumlah akhir", () => {
    const result = buildPurchaseOutstanding({
      orders: [
        order({ documentNo: "PO-0001" }),
        order({ documentNo: "PO-0002", date: new Date("2026-10-20T00:00:00"), items: [item({ receivedQty: 9 })] }),
      ],
      start: period.start,
      end: period.end,
    })

    const totals = result.table.rows.filter((row) => row.kind === "total")
    expect(totals.map((row) => String(row.label))).toEqual([
      "Nilai sisa PO-0001",
      "Nilai sisa PO-0002",
      "Jumlah Nilai Sisa",
    ])
    expect(totals[0].cells?.[5]).toBe("300.000")
    expect(totals[1].cells?.[5]).toBe("50.000")
    expect(totals[2].grand).toBe(true)
    expect(totals[2].cells?.[5]).toBe("350.000")
  })

  it("mengabaikan pesanan di luar periode dan menjelaskan bila tidak ada sisa", () => {
    const outside = buildPurchaseOutstanding({
      orders: [order({ date: new Date("2026-09-30T00:00:00") })],
      start: period.start,
      end: period.end,
    })
    expect(outside.totals.orders).toBe(0)

    const empty = buildPurchaseOutstanding({ orders: [], start: period.start, end: period.end })
    const notices = empty.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada pesanan pembelian dengan sisa penerimaan"))).toBe(true)
  })

  it("menampilkan nomor pesanan, tanggal, pemasok, dan status pada kepala blok", () => {
    const result = buildPurchaseOutstanding({ orders: [order()], start: period.start, end: period.end })
    const group = result.table.rows.find((row) => row.kind === "group")
    expect(String(group?.label)).toBe("PO-0001 · 05 Okt 2026 · CV Sumber · ordered")
  })
})
