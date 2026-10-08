import { describe, it, expect, vi } from "vitest"

// Tests for VEH-07 vehicle fitment evaluation: most-specific-rule-wins matching
// over brand/model/variant + year/drivetrain/transmission, and `unknown` when no
// rule matches.

import { evaluateFitment, evaluateProductFitment } from "@/lib/services/vehicle-fitment.service"

function dbWithRules(rules: unknown[]) {
  return {
    vehicleFitmentRule: { findMany: vi.fn().mockResolvedValue(rules) },
    productMaterial: { findMany: vi.fn() },
  } as never
}

const baseRule = {
  itemId: 1,
  bomRevisionId: null,
  vehicleBrandId: null,
  vehicleModelId: null,
  vehicleVariantId: null,
  yearFrom: null,
  yearTo: null,
  drivetrain: null,
  transmission: null,
  source: null,
  notes: null,
}

describe("evaluateFitment", () => {
  it("returns unknown when no rule matches", async () => {
    const db = dbWithRules([])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleModelId: 5, year: 2018 },
    })
    expect(res.result).toBe("unknown")
    expect(res.ruleId).toBeNull()
  })

  it("picks the most specific rule (variant beats model beats brand)", async () => {
    const db = dbWithRules([
      { ...baseRule, id: 1, vehicleBrandId: 10, result: "compatible" },
      { ...baseRule, id: 2, vehicleModelId: 20, vehicleBrandId: 10, result: "incompatible" },
      { ...baseRule, id: 3, vehicleVariantId: 30, vehicleModelId: 20, vehicleBrandId: 10, result: "compatible" },
    ])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleBrandId: 10, vehicleModelId: 20, vehicleVariantId: 30 },
    })
    expect(res.result).toBe("compatible")
    expect(res.ruleId).toBe(3)
  })

  it("excludes rules whose year range does not cover the queried year", async () => {
    const db = dbWithRules([
      { ...baseRule, id: 1, vehicleModelId: 20, yearFrom: 2010, yearTo: 2015, result: "compatible" },
      { ...baseRule, id: 2, vehicleModelId: 20, yearFrom: 2016, yearTo: 2020, result: "incompatible" },
    ])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleModelId: 20, year: 2018 },
    })
    expect(res.result).toBe("incompatible")
    expect(res.ruleId).toBe(2)
  })

  it("requires a year when the rule scopes a year range", async () => {
    const db = dbWithRules([
      { ...baseRule, id: 1, vehicleModelId: 20, yearFrom: 2010, yearTo: 2015, result: "compatible" },
    ])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleModelId: 20, year: null },
    })
    expect(res.result).toBe("unknown")
  })

  it("matches drivetrain/transmission case-insensitively", async () => {
    const db = dbWithRules([
      { ...baseRule, id: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "compatible" },
    ])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleModelId: 20, drivetrain: "4wd", transmission: "manual" },
    })
    expect(res.result).toBe("compatible")
  })

  it("rejects a drivetrain mismatch", async () => {
    const db = dbWithRules([
      { ...baseRule, id: 1, vehicleModelId: 20, drivetrain: "2WD", result: "compatible" },
    ])
    const res = await evaluateFitment(db, {
      itemId: 1,
      configuration: { vehicleModelId: 20, drivetrain: "4WD" },
    })
    expect(res.result).toBe("unknown")
  })
})

describe("evaluateProductFitment", () => {
  it("evaluates every material line of the product", async () => {
    const db = {
      vehicleFitmentRule: {
        findMany: vi.fn(async (args: { where: { itemId: number } }) => {
          if (args.where.itemId === 1) {
            return [{ ...baseRule, id: 1, itemId: 1, vehicleModelId: 20, result: "compatible" }]
          }
          return []
        }),
      },
      productMaterial: {
        findMany: vi.fn().mockResolvedValue([{ itemId: 1 }, { itemId: 2 }]),
      },
    } as never

    const lines = await evaluateProductFitment(db, {
      productId: 100,
      configuration: { vehicleModelId: 20 },
    })

    expect(lines).toHaveLength(2)
    expect(lines.find((l) => l.itemId === 1)?.result).toBe("compatible")
    expect(lines.find((l) => l.itemId === 2)?.result).toBe("unknown")
  })
})
