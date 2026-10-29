import { describe, expect, it } from "vitest"

import { taxAssessmentSchema } from "../tax-dispute.schemas"

const base = {
  assessmentNumber: "SKPKB-001",
  kind: "SKPKB",
  assessedAmount: "1000",
  disputedAmount: "1000",
}

describe("taxAssessmentSchema.taxPeriod — YYYY-MM bulan nyata", () => {
  it("menerima masa valid + kosong", () => {
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-09" }).success).toBe(true)
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-12" }).success).toBe(true)
    expect(taxAssessmentSchema.safeParse({ ...base }).success).toBe(true)
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "" }).success).toBe(true)
  })

  it("menolak bulan 13/00 yang lolos regex polos", () => {
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-13" }).success).toBe(false)
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-00" }).success).toBe(false)
  })

  it("menolak format bukan YYYY-MM", () => {
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-9" }).success).toBe(false)
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "09-2026" }).success).toBe(false)
    expect(taxAssessmentSchema.safeParse({ ...base, taxPeriod: "2026-09-01" }).success).toBe(false)
  })
})
