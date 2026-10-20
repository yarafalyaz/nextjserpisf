import { describe, expect, it } from "vitest"

import {
  buildEquityChanges,
  buildRetainedEarnings,
  type EquityAccountRow,
} from "@/lib/reports/equity-changes"

function senAccount(index: number): EquityAccountRow {
  return {
    id: index + 1,
    code: `3000${index}`,
    name: index === 0 ? "Laba Ditahan" : "Modal",
    opening: 0.24,
    movement: 0.24,
    closing: 0.24,
  }
}

describe("equity-changes presisi sen", () => {
  it("total 17 akun sen persis, bukan float mentah", () => {
    const accounts = Array.from({ length: 17 }, (_, i) => senAccount(i))
    const result = buildEquityChanges(accounts, 0.24)
    expect(result.totals.opening).toBe(4.08)
    expect(result.totals.movement).toBe(4.08)
    expect(result.totals.closing).toBe(4.08)
    expect(result.closingWithProfit).toBe(4.32)
  })

  it("laba ditahan 17 akun sen persis", () => {
    const accounts = Array.from({ length: 17 }, (_, i) => ({
      ...senAccount(i),
      name: "Laba Ditahan",
    }))
    const result = buildRetainedEarnings(accounts, 0)
    expect(result.opening).toBe(4.08)
    expect(result.closing).toBe(4.08)
  })
})
