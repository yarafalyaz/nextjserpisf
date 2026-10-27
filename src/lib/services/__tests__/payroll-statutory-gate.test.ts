import { describe, it, expect } from "vitest"
import { payrollStatutoryGateError } from "../payroll-statutory.service"

// TASK-018 (2): gerbang statutori bersama untuk semua jalur approve/paid.
describe("payrollStatutoryGateError (TASK-018 gerbang bersama)", () => {
  it("slip bersih / snapshot kosong lolos (null)", () => {
    expect(payrollStatutoryGateError(null)).toBeNull()
    expect(payrollStatutoryGateError({ fromFallback: false, pph21Ter: { method: "TER", periodKind: "monthly" } })).toBeNull()
    expect(payrollStatutoryGateError({ fromFallback: false, pph21Ter: { method: "TER", periodKind: "final-resignation" } })).toBeNull()
  })

  it("Desember massal pending-final ditolak", () => {
    const err = payrollStatutoryGateError({ fromFallback: false, pph21Ter: { method: "TER", periodKind: "bulk-december-pending-final" } })
    expect(err).toContain("belum dihitung ulang Pasal 17")
  })

  it("metode legacy pra-TER ditolak", () => {
    const err = payrollStatutoryGateError({ fromFallback: false, pph21Ter: { method: "LEGACY_PRE_TER", periodKind: "monthly" } })
    expect(err).toContain("pra-TER")
  })

  it("parameter fallback 2024 ditolak", () => {
    const err = payrollStatutoryGateError({ fromFallback: true })
    expect(err).toContain("cadangan (2024)")
  })
})
