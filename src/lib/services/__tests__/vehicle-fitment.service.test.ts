import { describe, it, expect, vi } from "vitest"

// Tests for VEH-07 vehicle fitment evaluation: most-specific-rule-wins matching
// over brand/model/variant + year/drivetrain/transmission, and `unknown` when no
// rule matches.

import {
  configurationFromCustomerVehicle,
  evaluateFitment,
  evaluateProductFitment,
  findFitmentConflicts,
  loadFitmentConflicts,
  stampQuotationFitmentSnapshot,
  stampWorkOrderFitmentSnapshot,
} from "@/lib/services/vehicle-fitment.service"

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

describe("findFitmentConflicts / loadFitmentConflicts (F-2026-10-21-025)", () => {
  const candidate = {
    itemId: 1,
    vehicleModelId: 20,
    drivetrain: "4WD",
    transmission: "Manual",
    result: "compatible",
  }

  it("flags identical scope + same specificity + opposite result", () => {
    const conflicts = findFitmentConflicts(candidate, [
      { ...baseRule, id: 7, itemId: 1, vehicleModelId: 20, drivetrain: "4wd", transmission: "manual", result: "incompatible", source: "katalog" },
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      ruleId: 7,
      candidateResult: "compatible",
      conflictResult: "incompatible",
      specificity: 6, // model 4 + drivetrain 1 + transmission 1
      source: "katalog",
      scope: { itemId: 1, vehicleModelId: 20, drivetrain: "4wd", transmission: "manual" },
    })
  })

  it("ignores same result, unknown either side, and excluded self", () => {
    const rules = [
      { ...baseRule, id: 1, itemId: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "compatible" },
      { ...baseRule, id: 2, itemId: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "unknown" },
    ]
    expect(findFitmentConflicts(candidate, rules)).toHaveLength(0)
    expect(findFitmentConflicts({ ...candidate, result: "unknown" }, [
      { ...baseRule, id: 3, itemId: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "incompatible" },
    ])).toHaveLength(0)
    expect(findFitmentConflicts(candidate, [
      { ...baseRule, id: 9, itemId: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "incompatible" },
    ], 9)).toHaveLength(0)
  })

  it("ignores scope differing in one dimension even at same specificity", () => {
    // year-bounded rule scores same total (model 4 + year 1) as candidate's
    // drivetrain point is traded, but scope is not identical -> no conflict.
    const conflicts = findFitmentConflicts(candidate, [
      { ...baseRule, id: 4, itemId: 1, vehicleModelId: 20, yearFrom: 2015, transmission: "Manual", result: "incompatible" },
      { ...baseRule, id: 5, itemId: 2, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "incompatible" },
      { ...baseRule, id: 6, itemId: 1, vehicleModelId: 20, drivetrain: "2WD", transmission: "Manual", result: "incompatible" },
    ])
    expect(conflicts).toHaveLength(0)
  })

  it("loader queries only active rules of the candidate item", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { ...baseRule, id: 7, itemId: 1, vehicleModelId: 20, drivetrain: "4WD", transmission: "Manual", result: "incompatible" },
    ])
    const db = { vehicleFitmentRule: { findMany } } as never
    const conflicts = await loadFitmentConflicts(db, { candidate })
    expect(findMany).toHaveBeenCalledWith({
      where: { itemId: 1, isActive: true },
      orderBy: { id: "asc" },
    })
    expect(conflicts.map((c) => c.ruleId)).toEqual([7])
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

// F-2026-10-22-063-S: helper konfigurasi + snapshot peringatan per baris.
const chainRow = {
  vehicle: {
    year: 2019,
    variant: {
      id: 30,
      drivetrain: "4WD",
      transmission: "Manual",
      model: { id: 20, vehicleBrandId: 10 },
    },
  },
}

describe("configurationFromCustomerVehicle (F-063-S)", () => {
  it("merakit konfigurasi dari rantai master existing", async () => {
    const db = {
      customerVehicle: { findFirst: vi.fn().mockResolvedValue(chainRow) },
    } as never
    const cfg = await configurationFromCustomerVehicle(db, 7)
    expect(cfg).toEqual({
      vehicleBrandId: 10,
      vehicleModelId: 20,
      vehicleVariantId: 30,
      year: 2019,
      drivetrain: "4WD",
      transmission: "Manual",
    })
  })

  it("null bila kendaraan pelanggan tidak ditemukan", async () => {
    const db = {
      customerVehicle: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never
    expect(await configurationFromCustomerVehicle(db, 99)).toBeNull()
  })
})

describe("stamp fitment snapshot (F-063-S)", () => {
  it("quotation: tulis hasil+ruleId, lewati baris itemId null (BR-FIT-04)", async () => {
    const updates: unknown[] = []
    const db = {
      customerVehicle: { findFirst: vi.fn().mockResolvedValue(chainRow) },
      quotation: {
        findFirst: vi.fn().mockResolvedValue({
          customerVehicleId: 7,
          sections: [
            {
              items: [
                { id: 1, itemId: 1 },
                { id: 2, itemId: null },
              ],
            },
          ],
        }),
      },
      vehicleFitmentRule: {
        findMany: vi.fn().mockResolvedValue([
          { ...baseRule, id: 9, itemId: 1, vehicleModelId: 20, result: "incompatible" },
        ]),
      },
      quotationItem: {
        update: vi.fn(async (args: unknown) => {
          updates.push(args)
          return args
        }),
      },
    } as never
    await stampQuotationFitmentSnapshot(db, 5)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      where: { id: 1 },
      data: { fitmentResult: "incompatible", fitmentRuleId: 9 },
    })
    expect(
      (updates[0] as { data: { fitmentEvaluatedAt: unknown } }).data
        .fitmentEvaluatedAt,
    ).toBeInstanceOf(Date)
  })

  it("quotation tanpa kendaraan: diam, tanpa evaluasi (W1)", async () => {
    const findRules = vi.fn()
    const db = {
      customerVehicle: { findFirst: vi.fn() },
      quotation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ customerVehicleId: null, sections: [] }),
      },
      vehicleFitmentRule: { findMany: findRules },
      quotationItem: { update: vi.fn() },
    } as never
    await stampQuotationFitmentSnapshot(db, 5)
    expect(findRules).not.toHaveBeenCalled()
  })

  it("evaluasi gagal tidak melempar — simpan tetap jalan (BR-FIT-09)", async () => {
    const db = {
      customerVehicle: {
        findFirst: vi.fn().mockRejectedValue(new Error("db putus")),
      },
      quotation: {
        findFirst: vi.fn().mockResolvedValue({
          customerVehicleId: 7,
          sections: [{ items: [{ id: 1, itemId: 1 }] }],
        }),
      },
      vehicleFitmentRule: { findMany: vi.fn() },
      quotationItem: { update: vi.fn() },
    } as never
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(stampQuotationFitmentSnapshot(db, 5)).resolves.toBeUndefined()
    spy.mockRestore()
  })

  it("WO: lewati baris jasa itemId=0, tanpa aturan -> unknown ruleId null", async () => {
    const updates: unknown[] = []
    const db = {
      customerVehicle: { findFirst: vi.fn().mockResolvedValue(chainRow) },
      workOrder: {
        findFirst: vi.fn().mockResolvedValue({
          customerVehicleId: 7,
          bomRevisionId: null,
          // Prisma where itemId>0 menyaring baris jasa 0 di query;
          // mock meniru hasil tersaring itu.
          items: [{ id: 2, itemId: 3 }],
        }),
      },
      vehicleFitmentRule: { findMany: vi.fn().mockResolvedValue([]) },
      workOrderItem: {
        update: vi.fn(async (args: unknown) => {
          updates.push(args)
          return args
        }),
      },
    } as never
    await stampWorkOrderFitmentSnapshot(db, 8)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      where: { id: 2 },
      data: { fitmentResult: "unknown", fitmentRuleId: null },
    })
  })
})
