import type { AssetValueEventInput } from "@/lib/reports/deferred-tax-value-events"

/** Fixture peristiwa nilai bersama tes builder F-125-V + tes kartu BOT 2. */
export function valueEventFixture(overrides: Partial<AssetValueEventInput> = {}): AssetValueEventInput {
  return {
    assetCode: "AST-1",
    assetName: "Truk",
    categoryName: "Kendaraan",
    kind: "REVALUATION_UP",
    effectiveDate: new Date(Date.UTC(2026, 5, 30)),
    status: "POSTED",
    carryingBefore: 100_000_000,
    carryingAfter: 150_000_000,
    fiscalBaseBefore: 80_000_000,
    fiscalBaseAfter: 80_000_000,
    finalTaxAmount: null,
    depreciationTemporaryDifference: 0,
    profitBasisFrozen: false,
    facilityRateCase: false,
    ...overrides,
  }
}
