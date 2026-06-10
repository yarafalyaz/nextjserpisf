import { describe, it, expect } from "vitest"
import { computeMonthlyDepreciation } from "../asset-depreciation"

/**
 * Characterization tests for the monthly asset-depreciation math used by the
 * cron at src/app/api/cron/asset-depreciation/route.ts. Expected values are
 * hand-computed and lock in the formula against future regressions.
 */
describe("computeMonthlyDepreciation", () => {
  describe("straight-line by useful life", () => {
    it("spreads (cost - residual) evenly over life-in-months", () => {
      // (12,000,000 - 2,000,000) / (5 years * 12) = 10,000,000 / 60 = 166,666.67
      const m = computeMonthlyDepreciation({
        purchaseCost: 12_000_000,
        currentValue: 12_000_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 5,
      })
      expect(m).toBeCloseTo(10_000_000 / 60, 2)
    })

    it("treats zero residual as full-cost base", () => {
      // 6,000,000 / (2 * 12) = 250,000
      const m = computeMonthlyDepreciation({
        purchaseCost: 6_000_000,
        currentValue: 6_000_000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 2,
      })
      expect(m).toBeCloseTo(250_000, 2)
    })
  })

  describe("rate-based straight-line", () => {
    it("uses (cost - residual) * annualRate% / 12 when no useful life", () => {
      // (10,000,000 - 0) * 0.20 / 12 = 166,666.67
      const m = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 10_000_000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: 20,
        categoryUsefulLife: null,
      })
      expect(m).toBeCloseTo((10_000_000 * 0.2) / 12, 2)
    })

    it("prefers useful life over rate when both present", () => {
      // useful life path wins: 12,000,000 / (10 * 12) = 100,000
      // (rate path would give 12,000,000 * 0.5 / 12 = 500,000)
      const m = computeMonthlyDepreciation({
        purchaseCost: 12_000_000,
        currentValue: 12_000_000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: 50,
        categoryUsefulLife: 10,
      })
      expect(m).toBeCloseTo(100_000, 2)
    })
  })

  describe("declining balance", () => {
    it("uses currentValue * annualRate% / 12 (book value shrinks each period)", () => {
      // 8,000,000 * 0.30 / 12 = 200,000 on the current book value
      const m = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 8_000_000,
        residualValue: 0,
        depreciationMethod: "declining_balance",
        categoryDepreciationRate: 30,
        categoryUsefulLife: 5, // ignored for declining when rate present
      })
      expect(m).toBeCloseTo((8_000_000 * 0.3) / 12, 2)
    })

    it("declining amount decreases as book value falls", () => {
      const first = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 10_000_000,
        residualValue: 0,
        depreciationMethod: "declining_balance",
        categoryDepreciationRate: 24,
        categoryUsefulLife: null,
      })
      const later = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 5_000_000,
        residualValue: 0,
        depreciationMethod: "declining_balance",
        categoryDepreciationRate: 24,
        categoryUsefulLife: null,
      })
      expect(later).toBeLessThan(first)
      expect(later).toBeCloseTo(first / 2, 2)
    })
  })

  describe("residual floor and skip conditions", () => {
    it("returns 0 (skip) when already at residual value", () => {
      const m = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 2_000_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 5,
      })
      expect(m).toBe(0)
    })

    it("returns 0 (skip) when below residual value", () => {
      const m = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 1_500_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 5,
      })
      expect(m).toBe(0)
    })

    it("clamps the final period so book value lands exactly on residual", () => {
      // Normal monthly would be 250,000 but only 100,000 remains above residual.
      // currentValue 2,100,000, residual 2,000,000 -> clamp to 100,000.
      const m = computeMonthlyDepreciation({
        purchaseCost: 6_000_000,
        currentValue: 2_100_000,
        residualValue: 2_000_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 2, // 6,000,000-2,000,000 = 4,000,000 / 24 = 166,666.67/mo
      })
      expect(m).toBeCloseTo(100_000, 2)
    })

    it("returns 0 (skip) when no usable method or rate", () => {
      const m = computeMonthlyDepreciation({
        purchaseCost: 10_000_000,
        currentValue: 10_000_000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: null,
      })
      expect(m).toBe(0)
    })

    it("treats negative residual as a zero floor", () => {
      // depreciableFloor = max(0, -500,000) = 0 -> full-cost base
      // 12,000,000 / (10 * 12) = 100,000
      const m = computeMonthlyDepreciation({
        purchaseCost: 12_000_000,
        currentValue: 12_000_000,
        residualValue: -500_000,
        depreciationMethod: "straight_line",
        categoryDepreciationRate: null,
        categoryUsefulLife: 10,
      })
      expect(m).toBeCloseTo(100_000, 2)
    })
  })
})
