import { describe, it, expect } from "vitest"
import { finalizeCounts, concurrentDelta } from "../stocktake-finalize"

// P1-5: finalisasi hitungan opname — recount mengunci, baris tanpa hitungan
// dilewati (bukan 0), posting memakai live.

describe("finalizeCounts (P1-5)", () => {
  it("uses count2 when recounted, else count1", () => {
    const out = finalizeCounts([
      { itemId: 1, systemQty: 10, count1: 8, count2: 9 },
      { itemId: 2, systemQty: 10, count1: 8, count2: null },
    ])
    expect(out[0].finalCount).toBe(9)
    expect(out[0].variance).toBe(-1)
    expect(out[0].needsRecount).toBe(false)
    expect(out[1].finalCount).toBe(8)
    expect(out[1].needsRecount).toBe(true)
  })

  it("skips uncounted lines instead of treating them as zero", () => {
    const out = finalizeCounts([{ itemId: 1, systemQty: 10, count1: null, count2: null }])
    expect(out).toEqual([])
  })

  it("zero is a valid count (empty stock), not a skip", () => {
    const out = finalizeCounts([{ itemId: 1, systemQty: 5, count1: 0, count2: null }])
    expect(out).toHaveLength(1)
    expect(out[0].finalCount).toBe(0)
    expect(out[0].variance).toBe(-5)
  })

  it("no recount needed when count1 matches the system", () => {
    const out = finalizeCounts([{ itemId: 1, systemQty: 7, count1: 7, count2: null }])
    expect(out[0].needsRecount).toBe(false)
    expect(out[0].variance).toBe(0)
  })
})

describe("concurrentDelta (P1-5)", () => {
  it("reports movement during the session", () => {
    expect(concurrentDelta(10, 13)).toBe(3)
    expect(concurrentDelta(10, 10)).toBe(0)
  })
})
