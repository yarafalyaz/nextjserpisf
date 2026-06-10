/**
 * Pure asset-depreciation math, extracted from the monthly depreciation cron
 * (`src/app/api/cron/asset-depreciation/route.ts`) so it can be unit-tested
 * without standing up Prisma / the route handler.
 *
 * Behaviour is intentionally identical to the inline route logic:
 *  - Returns 0 when the asset should be SKIPPED (already at/below residual,
 *    or no usable method/rate).
 *  - Otherwise returns the monthly depreciation amount, floored so the asset
 *    never depreciates below its residual value.
 *
 * Money rounding (Decimal, toFixed(2)) is left to the caller; this helper
 * works in plain numbers so the math is easy to reason about and test.
 */

export interface DepreciationInput {
  /** Original acquisition cost. */
  purchaseCost: number
  /** Current book value before this period. */
  currentValue: number
  /** Salvage / residual value (depreciation floor). */
  residualValue: number
  /** "declining_balance" | "straight_line" | other. */
  depreciationMethod: string | null | undefined
  /** Category annual depreciation rate in PERCENT (e.g. 20 = 20%/yr), or null. */
  categoryDepreciationRate: number | null | undefined
  /** Category useful life in YEARS, or null. */
  categoryUsefulLife: number | null | undefined
}

/**
 * Compute the monthly depreciation amount for an asset.
 * Returns 0 to signal "skip this asset this period".
 */
export function computeMonthlyDepreciation(input: DepreciationInput): number {
  const {
    purchaseCost,
    currentValue,
    residualValue,
    depreciationMethod,
    categoryDepreciationRate,
    categoryUsefulLife,
  } = input

  // Never depreciate below the residual value (floor cannot be negative).
  const depreciableFloor = Math.max(0, residualValue)

  // Already fully depreciated -> skip.
  if (currentValue <= depreciableFloor) return 0

  let monthlyDepreciation = 0
  const isDeclining = depreciationMethod === "declining_balance"

  if (isDeclining && categoryDepreciationRate) {
    // Declining balance: book value * annualRate / 12 (book value method).
    const rate = Number(categoryDepreciationRate) / 100
    monthlyDepreciation = (currentValue * rate) / 12
  } else if (categoryUsefulLife && categoryUsefulLife > 0) {
    // Straight-line on depreciable base: (cost - residual) / months.
    monthlyDepreciation =
      (purchaseCost - depreciableFloor) / (categoryUsefulLife * 12)
  } else if (categoryDepreciationRate) {
    // Rate-based straight-line on depreciable base.
    const rate = Number(categoryDepreciationRate) / 100
    monthlyDepreciation = ((purchaseCost - depreciableFloor) * rate) / 12
  }

  if (monthlyDepreciation <= 0) return 0

  // Final period: clamp so book value lands exactly on the residual floor.
  if (currentValue - monthlyDepreciation < depreciableFloor) {
    monthlyDepreciation = currentValue - depreciableFloor
  }

  return monthlyDepreciation
}
