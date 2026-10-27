import { describe, it, expect } from "vitest"
import {
  buildEmployeeLoanRecap,
  EMPLOYEE_LOAN_RECAP_NOTICE,
  type EmployeeLoanRecapRowInput,
} from "../employee-loan-recap"

/**
 * Builder murni rekap sisa pinjaman per karyawan
 * (F-2026-10-25-046-S, AC-LR46-B1/B3/B4/B5).
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function loanRow(
  overrides: Partial<EmployeeLoanRecapRowInput> = {},
): EmployeeLoanRecapRowInput {
  return {
    employeeId: 1,
    employeeName: "Budi",
    departmentId: 10,
    departmentName: "Bengkel",
    isActive: true,
    employmentEndedAt: null,
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: 10_000_000,
    monthlyInstallment: 1_000_000,
    weeklyInstallment: null,
    remainingAmount: 6_000_000,
    ...overrides,
  }
}

describe("buildEmployeeLoanRecap — populasi aktif (AC-LR46-B1, BR-LR46-02/03)", () => {
  it("Σ pokok/sisa/terbayar hanya dari pinjaman active; invariant terbayar = pokok − sisa", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ totalAmount: 10_000_000, remainingAmount: 6_000_000 }),
      loanRow({
        loanDate: d("2026-03-01"),
        totalAmount: 4_000_000,
        remainingAmount: 4_000_000,
      }),
    ])
    expect(recap.employees).toHaveLength(1)
    const emp = recap.employees[0]
    expect(emp.activeCount).toBe(2)
    expect(emp.totalPrincipalActive).toBe(14_000_000)
    expect(emp.totalRemainingActive).toBe(10_000_000)
    expect(emp.totalPaidDerived).toBe(4_000_000)
    expect(emp.totalPaidDerived).toBe(
      emp.totalPrincipalActive - emp.totalRemainingActive,
    )
    expect(emp.oldestActiveLoanDate).toEqual(d("2026-01-15"))
    // Invariant juga di total scope.
    expect(recap.totals.totalPaidDerived).toBe(
      recap.totals.totalPrincipalActive - recap.totals.totalRemainingActive,
    )
  })

  it("paid_off dan rejected TIDAK masuk Σ aktif dan tidak membentuk baris sendiri", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ status: "paid_off", totalAmount: 5_000_000, remainingAmount: 0 }),
      loanRow({ status: "rejected", totalAmount: 5_000_000, remainingAmount: 5_000_000 }),
      loanRow({ employeeId: 2, employeeName: "Sari", status: "paid_off", remainingAmount: 0 }),
    ])
    // Karyawan 1 tanpa pinjaman aktif/pending tidak tampil; karyawan 2 sama.
    expect(recap.employees).toEqual([])
    expect(recap.totals.activeCount).toBe(0)
    expect(recap.totals.totalRemainingActive).toBe(0)
  })

  it("pending hanya ember hitungan menunggu — tidak menaikkan Σ sisa (EC-4)", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ status: "pending", totalAmount: 99_000_000, remainingAmount: 99_000_000 }),
    ])
    expect(recap.employees).toHaveLength(1)
    const emp = recap.employees[0]
    expect(emp.pendingCount).toBe(1)
    expect(emp.activeCount).toBe(0)
    expect(emp.totalRemainingActive).toBe(0)
    expect(emp.totalPrincipalActive).toBe(0)
    expect(emp.totalPaidDerived).toBe(0)
    expect(recap.totals.pendingCount).toBe(1)
  })

  it("pinjaman aktif bersisa 0 tetap populasi aktif — tidak ditebak lunas (EC-1)", () => {
    const recap = buildEmployeeLoanRecap([loanRow({ remainingAmount: 0 })])
    expect(recap.employees[0].activeCount).toBe(1)
    expect(recap.employees[0].totalRemainingActive).toBe(0)
    expect(recap.employees[0].totalPaidDerived).toBe(10_000_000)
  })
})

describe("buildEmployeeLoanRecap — cicilan frekuensi terpisah (AC-LR46-B3, BR-LR46-04)", () => {
  it("weeklyInstallment NULL masuk ember tanpa jadwal mingguan; Σ mingguan tidak berubah, tanpa konversi bulanan", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ monthlyInstallment: 1_000_000, weeklyInstallment: null }),
      loanRow({
        loanDate: d("2026-02-01"),
        monthlyInstallment: 800_000,
        weeklyInstallment: 200_000,
      }),
    ])
    const emp = recap.employees[0]
    expect(emp.monthlyInstallmentTotal).toBe(1_800_000)
    // Bukan 1_000_000/4 + 200_000 — baris NULL nol kontribusi mingguan.
    expect(emp.weeklyInstallmentTotal).toBe(200_000)
    expect(emp.activeWithoutWeeklyCount).toBe(1)
    expect(recap.totals.activeWithoutWeeklyCount).toBe(1)
  })

  it("cicilan bulanan 0 tersimpan tampil apa adanya (EC-5)", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ monthlyInstallment: 0, weeklyInstallment: 0 }),
    ])
    expect(recap.employees[0].monthlyInstallmentTotal).toBe(0)
    expect(recap.employees[0].weeklyInstallmentTotal).toBe(0)
    expect(recap.employees[0].activeWithoutWeeklyCount).toBe(0)
  })
})

describe("buildEmployeeLoanRecap — status tak dikenal (AC-LR46-B4, BR-LR46-02)", () => {
  it("status di luar kosakata terhitung apa adanya, tidak masuk Σ aktif, tidak dipetakan paksa", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ status: "weird_status", totalAmount: 7_000_000, remainingAmount: 7_000_000 }),
      loanRow({ status: "active" }),
    ])
    const emp = recap.employees[0]
    expect(emp.unknownStatusCount).toBe(1)
    expect(emp.unknownStatuses).toEqual(["weird_status"])
    expect(emp.activeCount).toBe(1)
    expect(emp.totalRemainingActive).toBe(6_000_000)
    expect(recap.totals.unknownStatusCount).toBe(1)
  })
})

describe("buildEmployeeLoanRecap — anomali & karyawan nonaktif (EC-8, BR-LR46-07)", () => {
  it("sisa negatif tampil apa adanya tertanda anomali — TIDAK di-clamp ke 0", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ totalAmount: 1_000_000, remainingAmount: -250_000 }),
    ])
    const emp = recap.employees[0]
    expect(emp.totalRemainingActive).toBe(-250_000)
    expect(emp.totalPaidDerived).toBe(1_250_000)
    expect(emp.hasNegativeRemaining).toBe(true)
    expect(emp.negativeRemainingCount).toBe(1)
    expect(recap.totals.negativeRemainingCount).toBe(1)
  })

  it("karyawan nonaktif bersisa aktif tetap tampil tertanda; aktif normal tidak tertanda", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ isActive: false }),
      loanRow({
        employeeId: 2,
        employeeName: "Sari",
        employmentEndedAt: d("2026-09-30"),
      }),
      loanRow({ employeeId: 3, employeeName: "Andi", status: "pending" }),
    ])
    const byId = new Map(recap.employees.map((e) => [e.employeeId, e]))
    expect(byId.get(1)?.isInactiveWithActiveLoans).toBe(true)
    expect(byId.get(2)?.isInactiveWithActiveLoans).toBe(true)
    // Nonaktif tanpa pinjaman aktif (hanya pending) tidak tertanda sisa aktif.
    expect(byId.get(3)?.isInactiveWithActiveLoans).toBe(false)
    expect(recap.totals.inactiveWithActiveLoansCount).toBe(2)
    // Sisa karyawan nonaktif TIDAK dinolkan.
    expect(byId.get(1)?.totalRemainingActive).toBe(6_000_000)
  })
})

describe("buildEmployeeLoanRecap — agregasi & urutan (AC-LR46-B5, BR-LR46-08/10)", () => {
  it("dua pinjaman aktif satu karyawan teragregasi tanpa field kanal apa pun", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ totalAmount: 3_000_000, remainingAmount: 1_000_000 }),
      loanRow({
        loanDate: d("2026-05-01"),
        totalAmount: 2_000_000,
        remainingAmount: 2_000_000,
      }),
    ])
    const emp = recap.employees[0]
    expect(emp.totalPrincipalActive).toBe(5_000_000)
    expect(emp.totalRemainingActive).toBe(3_000_000)
    expect(JSON.stringify(recap)).not.toMatch(/mandiri|titipan|channel/i)
  })

  it("urutan Σ sisa terbesar dulu, seri nama lalu employeeId; total = Σ baris tampil", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ employeeId: 3, employeeName: "Cici", remainingAmount: 5_000_000 }),
      loanRow({ employeeId: 1, employeeName: "Budi", remainingAmount: 9_000_000 }),
      loanRow({ employeeId: 2, employeeName: "Budi", remainingAmount: 9_000_000 }),
    ])
    expect(recap.employees.map((e) => e.employeeId)).toEqual([1, 2, 3])
    expect(recap.totals.employeeCount).toBe(3)
    expect(recap.totals.totalRemainingActive).toBe(23_000_000)
  })

  it("payload tanpa field gaji/slip apa pun; notice verbatim anti-proyeksi", () => {
    const recap = buildEmployeeLoanRecap([loanRow()])
    const json = JSON.stringify(recap)
    expect(json).not.toContain("baseSalary")
    expect(json).not.toContain("loanDeduction")
    expect(recap.notice).toBe(EMPLOYEE_LOAN_RECAP_NOTICE)
    expect(recap.notice).toContain("bukan proyeksi potongan slip")
  })

  it("input kosong → rekap kosong jujur, bukan baris nol karangan (EC-7)", () => {
    const recap = buildEmployeeLoanRecap([])
    expect(recap.employees).toEqual([])
    expect(recap.totals.employeeCount).toBe(0)
    expect(recap.totals.totalRemainingActive).toBe(0)
  })

  it("karyawan tanpa departemen dipertahankan apa adanya untuk ember UI (EC-2)", () => {
    const recap = buildEmployeeLoanRecap([
      loanRow({ departmentId: null, departmentName: null }),
    ])
    expect(recap.employees[0].departmentId).toBeNull()
    expect(recap.employees[0].departmentName).toBeNull()
  })
})
