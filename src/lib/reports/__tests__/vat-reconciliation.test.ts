import { describe, it, expect } from "vitest"
import { buildVatPosition } from "../vat-reconciliation"

describe("buildVatPosition", () => {
  it("is 'kurang bayar' when output exceeds input", () => {
    expect(buildVatPosition(110_000, 60_000)).toEqual({
      output: 110_000,
      input: 60_000,
      difference: 50_000,
      status: "kurang_bayar",
    })
  })

  it("is 'lebih bayar' when input exceeds output", () => {
    const result = buildVatPosition(40_000, 100_000)
    expect(result.difference).toBe(-60_000)
    expect(result.status).toBe("lebih_bayar")
  })

  it("is 'nihil' when both sides are equal", () => {
    expect(buildVatPosition(75_000, 75_000).status).toBe("nihil")
  })

  it("treats sub-cent noise as nihil", () => {
    expect(buildVatPosition(1000.001, 1000).status).toBe("nihil")
  })

  it("rounds both sides to 2 decimals", () => {
    const result = buildVatPosition(100.005, 0.005)
    expect(result.output).toBe(100.01)
    expect(result.input).toBe(0.01)
  })
})
