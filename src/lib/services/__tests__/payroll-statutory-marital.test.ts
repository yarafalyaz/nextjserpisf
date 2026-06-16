import { describe, it, expect } from "vitest"
import { computeBpjsEmployee, computePph21Monthly } from "../payroll-statutory.service"

/**
 * Regression: PPh21 marital-status (PTKP) classification.
 *
 * The Employee form and Indonesian KTP records store human-readable marital
 * status strings, NOT the tax codes (TK/0, K/0) the test fixtures used. The
 * original `ptkpFor` substring check mis-classified two of the most common
 * real values:
 *
 *  - "Belum Kawin" / "Belum Menikah" (Indonesian for *single*) CONTAINS the
 *    substring "kawin", so it was flagged married → +4.5jt PTKP → the employee
 *    was UNDER-withheld every payslip (illegal under-payment of income tax).
 *  - "Menikah" (Indonesian for *married*) matched NONE of the married markers
 *    (no leading "k", no "kawin", no "married") → treated as single → the
 *    employee was OVER-withheld every payslip.
 *
 * Tax for a married employee is strictly lower than for a single one at the
 * same gross (higher PTKP), so we assert both the equivalence to the canonical
 * tax-code value AND the correct direction.
 */
describe("computePph21Monthly — marital status classification", () => {
  const GROSS = 10_000_000
  const BPJS = computeBpjsEmployee(GROSS).total

  const single = computePph21Monthly(GROSS, "TK/0", BPJS)
  const married = computePph21Monthly(GROSS, "K/0", BPJS)

  it("sanity: married pays strictly less tax than single at the same gross", () => {
    expect(married).toBeLessThan(single)
  })

  it("'Belum Kawin' (Indonesian: single) is taxed as SINGLE, not married", () => {
    expect(computePph21Monthly(GROSS, "Belum Kawin", BPJS)).toBe(single)
  })

  it("'Belum Menikah' (Indonesian: single) is taxed as SINGLE", () => {
    expect(computePph21Monthly(GROSS, "Belum Menikah", BPJS)).toBe(single)
  })

  it("'Tidak Kawin' (Indonesian: single) is taxed as SINGLE", () => {
    expect(computePph21Monthly(GROSS, "Tidak Kawin", BPJS)).toBe(single)
  })

  it("'Menikah' (Indonesian: married) is taxed as MARRIED", () => {
    expect(computePph21Monthly(GROSS, "Menikah", BPJS)).toBe(married)
  })

  it("'Married' (English) is taxed as MARRIED", () => {
    expect(computePph21Monthly(GROSS, "Married", BPJS)).toBe(married)
  })

  it("'Single' (English) is taxed as SINGLE", () => {
    expect(computePph21Monthly(GROSS, "Single", BPJS)).toBe(single)
  })

  it("'Cerai' / 'Divorced' use the single (TK) PTKP rate", () => {
    expect(computePph21Monthly(GROSS, "Cerai", BPJS)).toBe(single)
    expect(computePph21Monthly(GROSS, "Divorced", BPJS)).toBe(single)
  })

  it("preserves tax-code parity: 'kawin' and 'K/0' still classify as married", () => {
    expect(computePph21Monthly(GROSS, "kawin", BPJS)).toBe(married)
    expect(computePph21Monthly(GROSS, "K/1", BPJS)).toBe(married)
  })

  it("'TK/0' tax code remains single", () => {
    expect(computePph21Monthly(GROSS, "TK/0", BPJS)).toBe(single)
  })

  it("null / empty marital status defaults to single", () => {
    expect(computePph21Monthly(GROSS, null, BPJS)).toBe(single)
    expect(computePph21Monthly(GROSS, "", BPJS)).toBe(single)
  })
})
