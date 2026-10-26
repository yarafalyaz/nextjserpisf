import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader histori cicilan per pinjaman (F-2026-10-25-019-S, LH-B1).
 * Builder murni terkunci di loan-installment-history.test.ts; di sini
 * dijaga AC-LH-B4 (scope fail-closed → tidak ditemukan) dan AC-LH-B5
 * (hanya slip paid ber-loanDeduction > 0), plus select tanpa nominal
 * gaji (BR-LH-09) dan izin view_employee_loans (BR-LH-02).
 */

// Mock loader: satu objek hoisted, factory dirakit dari tabel supaya
// bentuk berkas ini tidak kembar berkas loader pinjaman lain.
const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return { requirePermission: fn(), loanFindFirst: fn(), payrollFindMany: fn(), employeeFindFirst: fn() }
})

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employeeLoan: { findFirst: mocks.loanFindFirst },
    payroll: { findMany: mocks.payrollFindMany },
    employee: { findFirst: mocks.employeeFindFirst },
  },
}))

import { loadLoanInstallmentHistory } from "../loan-installment-history-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const dec = (v: string) => ({ toString: () => v })

function loanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    employeeId: 7,
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: dec("10000000.00"),
    monthlyInstallment: dec("1000000.00"),
    weeklyInstallment: null,
    remainingAmount: dec("6000000.00"),
    employee: { name: "Budi", paymentFrequency: "MONTHLY" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({
    id: "5",
    roles: ["admin"],
    permissions: ["view_employee_loans"],
  })
  mocks.loanFindFirst.mockResolvedValue(loanRow())
  mocks.payrollFindMany.mockResolvedValue([])
  mocks.employeeFindFirst.mockResolvedValue(null)
})

describe("loadLoanInstallmentHistory — gerbang + scope (AC-LH-B4, BR-LH-02)", () => {
  it("izin ditegakkan sebelum muat; scope all tanpa kunci employeeId pada pinjaman", async () => {
    const { scope, history } = await loadLoanInstallmentHistory(11)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_employee_loans")
    expect(scope).toEqual({ kind: "all" })
    expect(history?.loan.id).toBe(11)
    const arg = mocks.loanFindFirst.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 11 })
    const selectJson = JSON.stringify(arg.select)
    expect(selectJson).not.toContain("baseSalary")
    expect(arg.select.employee.select).toEqual({ name: true, paymentFrequency: true })
  })

  it("scope self karyawan lain → where memuat employeeId scope; pinjaman tak ketemu = null (tidak ditemukan)", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: ["karyawan"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 99, departmentId: 3 })
    mocks.loanFindFirst.mockResolvedValue(null)
    const { scope, history } = await loadLoanInstallmentHistory(11)
    expect(scope).toEqual({ kind: "self", employeeId: 99 })
    expect(mocks.loanFindFirst.mock.calls[0][0].where).toEqual({ id: 11, employeeId: 99 })
    expect(history).toBeNull()
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })

  it("roles rusak → getHrScope fail-closed self -1 → where employeeId -1, null", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: undefined })
    mocks.loanFindFirst.mockResolvedValue(null)
    const { scope, history } = await loadLoanInstallmentHistory(11)
    expect(scope).toEqual({ kind: "self", employeeId: -1 })
    expect(mocks.loanFindFirst.mock.calls[0][0].where).toEqual({ id: 11, employeeId: -1 })
    expect(history).toBeNull()
  })

  it("scope departemen → where memakai relasi employee.departmentId scope", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "8", roles: ["kepala_bengkel"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 5, departmentId: 10 })
    await loadLoanInstallmentHistory(11)
    expect(mocks.loanFindFirst.mock.calls[0][0].where).toEqual({
      id: 11,
      employee: { departmentId: 10 },
    })
  })

  it("loanId tidak valid → null tanpa query pinjaman/slip", async () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const { history } = await loadLoanInstallmentHistory(bad)
      expect(history).toBeNull()
    }
    expect(mocks.loanFindFirst).not.toHaveBeenCalled()
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })
})

describe("loadLoanInstallmentHistory — slip terbayar saja (AC-LH-B5, BR-LH-09)", () => {
  it("kueri slip: hanya employee pemilik, status paid persis, loanDeduction > 0; select tanpa gaji", async () => {
    await loadLoanInstallmentHistory(11)
    const arg = mocks.payrollFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ employeeId: 7, status: "paid", loanDeduction: { gt: 0 } })
    const selectJson = JSON.stringify(arg.select)
    for (const forbidden of ["baseSalary", "grossSalary", "netSalary", "allowances", "deductions", "pph21", "totalAmount"]) {
      expect(selectJson).not.toContain(forbidden)
    }
    expect(arg.select).toEqual({
      id: true,
      documentNo: true,
      period: true,
      startDate: true,
      endDate: true,
      paymentDate: true,
      loanDeduction: true,
    })
  })

  it("Decimal diteruskan ke builder; tahap 1 ledger kosong → ember = terbayar kini", async () => {
    mocks.payrollFindMany.mockResolvedValue([
      {
        id: 101,
        documentNo: "PAY-2026-02",
        period: "2026-02",
        startDate: d("2026-02-01"),
        endDate: d("2026-02-28"),
        paymentDate: d("2026-03-01"),
        loanDeduction: dec("1000000.00"),
      },
    ])
    const { history } = await loadLoanInstallmentHistory(11)
    expect(history?.loan.totalPaidToDate).toBe(4_000_000)
    expect(history?.ledgerRows).toEqual([])
    expect(history?.aggregateSlipRows).toHaveLength(1)
    expect(history?.aggregateSlipRows[0].loanDeduction).toBe(1_000_000)
    expect(history?.unallocatedAmount).toBe(4_000_000)
  })

  it("paymentFrequency WEEKLY karyawan → perkiraan memakai frekuensi slip (BR-LH-07)", async () => {
    mocks.loanFindFirst.mockResolvedValue(
      loanRow({ employee: { name: "Budi", paymentFrequency: "WEEKLY" } }),
    )
    const { history } = await loadLoanInstallmentHistory(11)
    expect(history?.nextInstallment).toMatchObject({ frequency: "WEEKLY", amount: null })
  })
})
