import { describe, expect, it } from "vitest"

import {
  buildMinStockRequestHref,
  parseMinStockPrefill,
} from "@/lib/reports/min-stock-request"

describe("buildMinStockRequestHref", () => {
  it("membuat href prefill dari baris kekurangan ber-id", () => {
    expect(
      buildMinStockRequestHref([
        { itemId: 7, shortage: 5 },
        { itemId: 9, shortage: 2.5 },
      ]),
    ).toBe("/pembelian/permintaan/tambah?item=7%3A5%2C9%3A2.5")
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
