import { describe, expect, it } from "vitest"

import { buildOrderFulfillment, orderFulfillmentSummary } from "@/lib/reports/order-fulfillment"

const period = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T23:59:59.000Z"),
}

function rowsOf(result: ReturnType<typeof buildOrderFulfillment>) {
  return result.table.rows.filter((row) => row.kind === "data")
}

describe("buildOrderFulfillment", () => {
  it("memakai judul kolom sisi penjualan (Terkirim), bukan kata sisi pembelian", () => {
    const result = buildOrderFulfillment({ orders: [], start: period.start, end: period.end })

    expect(result.table.columns.map((column) => column.header)).toEqual([
      "Barang",
      "Dipesan",
      "Terkirim",
      "Kurang",
      "Satuan",
      "Nilai Sisa",
    ])
    expect(result.table.columns.map((column) => column.header)).not.toContain("Diterima")
  })

  it("memetakan total ke nama medan sisi penjualan", () => {
    const result = buildOrderFulfillment({
      orders: [
        {
          documentNo: "SO-1",
          date: new Date("2026-10-05T00:00:00.000Z"),
          partyName: "Toko Maju",
          status: "confirmed",
          items: [
            {
              sku: "BRG-1",
              name: "Busi",
              unit: "PCS",
              orderedQty: 10,
              fulfilledQty: 4,
              unitPrice: 25_000,
            },
            {
              sku: "BRG-2",
              name: "Oli",
              unit: "LITER",
              orderedQty: 5,
              fulfilledQty: 0,
              unitPrice: 90_000,
            },
          ],
        },
      ],
      start: period.start,
      end: period.end,
    })

    expect(result.totals).toEqual({
      orders: 1,
      items: 2,
      partiallyShipped: 1,
      notShipped: 1,
      outstandingValue: 6 * 25_000 + 5 * 90_000,
    })
    expect(rowsOf(result)).toHaveLength(2)
  })

  it("menyebut pengiriman (bukan penerimaan) pada catatan periode kosong", () => {
    const result = buildOrderFulfillment({ orders: [], start: period.start, end: period.end })
    const texts = result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)

    expect(texts.some((text) => text.includes("sisa pengiriman"))).toBe(true)
    expect(texts.some((text) => text.includes("penerimaan"))).toBe(false)
  })

  it("menyebut terkirim pada catatan pembeda sebagian vs belum", () => {
    const result = buildOrderFulfillment({
      orders: [
        {
          documentNo: "SO-1",
          date: new Date("2026-10-05T00:00:00.000Z"),
          partyName: "Toko Maju",
          status: "confirmed",
          items: [
            { sku: "A", name: "A", unit: "PCS", orderedQty: 10, fulfilledQty: 4, unitPrice: 1000 },
            { sku: "B", name: "B", unit: "PCS", orderedQty: 10, fulfilledQty: 0, unitPrice: 1000 },
          ],
        },
      ],
      start: period.start,
      end: period.end,
    })
    const texts = result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)

    expect(texts.some((text) => text.includes("sudah terkirim sebagian"))).toBe(true)
    expect(texts.some((text) => text.includes("belum terkirim satu unit pun"))).toBe(true)
  })

  it("meringkas dengan kata sisi penjualan", () => {
    const result = buildOrderFulfillment({ orders: [], start: period.start, end: period.end })

    expect(orderFulfillmentSummary(result)).toContain("0 pesanan")
    expect(orderFulfillmentSummary(result)).toContain("belum terkirim")
  })
})
