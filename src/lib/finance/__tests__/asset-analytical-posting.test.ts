import { describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"
import {
  analyticalMonthIndex,
  resolveAnalyticalAssetStatus,
} from "../asset-analytical-posting"

const dec = (v: string) => new Prisma.Decimal(v)

const base = {
  purchaseCost: dec("120000000"),
  bookValue: dec("120000000"),
  residualValue: dec("20000000"),
  totalEstimatedUnits: dec("10000"),
  usefulLifeMonths: 48,
  actualUnits: dec("250"),
  purchaseDate: new Date(Date.UTC(2026, 0, 15)),
  periodYear: 2026,
  periodMonth: 10,
  alreadyPosted: false,
  status: "active" as string | undefined,
}

describe("resolveAnalyticalAssetStatus (F-118-V Putusan 2)", () => {
  it("UOP computed from frozen params + named document", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "units_of_production",
    })
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toString()).toBe("2500000")
  })

  it("UOP without document rejects actualUnits (no silent zero)", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "units_of_production",
      actualUnits: null,
    })
    expect(r).toMatchObject({
      status: "reject",
      reason: "missing-parameter",
      parameter: "actualUnits",
    })
  })

  it("UOP without frozen total rejects totalEstimatedUnits", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "units_of_production",
      totalEstimatedUnits: null,
    })
    expect(r).toMatchObject({
      status: "reject",
      reason: "missing-parameter",
      parameter: "totalEstimatedUnits",
    })
  })

  it("SYD without frozen usefulLifeMonths rejects (missing-parameter)", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "sum_of_years_digits",
      usefulLifeMonths: null,
    })
    expect(r).toMatchObject({
      status: "reject",
      reason: "missing-parameter",
      parameter: "usefulLifeMonths",
    })
  })

  it("SYD computed from frozen months + derived monthIndex", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "sum_of_years_digits",
    })
    // k=10, N=48: S=1176, faktor (48-10+1)/1176 * 100.000.000 = 3.316.326,53
    expect(r.status).toBe("computed")
    if (r.status === "computed") expect(r.amount.toString()).toBe("3316326.53")
  })

  it("SYD before acquisition month skips not-started", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "sum_of_years_digits",
      periodYear: 2025,
      periodMonth: 12,
    })
    expect(r).toEqual({ status: "skip", reason: "not-started" })
  })

  it("held_for_sale freezes analytical running too (Putusan 4)", () => {
    for (const method of ["units_of_production", "sum_of_years_digits"]) {
      const r = resolveAnalyticalAssetStatus({
        ...base,
        depreciationMethod: method,
        status: "held_for_sale",
      })
      expect(r).toEqual({ status: "skip", reason: "held-for-sale" })
    }
  })

  it("disposed never computed, UOP and SYD (M-1 t_1d595a1e)", () => {
    for (const method of ["units_of_production", "sum_of_years_digits"]) {
      const r = resolveAnalyticalAssetStatus({
        ...base,
        depreciationMethod: method,
        status: "disposed",
      })
      expect(r).toEqual({ status: "skip", reason: "disposed" })
    }
    // Parameter lengkap + dokumen lengkap tetap skip — disposed menang.
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "units_of_production",
      status: "disposed",
      actualUnits: dec("1000"),
    })
    expect(r).toEqual({ status: "skip", reason: "disposed" })
  })

  it("already posted skips (idempotency per period)", () => {
    const r = resolveAnalyticalAssetStatus({
      ...base,
      depreciationMethod: "units_of_production",
      alreadyPosted: true,
    })
    expect(r).toEqual({ status: "skip", reason: "already-posted" })
  })

  it("unregistered status and unknown method reject loudly", () => {
    expect(
      resolveAnalyticalAssetStatus({
        ...base,
        depreciationMethod: "units_of_production",
        status: "dijual_sedang",
      }),
    ).toMatchObject({ status: "reject", reason: "unregistered-status" })
    expect(
      resolveAnalyticalAssetStatus({ ...base, depreciationMethod: null }),
    ).toMatchObject({
      status: "reject",
      reason: "missing-parameter",
      parameter: "depreciationMethod",
    })
    expect(
      resolveAnalyticalAssetStatus({ ...base, depreciationMethod: "straight_line" }),
    ).toMatchObject({ status: "reject", reason: "missing-parameter" })
  })
})

describe("analyticalMonthIndex", () => {
  it("1-based months since acquisition month (UTC)", () => {
    const d = new Date(Date.UTC(2026, 0, 31))
    expect(analyticalMonthIndex(d, 2026, 1)).toBe(1)
    expect(analyticalMonthIndex(d, 2027, 1)).toBe(13)
    expect(analyticalMonthIndex(d, 2025, 12)).toBeNull()
    expect(analyticalMonthIndex(null, 2026, 1)).toBeNull()
  })
})
