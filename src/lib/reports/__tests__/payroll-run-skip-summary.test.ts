import { describe, it, expect } from "vitest"
import { payrollSkipSummary } from "../payroll-run-skip-summary"
import { PAYROLL_RUN_SKIP_LABELS } from "../payroll-frequency"

describe("payrollSkipSummary (konsumen UI t_43bca8b5)", () => {
  it("label plafonPotongan PP 36/2021 tampil verbatim dari PAYROLL_RUN_SKIP_LABELS", () => {
    expect(payrollSkipSummary({ plafonPotongan: 2 })).toBe(
      "Potongan melebihi plafon 50% upah (PP 36/2021 Pasal 65): 2",
    )
  })

  it("alasan nol/absen disembunyikan; urutan kanonik PAYROLL_RUN_SKIP_LABELS", () => {
    expect(
      payrollSkipSummary({ pinjaman: 3, plafonPotongan: 0, frekuensiLain: 1, irisan: undefined }),
    ).toBe(`${PAYROLL_RUN_SKIP_LABELS.frekuensiLain}: 1; ${PAYROLL_RUN_SKIP_LABELS.pinjaman}: 3`)
    expect(payrollSkipSummary({})).toBe("")
    expect(payrollSkipSummary({ pinjaman: 0 })).toBe("")
  })
})
