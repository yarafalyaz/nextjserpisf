import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader histori cicilan tahap 1 (F-2026-10-25-019-S, AC-LH-B4/B5).
 * Gerbang view_employee_loans + scope fail-closed; luar scope =
 * tidak ditemukan; select slip tanpa field gaji (BR-LH-09).
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loanFindFirst: vi.fn(),
  payrollFindMany: vi.fn(),
  employeeFindFirst: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employeeLoan: { findFirst: mocks.loanFindFirst },
    payroll: { findMany: mocks.payrollFindMany },
    employee: { findFirst: mocks.employeeFindFirst },
  },
}))

import { loadEmployeeLoanHistory } from "../employee-loan-history-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const dec = (v: string) => ({ toString: () => v })

function loanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    employeeId: 1,
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: dec("10000000.00"),
    monthlyInstallment: dec("1000000.00"),
    weeklyInstallment: null,
    remainingAmount: dec("7000000.00"),
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

describe("loadEmployeeLoanHistory — gerbang + scope (AC-LH-B4)", () => {
  it("menegakkan view_employee_loans; scope all mencari pinjaman tanpa kunci karyawan paksa", async () => {
    const res = await loadEmployeeLoanHistory(11)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_employee_loans")
    expect(res?.scope).toEqual({ kind: "all" })
    expect(res?.history.loanId).toBe(11)
    expect(res?.history.totalPaidDerived).toBe(3_000_000)
    const where = mocks.loanFindFirst.mock.calls[0][0].where
    expect(where.id).toBe(11)
  })

  it("luar scope = null (tidak ditemukan), slip tidak pernah dimuat", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["employee"], permissions: ["view_employee_loans"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 2, departmentId: 10 })
    mocks.loanFindFirst.mockResolvedValue(null)
    const res = await loadEmployeeLoanHistory(11)
    expect(res).toBeNull()
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
    const where = mocks.loanFindFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ id: 11, employeeId: 2 })
  })

  it("roles rusak fail-closed: scope self employeeId -1 → tidak ditemukan", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: undefined, permissions: ["view_employee_loans"] })
    mocks.loanFindFirst.mockResolvedValue(null)
    const res = await loadEmployeeLoanHistory(11)
    expect(res).toBeNull()
    const where = mocks.loanFindFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ employeeId: -1 })
  })
})

describe("loadEmployeeLoanHistory — muatan slip (AC-LH-B5, BR-LH-09)", () => {
  it("hanya slip paid ber-loanDeduction > 0 karyawan yang sama; select tanpa field gaji", async () => {
    mocks.payrollFindMany.mockResolvedValue([
      {
        id: 101,
        documentNo: "PAY-2026-001",
        period: "2026-02",
        status: "paid",
        paymentDate: d("2026-02-28"),
        loanDeduction: dec("1000000.00"),
      },
    ])
    const res = await loadEmployeeLoanHistory(11)
    expect(res?.history.entries).toHaveLength(1)
    const arg = mocks.payrollFindMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ employeeId: 1, status: "paid" })
    expect(arg.where.loanDeduction).toEqual({ gt: 0 })
    const selectKeys = Object.keys(arg.select)
    expect(selectKeys).not.toContain("baseSalary")
    expect(selectKeys).not.toContain("netSalary")
    expect(selectKeys).not.toContain("grossSalary")
    const loanSelect = Object.keys(mocks.loanFindFirst.mock.calls[0][0].select)
    expect(loanSelect).not.toContain("notes")
    expect(JSON.stringify(res)).not.toContain("baseSalary")
  })
})
