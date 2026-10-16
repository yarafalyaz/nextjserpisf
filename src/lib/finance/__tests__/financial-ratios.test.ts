import { describe, expect, it } from "vitest"

import { computeFinancialRatios, formatRatio, type RatioInput } from "@/lib/finance/financial-ratios"

function input(overrides: Partial<RatioInput> = {}): RatioInput {
  return {
    currentAssets: 600_000_000,
    inventory: 200_000_000,
    totalAssets: 1_000_000_000,
    currentLiabilities: 300_000_000,
    totalLiabilities: 400_000_000,
    totalEquity: 600_000_000,
    revenue: 2_000_000_000,
    grossProfit: 800_000_000,
    netProfit: 200_000_000,
    ...overrides,
  }
}

function byKey(result: ReturnType<typeof computeFinancialRatios>, key: string) {
  const row = result.rows.find((r) => r.key === key)
  if (!row) throw new Error(`rasio ${key} tidak ada`)
  return row
}

describe("computeFinancialRatios", () => {
  it("menghitung rasio likuiditas, solvabilitas, dan profitabilitas", () => {
    const result = computeFinancialRatios(input())

    expect(byKey(result, "current-ratio").value).toBeCloseTo(2)
    // (600jt − 200jt) / 300jt = 1,333…
    expect(byKey(result, "quick-ratio").value).toBeCloseTo(4 / 3)
    // 400jt / 600jt
    expect(byKey(result, "debt-to-equity").value).toBeCloseTo(2 / 3)
    expect(byKey(result, "debt-to-asset").value).toBeCloseTo(40)
    expect(byKey(result, "gross-margin").value).toBeCloseTo(40)
    expect(byKey(result, "net-margin").value).toBeCloseTo(10)
    expect(byKey(result, "roa").value).toBeCloseTo(20)
    // 200jt / 600jt
    expect(byKey(result, "roe").value).toBeCloseTo(100 / 3)
  })

  it("mengembalikan null (bukan 0/∞) bila penyebut nol", () => {
    const result = computeFinancialRatios(
      input({ currentLiabilities: 0, totalEquity: 0, totalAssets: 0, revenue: 0 }),
    )

    for (const key of ["current-ratio", "quick-ratio", "debt-to-equity", "debt-to-asset", "gross-margin", "net-margin", "roa", "roe"]) {
      expect(byKey(result, key).value).toBeNull()
      expect(byKey(result, key).note).toBeTruthy()
      expect(formatRatio(byKey(result, key))).toBe("n/a")
    }
  })

  it("mengelompokkan rasio per kategori", () => {
    const result = computeFinancialRatios(input())

    expect(result.groups.map((group) => group.label)).toEqual(["Likuiditas", "Solvabilitas", "Profitabilitas"])
    expect(result.groups[0].rows).toHaveLength(2)
    expect(result.rows).toHaveLength(8)
  })

  it("memformat nilai sesuai satuannya", () => {
    const result = computeFinancialRatios(input())

    expect(formatRatio(byKey(result, "current-ratio"))).toBe("2,00×")
    expect(formatRatio(byKey(result, "net-margin"))).toBe("10,0%")
  })
})
