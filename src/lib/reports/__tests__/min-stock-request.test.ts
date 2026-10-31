import { describe, expect, it } from "vitest"

import {
  buildMinStockRequestHref,
  buildReorderPointRequestHref,
  parseMinStockPrefill,
} from "@/lib/reports/min-stock-request"

describe("buildMinStockRequestHref", () => {
  it("membuat href prefill dari baris kekurangan ber-id", () => {
    expect(
      buildMinStockRequestHref([
        { itemId: 7, shortage: 5 },
        { itemId: 9, shortage: 2.5 },
      ]),
    ).toBe("/pembelian/permintaan/tambah/item/7%3A5%2C9%3A2.5")
  })

  it("null bila tidak ada baris valid (id kosong / kekurangan nol)", () => {
    expect(buildMinStockRequestHref([])).toBeNull()
    expect(
      buildMinStockRequestHref([
        { itemId: null, shortage: 5 },
        { itemId: 7, shortage: 0 },
      ]),
    ).toBeNull()
  })
})

describe("buildReorderPointRequestHref", () => {
  const line = (over: Record<string, unknown>) => ({
    itemId: 7,
    status: "pesan_sekarang",
    reorderPoint: 100,
    qtyAtWarehouse: 10,
    incomingQty: 0,
    suggestedQty: 90,
    ...over,
  })

  it("satu gudang: kekurangan = titik − stok − PO masuk", () => {
    expect(buildReorderPointRequestHref([line({ incomingQty: 20, suggestedQty: 70 })])).toBe(
      "/pembelian/permintaan/tambah/item/7%3A70",
    )
  })

  it("multi-gudang: PO masuk per barang dikurangkan SEKALI, bukan per pasang", () => {
    // Dua pasang barang sama: titik 100+100, stok 10+10, PO masuk 50
    // (angka per barang yang sama di kedua pasang). Agregat sah =
    // 200 − 20 − 50 = 130. Menjumlah suggestedQty per pasang (40+40=80)
    // mengurangkan PO yang sama dua kali.
    expect(
      buildReorderPointRequestHref([
        line({ suggestedQty: 40, incomingQty: 50 }),
        line({ suggestedQty: 40, incomingQty: 50 }),
      ]),
    ).toBe("/pembelian/permintaan/tambah/item/7%3A130")
  })

  it("status bukan pesan_sekarang dan baris tidak dinilai tidak ikut", () => {
    expect(
      buildReorderPointRequestHref([
        line({ status: "aman", suggestedQty: 0 }),
        line({ itemId: 9, status: "tidak_dinilai", reorderPoint: null, suggestedQty: null }),
      ]),
    ).toBeNull()
  })

  it("kekurangan agregat nol (stok gabungan menutup titik) tidak menghasilkan baris", () => {
    expect(
      buildReorderPointRequestHref([
        line({ reorderPoint: 10, qtyAtWarehouse: 8, incomingQty: 5, suggestedQty: 0 }),
      ]),
    ).toBeNull()
  })
})

describe("parseMinStockPrefill", () => {
  const valid = new Set([7, 9])

  it("membaca pasangan id:qty dan menggabungkan id duplikat", () => {
    expect(parseMinStockPrefill("7:5,9:2,7:1", valid)).toEqual([
      { itemId: 7, qty: 6 },
      { itemId: 9, qty: 2 },
    ])
  })

  it("membuang id tidak dikenal, qty tidak positif, dan entri rusak", () => {
    expect(parseMinStockPrefill("99:5,7:0,7:-2,abc,7:3", valid)).toEqual([
      { itemId: 7, qty: 3 },
    ])
    expect(parseMinStockPrefill(undefined, valid)).toEqual([])
    expect(parseMinStockPrefill("", valid)).toEqual([])
  })
})
