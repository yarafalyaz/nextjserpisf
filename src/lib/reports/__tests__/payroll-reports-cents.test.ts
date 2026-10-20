import { describe, expect, it } from "vitest"

import { buildPayrollByEmployee, type PayrollRowInput } from "@/lib/reports/payroll-reports"

function row(i: number): PayrollRowInput {
  return {
    employeeName: `Karyawan ${i}`,
    npwp: null,
    baseSalary: 0.24,
    allowances: 0.13,
    appreciation: 0,
    overtime: 0.24,
    deductions: 0.13,
    bpjsHealth: 0.13,
    bpjsEmployment: 0,
    pph21: 0.13,
    gross: 0.24,
    net: 0.24,
  }
}

describe("payroll-reports presisi sen", () => {
  it("total 17 slip x pecahan sen persis", () => {
    const rows = Array.from({ length: 17 }, (_, i) => row(i))
    const r = buildPayrollByEmployee({ rows, draftSlips: 0, duplicateEmployees: [] })
    expect(r.totals.baseSalary).toBe(4.08)
    expect(r.totals.allowances).toBe(2.21)
    expect(r.totals.overtime).toBe(4.08)
    expect(r.totals.deductions).toBe(2.21)
    expect(r.totals.bpjs).toBe(2.21)
    expect(r.totals.pph21).toBe(2.21)
    expect(r.totals.gross).toBe(4.08)
    expect(r.totals.net).toBe(4.08)
  })
})
