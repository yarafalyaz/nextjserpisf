import { describe, it, expect } from "vitest"

import { findCumulativeQtyExcess, cumulativeValueExcess } from "../cumulative-cap"

/**
 * TASK-016: penjaga kumulatif sisi jual (pola findOverReturn sisi retur /
 * over-receive sisi beli). DO 7+7 atas SO 10 dan faktur kedua melebihi SO
 * harus tertangkap oleh helper murni ini sebelum aksi menulis apa pun.
 */
describe("findCumulativeQtyExcess", () => {
  it("lolos bila kumulatif masih di dalam pesanan (7 terkirim + 3 diminta atas 10)", () => {
    const v = findCumulativeQtyExcess(
      new Map([[11, 3]]),
      new Map([[11, 10]]),
      new Map([[11, 7]]),
    )
    expect(v).toBeNull()
  })

  it("menangkap DO kedua 7 atas SO 10 yang sudah terkirim 7", () => {
    const v = findCumulativeQtyExcess(
      new Map([[11, 7]]),
      new Map([[11, 10]]),
      new Map([[11, 7]]),
    )
    expect(v).toEqual({ key: 11, requested: 7, ordered: 10, already: 7, remaining: 3 })
  })

  it("mengagregasi permintaan per kunci sebelum menilai (3+4 atas sisa 6 tertangkap)", () => {
    const v = findCumulativeQtyExcess(
      new Map([[11, 7]]),
      new Map([[11, 10]]),
      new Map([[11, 4]]),
    )
    expect(v?.key).toBe(11)
    expect(v?.remaining).toBe(6)
  })

  it("kunci tanpa baris pesanan dilewati (baris jasa dinilai cap nilai, bukan qty)", () => {
    const v = findCumulativeQtyExcess(
      new Map([[99, 50]]),
      new Map([[11, 10]]),
      new Map(),
    )
    expect(v).toBeNull()
  })

  it("qty pecahan di batas persis tidak dianggap lebih (7.5 + 2.5 atas 10)", () => {
    const v = findCumulativeQtyExcess(
      new Map([[11, 2.5]]),
      new Map([[11, 10]]),
      new Map([[11, 7.5]]),
    )
    expect(v).toBeNull()
  })
})

describe("cumulativeValueExcess", () => {
  it("nol bila total tertagih + kandidat masih di dalam nilai pesanan", () => {
    expect(cumulativeValueExcess(800, 200, 1000)).toBe(0)
  })

  it("mengembalikan kelebihan faktur kedua yang menembus nilai pesanan", () => {
    expect(cumulativeValueExcess(800, 400, 1000)).toBe(200)
  })
})
