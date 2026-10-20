import { describe, expect, it } from "vitest"

import {
  buildDepreciationDifference,
  type DepreciationAssetInput,
} from "@/lib/reports/depreciation-difference"

// Aset sen: bulanan akuntansi = 1.2/(5*12)=0.02 -> tahunan 0.24;
// fiskal = 1.2/(4*12)*12=0.30; selisih per aset -0.06.
// 17 aset: float mentah 17x0.24=4.080000000000002, 17x0.30=5.099999999999999,
// 17x-0.06=-1.0200000000000005 — total laporan wajib sen persis.
function senAsset(index: number): DepreciationAssetInput {
  return {
    code: `AST-${index}`,
    name: "Laptop",
    categoryName: "Elektronik",
    purchaseCost: 1.2,
    currentValue: 1.2,
    residualValue: 0,
    depreciationMethod: "straight_line",
    categoryDepreciationRate: null,
    categoryUsefulLife: 5,
    taxDepreciationRate: null,
    taxUsefulLife: 4,
  }
}

describe("buildDepreciationDifference presisi sen", () => {
  it("total akuntansi/fiskal/selisih 17 aset sen persis, bukan float mentah", () => {
    const result = buildDepreciationDifference(
      Array.from({ length: 17 }, (_, i) => senAsset(i)),
    )

    expect(result.totals.accountingAnnual).toBe(4.08)
    expect(result.totals.fiscalAnnual).toBe(5.1)
    expect(result.totals.accountingComparable).toBe(4.08)
    expect(result.totals.difference).toBe(-1.02)
  })
})
