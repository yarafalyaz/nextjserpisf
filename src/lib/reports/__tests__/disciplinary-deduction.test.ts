import { describe, expect, it } from "vitest"
import {
  disciplinaryDeductionForPeriod,
  disciplinaryDeductionIdempotencyKey,
  evaluateDisciplinaryDeductionDecision,
  evaluateSuspensionSnapshot,
  statutoryBases,
  suspensionPay,
  type DisciplinaryDecisionLike,
} from "@/lib/reports/disciplinary-deduction"

const decision: DisciplinaryDecisionLike = {
  id: 7,
  documentNo: "KEP-HR/2026/010",
  decidedAt: new Date("2026-10-20T00:00:00+07:00"),
  signedByEmployeeId: 3,
  kind: "denda",
  amount: 500_000,
}

describe("F-2026-10-25-020-V Putusan 3/6 — potongan hanya dari dokumen keputusan", () => {
  it("QA-DISC09-1: tanpa dokumen keputusan potongan Rp0 (SP bukan pemicu)", () => {
    expect(disciplinaryDeductionForPeriod({ decision: null, periodPay: 5_000_000, alreadyApplied: 0 }).amount).toBe(0)
    expect(evaluateDisciplinaryDeductionDecision(null).allowed).toBe(false)
    expect(evaluateDisciplinaryDeductionDecision({ ...decision, signedByEmployeeId: null }).allowed).toBe(false)
    expect(evaluateDisciplinaryDeductionDecision({ ...decision, documentNo: " " }).allowed).toBe(false)
  })

  it("plafon 50% per pembayaran termasuk potongan yang sudah diterapkan", () => {
    const r = disciplinaryDeductionForPeriod({ decision, periodPay: 800_000, alreadyApplied: 100_000 })
    expect(r.amount).toBe(300_000) // cap 400rb - sudah 100rb
    const full = disciplinaryDeductionForPeriod({ decision, periodPay: 800_000, alreadyApplied: 400_000 })
    expect(full.amount).toBe(0)
    expect(full.guard.allowed).toBe(false)
  })

  it("QA-DISC09-5: kunci idempotensi stabil per (keputusan, periode, jenis)", () => {
    const a = disciplinaryDeductionIdempotencyKey({ decisionId: 7, period: "2026-10", kind: "denda" })
    expect(a).toBe(disciplinaryDeductionIdempotencyKey({ decisionId: 7, period: "2026-10", kind: "denda" }))
    expect(a).not.toBe(disciplinaryDeductionIdempotencyKey({ decisionId: 7, period: "2026-10", kind: "ganti_rugi" }))
    expect(a).not.toBe(disciplinaryDeductionIdempotencyKey({ decisionId: 7, period: "2026-11", kind: "denda" }))
    expect(a).not.toBe(disciplinaryDeductionIdempotencyKey({ decisionId: 8, period: "2026-10", kind: "denda" }))
  })
})

describe("Putusan 1/2/4 — skorsing & dasar statutori aktual", () => {
  it("QA-DISC09-2: skorsing tanpa dokumen keputusan bertanda tangan = upah penuh", () => {
    expect(
      suspensionPay({ kind: "disiplin", treatment: "tidak_dibayar", hasSignedDecision: false, fullPay: 5_000_000 }).amount,
    ).toBe(5_000_000)
  })

  it("skorsing proses PHK selalu penuh; perlakuan lain ditolak", () => {
    expect(suspensionPay({ kind: "proses_phk", treatment: null, hasSignedDecision: false, fullPay: 5_000_000 }).amount).toBe(5_000_000)
    const bad = suspensionPay({ kind: "proses_phk", treatment: "tidak_dibayar", hasSignedDecision: true, fullPay: 5_000_000 })
    expect(bad.guard.allowed).toBe(false)
    expect(bad.amount).toBe(5_000_000)
  })

  it("skorsing disiplin proporsional dari snapshot dokumen", () => {
    expect(
      suspensionPay({ kind: "disiplin", treatment: "proporsional", hasSignedDecision: true, fullPay: 4_400_000, suspendedDays: 2, workingDays: 22 }).amount,
    ).toBe(4_000_000)
  })

  it("QA-DISC09-3/4: upah aktual 0 -> dasar PPh21 & BPJS 0; denda tidak mengurangi bruto", () => {
    expect(statutoryBases({ actualGrossPay: 0, disciplinaryDeduction: 0 })).toEqual({ pph21Gross: 0, bpjsWageBase: 0 })
    expect(statutoryBases({ actualGrossPay: 3_000_000, disciplinaryDeduction: 500_000 })).toEqual({
      pph21Gross: 3_000_000,
      bpjsWageBase: 3_000_000,
    })
  })
})

describe("snapshot skorsing pada dokumen keputusan", () => {
  it("kosong = tanpa skorsing; proses PHK dipaksa penuh; disiplin wajib klausul", () => {
    expect(evaluateSuspensionSnapshot({ suspensionKind: null, payTreatment: null, regulationReference: null }).allowed).toBe(true)
    expect(evaluateSuspensionSnapshot({ suspensionKind: "proses_phk", payTreatment: "tidak_dibayar", regulationReference: null }).allowed).toBe(false)
    expect(evaluateSuspensionSnapshot({ suspensionKind: "disiplin", payTreatment: "penuh", regulationReference: null }).allowed).toBe(false)
    expect(evaluateSuspensionSnapshot({ suspensionKind: "disiplin", payTreatment: "penuh", regulationReference: "PKB Pasal 9" }).allowed).toBe(true)
  })
})
