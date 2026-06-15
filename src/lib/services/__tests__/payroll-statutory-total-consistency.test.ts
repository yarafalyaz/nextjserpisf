import { describe, it, expect } from "vitest"
import { computeBpjsEmployee } from "../payroll-statutory.service"

describe("computeBpjsEmployee.total consistency", () => {
  it("total equals health + employment (rounded line items)", () => {
    // Regression: total used to be `round(health_raw + employment_raw)`,
    // while the returned line items were independently rounded. The two
    // rounding passes can disagree by ±1 rupiah on any salary whose raw
    // health or employment component ends in .5, which silently
    // double-counts (or drops) a rupiah in PPh21 and in the displayed
    // statutory deduction on payroll payslips.
    // hrm.actions.ts assembles `statutory = bpjsHealthEmployee + bpjsEmploymentEmployee + pph21`
    // (rounded line items), and computePph21Monthly is called with `bpjs.total`.
    // The two must agree to the rupiah.
    let mismatches = 0
    for (let base = 4_000_000; base <= 6_000_000; base += 10) {
      const r = computeBpjsEmployee(base)
      if (r.total !== r.health + r.employment) {
        mismatches++
      }
    }
    expect(mismatches).toBe(0)
  })

  it("regression: base salary 4,000,050 — total must equal health + employment", () => {
    // Exact reproducer from the scan: health=40001, employment=120002, sum=160003.
    // Buggy code returned total=160002 (rounded the raw sum instead).
    const r = computeBpjsEmployee(4_000_050)
    expect(r.health + r.employment).toBe(r.total)
  })

  it("regression: base salary 5,015,500 — total must equal health + employment", () => {
    const r = computeBpjsEmployee(5_015_500)
    expect(r.health + r.employment).toBe(r.total)
  })
})
