import { describe, expect, it } from "vitest"

import {
  buildOwnPayslipDetail,
  buildOwnPayslipList,
  OWN_PAYSLIP_FINAL_STATUSES,
  type OwnPayslipRowInput,
} from "../payslip-self"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function row(overrides: Partial<OwnPayslipRowInput> = {}): OwnPayslipRowInput {
  return {
    id: 1,
    slug: "pay-1",
    documentNo: "PAY-2026-09-001",
    employeeId: 7,
    period: "2026-09",
    startDate: d("2026-09-01"),
    endDate: d("2026-09-30"),
    status: "paid",
    paymentDate: d("2026-10-05"),
    baseSalary: 5000000,
    allowances: 500000,
    deductions: 100000,
    overtimeTotal: 200000,
    appreciationTotal: 0,
    loanDeduction: 150000,
    lateDeduction: 25000,
    absentDeduction: 0,
    grossSalary: 5700000,
    bpjsHealthEmployee: 50000,
    bpjsEmploymentEmployee: 100000,
    pph21: 75000,
    netSalary: 5200000,
    workingDays: 22,
    presentDays: 22,
    absentDays: 0,
    lateMinutes: 30,
    ...overrides,
  }
}

describe("payslip-self builder (F-2026-10-25-009-S)", () => {
  it("himpunan final persis approved+paid (BR-PS-01)", () => {
    expect(OWN_PAYSLIP_FINAL_STATUSES).toEqual(["approved", "paid"])
  })

  it("AC-PS-1: daftar hanya slip final milik sendiri; draft A + semua slip B dibuang", () => {
    const list = buildOwnPayslipList(7, [
      row({ id: 1, status: "paid" }),
      row({ id: 2, status: "approved", paymentDate: null }),
      row({ id: 3, status: "draft" }),
      row({ id: 4, status: "cancelled" }),
      row({ id: 5, employeeId: 8, status: "paid" }),
      row({ id: 6, employeeId: null, status: "paid" }),
    ])
    expect(list.map((r) => r.id)).toEqual([2, 1])
  })

  it("urut periode terbaru dulu, seri periode sama id terbesar dulu (EC-1)", () => {
    const list = buildOwnPayslipList(7, [
      row({ id: 1, period: "2026-08" }),
      row({ id: 2, period: "2026-09" }),
      row({ id: 3, period: "2026-09" }),
    ])
    expect(list.map((r) => r.id)).toEqual([3, 2, 1])
  })

  it("label status verbatim server + paymentDate approved tetap null (EC-3)", () => {
    const list = buildOwnPayslipList(7, [
      row({ id: 1, status: "approved", paymentDate: null }),
      row({ id: 2, status: "paid" }),
    ])
    expect(list.find((r) => r.id === 1)?.statusLabel).toBe("Disetujui")
    expect(list.find((r) => r.id === 1)?.paymentDate).toBeNull()
    expect(list.find((r) => r.id === 2)?.statusLabel).toBe("Dibayar")
  })

  it("fail-closed: selfEmployeeId <= 0 selalu kosong (BR-PS-03)", () => {
    expect(buildOwnPayslipList(-1, [row({})])).toEqual([])
    expect(buildOwnPayslipList(0, [row({})])).toEqual([])
    expect(buildOwnPayslipDetail(-1, { ...row({}), componentLines: [] })).toBeNull()
  })

  it("AC-PS-2: detail orang lain, draft sendiri, rekod yatim, null → null", () => {
    expect(buildOwnPayslipDetail(7, { ...row({ employeeId: 8 }), componentLines: [] })).toBeNull()
    expect(buildOwnPayslipDetail(7, { ...row({ status: "draft" }), componentLines: [] })).toBeNull()
    expect(buildOwnPayslipDetail(7, { ...row({ employeeId: null }), componentLines: [] })).toBeNull()
    expect(buildOwnPayslipDetail(7, null)).toBeNull()
  })

  it("AC-PS-5: detail meneruskan angka rekod apa adanya + componentLines (BR-PS-04/06)", () => {
    const detail = buildOwnPayslipDetail(7, {
      ...row({}),
      componentLines: [
        { componentNameSnapshot: "Tunjangan Makan", kindSnapshot: "earning", amount: 300000 },
        { componentNameSnapshot: "Potongan Pinjaman", kindSnapshot: "deduction", amount: 150000 },
      ],
    })
    expect(detail).not.toBeNull()
    expect(detail?.grossSalary).toBe(5700000)
    expect(detail?.bpjsHealthEmployee).toBe(50000)
    expect(detail?.bpjsEmploymentEmployee).toBe(100000)
    expect(detail?.pph21).toBe(75000)
    expect(detail?.netSalary).toBe(5200000)
    expect(detail?.loanDeduction).toBe(150000)
    expect(detail?.componentLines).toHaveLength(2)
  })
})
