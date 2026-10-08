import { describe, it, expect } from "vitest"
import { computeBudgetRow, normaliseActual, isDebitNormal } from "../budget-actual"

/**
 * Regression tests for the Anggaran vs Realisasi realisasi sign convention.
 *
 * The bug: `sumNetByAccountAndCostCenter` returns signed (debit - credit) and
 * the report used it verbatim, so a REVENUE (credit-normal) budget that was
 * fully realised showed a NEGATIVE realisasi and a nonsensical % Terpakai.
 */

describe("isDebitNormal", () => {
  it("treats ASSET and EXPENSE as debit-normal", () => {
    expect(isDebitNormal("ASSET")).toBe(true)
    expect(isDebitNormal("EXPENSE")).toBe(true)
  })
  it("treats LIABILITY, EQUITY and REVENUE as credit-normal", () => {
    expect(isDebitNormal("LIABILITY")).toBe(false)
    expect(isDebitNormal("EQUITY")).toBe(false)
    expect(isDebitNormal("REVENUE")).toBe(false)
  })
})

describe("normaliseActual", () => {
  it("keeps the signed net for debit-normal accounts", () => {
    // Expense: debit 500, credit 100 -> net 400 spend
    expect(normaliseActual(400, "EXPENSE")).toBe(400)
  })
  it("negates the signed net for credit-normal accounts (revenue)", () => {
    // Revenue earned: credit 500, debit 100 -> net -400 -> realisasi +400
    expect(normaliseActual(-400, "REVENUE")).toBe(400)
  })
  it("defaults to debit-normal when the type is unknown", () => {
    expect(normaliseActual(250, null)).toBe(250)
    expect(normaliseActual(250, undefined)).toBe(250)
  })
})

describe("computeBudgetRow", () => {
  it("computes variance and percentage for an expense budget", () => {
    // Budget 1000, spend 400 -> variance +600 (under), 40% used
    const r = computeBudgetRow({ accountType: "EXPENSE", netSigned: 400, budgetAmount: 1000 })
    expect(r.actual).toBe(400)
    expect(r.variance).toBe(600)
    expect(r.percentage).toBe(40)
  })

  it("computes a POSITIVE realisasi for a fully-realised revenue budget", () => {
    // Revenue budget 1000, earned 1000 -> net -1000 -> realisasi +1000, 100% used
    const r = computeBudgetRow({ accountType: "REVENUE", netSigned: -1000, budgetAmount: 1000 })
    expect(r.actual).toBe(1000)
    expect(r.variance).toBe(0)
    expect(r.percentage).toBe(100)
  })

  it("avoids division by zero when the budget is zero", () => {
    const r = computeBudgetRow({ accountType: "EXPENSE", netSigned: 500, budgetAmount: 0 })
    expect(r.percentage).toBe(0)
    expect(r.variance).toBe(-500)
  })
})
