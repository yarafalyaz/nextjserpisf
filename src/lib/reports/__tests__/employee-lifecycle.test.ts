import { describe, expect, it } from "vitest"

import {
  buildEmployeeLifecycleAttention,
  evaluatePayrollEmploymentGate,
  payrollEndedEmployeeMessage,
  type EmployeeLifecycleInput,
} from "@/lib/reports/employee-lifecycle"

function emp(overrides: Partial<EmployeeLifecycleInput> = {}): EmployeeLifecycleInput {
  return {
    employeeId: 1,
    name: "Budi",
    employmentStatus: "PKWTT",
    contractEndDate: null,
    employmentEndedAt: null,
    endReason: null,
    isActive: true,
    ...overrides,
  }
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const today = d("2026-10-22")

describe("buildEmployeeLifecycleAttention (F-085-S)", () => {
  it("AC-EMP-2: berhenti tapi masih aktif payroll masuk daftar", () => {
    const rows = buildEmployeeLifecycleAttention(
      [emp({ employmentEndedAt: d("2026-10-15"), endReason: "resigned" })],
      today,
    )
    expect(rows.map((r) => r.kind)).toEqual(["endedButActive"])
    expect(rows[0].label).toBe("Sudah berhenti, masih aktif payroll")
    expect(rows[0].endReasonLabel).toBe("Mengundurkan Diri")
  })

  it("AC-EMP-9: PKWT 20 hari lagi tampil <=30; 31 hari lagi tidak", () => {
    const rows = buildEmployeeLifecycleAttention(
      [
        emp({ employeeId: 1, employmentStatus: "PKWT", contractEndDate: d("2026-11-11") }),
        emp({ employeeId: 2, employmentStatus: "PKWT", contractEndDate: d("2026-11-22") }),
      ],
      today,
    )
    expect(rows.filter((r) => r.kind === "contractExpiring").map((r) => r.employeeId)).toEqual([1])
    expect(rows.find((r) => r.employeeId === 1)?.label).toBe("Kontrak berakhir <= 30 hari")
  })

  it("PKWT lewat tanpa employmentEndedAt = kontrak lewat", () => {
    const rows = buildEmployeeLifecycleAttention(
      [emp({ employmentStatus: "PKWT", contractEndDate: d("2026-10-01") })],
      today,
    )
    expect(rows.map((r) => r.kind)).toEqual(["contractOverdue"])
  })

  it("AC-EMP-8: status null = Belum diatur, bukan PKWTT", () => {
    const rows = buildEmployeeLifecycleAttention([emp({ employmentStatus: null })], today)
    expect(rows.map((r) => r.kind)).toEqual(["statusUnset"])
    expect(rows[0].employmentStatusLabel).toBe("Belum diatur")
    expect(rows[0].label).toBe("Status belum diatur")
  })

  it("AC-EMP-7: keluaran tanpa field gaji/nominal", () => {
    const rows = buildEmployeeLifecycleAttention(
      [emp({ employmentEndedAt: d("2026-10-15"), endReason: "resigned" })],
      today,
    )
    const json = JSON.stringify(rows)
    expect(json).not.toMatch(/baseSalary|netSalary|salary|gaji/i)
    expect(Object.keys(rows[0])).not.toContain("baseSalary")
  })

  it("PKWT tanpa tanggal akhir tidak dikarang temuan kontrak (BR-EMP-04 tampil via status saja)", () => {
    const rows = buildEmployeeLifecycleAttention(
      [emp({ employmentStatus: "PKWT", contractEndDate: null })],
      today,
    )
    expect(rows).toEqual([])
  })
})

describe("evaluatePayrollEmploymentGate (Q-EMP-3)", () => {
  const ended = d("2026-10-15")

  it("AC-EMP-2: periode seluruhnya sesudah berhenti ditolak keras pesan §6 verbatim", () => {
    const gate = evaluatePayrollEmploymentGate({
      employmentEndedAt: ended,
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      isFinalSlip: false,
    })
    expect(gate.allowed).toBe(false)
    if (!gate.allowed) {
      expect(gate.reason).toBe("ended_before_period")
      expect(gate.message).toBe(payrollEndedEmployeeMessage(ended))
      expect(gate.message).toContain("Slip reguler tidak dapat dibuat; gunakan slip final masa terakhir.")
    }
  })

  it("periode memotong tanpa konfirmasi ditolak; dengan konfirmasi lolos", () => {
    const base = {
      employmentEndedAt: ended,
      periodStart: d("2026-10-01"),
      periodEnd: d("2026-10-31"),
      isFinalSlip: false,
    }
    expect(evaluatePayrollEmploymentGate(base).allowed).toBe(false)
    expect(
      evaluatePayrollEmploymentGate({ ...base, confirmCuttingPeriod: true }).allowed,
    ).toBe(true)
  })

  it("AC-EMP-3: slip final lolos walau periode sesudah berhenti", () => {
    expect(
      evaluatePayrollEmploymentGate({
        employmentEndedAt: ended,
        periodStart: d("2026-11-01"),
        periodEnd: d("2026-11-30"),
        isFinalSlip: true,
      }).allowed,
    ).toBe(true)
  })

  it("belum berhenti: selalu lolos", () => {
    expect(
      evaluatePayrollEmploymentGate({
        employmentEndedAt: null,
        periodStart: d("2026-11-01"),
        periodEnd: d("2026-11-30"),
        isFinalSlip: false,
      }).allowed,
    ).toBe(true)
  })

  it("berhenti tepat di awal periode berikutnya: periode berhenti utuh lolos tanpa konfirmasi", () => {
    expect(
      evaluatePayrollEmploymentGate({
        employmentEndedAt: d("2026-10-31"),
        periodStart: d("2026-10-01"),
        periodEnd: d("2026-10-31"),
        isFinalSlip: false,
        confirmCuttingPeriod: true,
      }).allowed,
    ).toBe(true)
    // berhenti 2026-11-01, periode Okt utuh sebelum berhenti -> lolos reguler
    expect(
      evaluatePayrollEmploymentGate({
        employmentEndedAt: d("2026-11-01"),
        periodStart: d("2026-10-01"),
        periodEnd: d("2026-10-31"),
        isFinalSlip: false,
      }).allowed,
    ).toBe(true)
  })
})

describe("buildEmployeeLifecycleAttention perluasan F-099-S Q-PROB-4", () => {
  it("probationDue: titik evaluasi lewat dan probation belum berakhir", () => {
    const rows = buildEmployeeLifecycleAttention(
      [
        emp({
          probationEndDate: d("2026-11-20"),
          probationNextDueDate: d("2026-10-20"),
          probationFinalDecision: null,
        }),
      ],
      today,
    )
    expect(rows.map((r) => r.kind)).toEqual(["probationDue"])
    expect(rows[0].label).toBe("Evaluasi percobaan jatuh tempo")
  })

  it("AC-PROB-5: probationOverdue menang atas probationDue, maks 1 baris", () => {
    const rows = buildEmployeeLifecycleAttention(
      [
        emp({
          probationEndDate: d("2026-10-21"),
          probationNextDueDate: d("2026-08-23"),
          probationFinalDecision: null,
        }),
      ],
      today,
    )
    expect(rows.map((r) => r.kind)).toEqual(["probationOverdue"])
    expect(rows[0].label).toBe("Percobaan lewat, belum diputus")
  })

  it("sesudah diputus final tidak ada baris probation", () => {
    const rows = buildEmployeeLifecycleAttention(
      [
        emp({
          probationEndDate: d("2026-10-21"),
          probationNextDueDate: d("2026-08-23"),
          probationFinalDecision: "passed",
        }),
      ],
      today,
    )
    expect(rows).toEqual([])
  })

  it("contractDecisionPending label verbatim", () => {
    const rows = buildEmployeeLifecycleAttention([emp({ contractDecisionPending: true })], today)
    expect(rows.map((r) => r.kind)).toEqual(["contractDecisionPending"])
    expect(rows[0].label).toBe("Keputusan kontrak menunggu penerapan")
  })

  it("tanpa field F-099-S perilaku lama utuh (tidak ada baris baru)", () => {
    expect(buildEmployeeLifecycleAttention([emp({})], today)).toEqual([])
  })
})
