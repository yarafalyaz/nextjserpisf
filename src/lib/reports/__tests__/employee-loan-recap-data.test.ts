import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader rekap sisa pinjaman per karyawan (F-2026-10-25-046-S, AC-LR46-B2).
 * Builder murni terkunci di employee-loan-recap.test.ts; di sini dijaga:
 * izin view_employee_loans ditegakkan sebelum muat, getHrScope fail-closed
 * diterapkan ke where, filter departemen hanya menyempitkan, select tanpa
 * field gaji/slip, dan Decimal diteruskan apa adanya ke builder.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loanFindMany: vi.fn(),
  employeeFindFirst: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employeeLoan: { findMany: mocks.loanFindMany },
    employee: { findFirst: mocks.employeeFindFirst },
  },
}))

import { loadEmployeeLoanRecap } from "../employee-loan-recap-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const dec = (v: string) => ({ toString: () => v })

function loanRow(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: 1,
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: dec("10000000.00"),
    monthlyInstallment: dec("1000000.00"),
    weeklyInstallment: null,
    remainingAmount: dec("6000000.00"),
    employee: {
      name: "Budi",
      departmentId: 10,
      isActive: true,
      employmentEndedAt: null,
      department: { name: "Bengkel" },
    },
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
  mocks.loanFindMany.mockResolvedValue([])
  mocks.employeeFindFirst.mockResolvedValue(null)
})

describe("loadEmployeeLoanRecap — gerbang izin + scope (AC-LR46-B2)", () => {
  it("menegakkan view_employee_loans sebelum memuat; scope all tanpa kunci employeeId", async () => {
    const { scope, recap } = await loadEmployeeLoanRecap()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_employee_loans")
    expect(scope).toEqual({ kind: "all" })
    expect(recap.employees).toEqual([])
    const arg = mocks.loanFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({})
    // Select tanpa gaji/slip (BR-LR46-06).
    const selectJson = JSON.stringify(arg.select)
    expect(selectJson).not.toContain("baseSalary")
    expect(selectJson).not.toContain("loanDeduction")
    expect(arg.select.weeklyInstallment).toBe(true)
    expect(arg.select.employee.select.baseSalary).toBeUndefined()
  })

  it("roles rusak → getHrScope fail-closed self -1 → where employeeId -1, nol baris tampil", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: undefined })
    mocks.loanFindMany.mockResolvedValue([])
    const { scope, recap } = await loadEmployeeLoanRecap()
    expect(scope).toEqual({ kind: "self", employeeId: -1 })
    // Gerbang fail-closed ada di where persis: employeeId -1 tidak pernah
    // match id auto-increment mana pun di DB.
    expect(mocks.loanFindMany.mock.calls[0][0].where).toEqual({ employeeId: -1 })
    expect(recap.employees).toEqual([])
  })

  it("scope department lewat relasi employee.departmentId; departemen null jatuh ke diri sendiri", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["kepala_bengkel"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 10 })
    const { scope } = await loadEmployeeLoanRecap()
    expect(scope).toEqual({ kind: "department", departmentId: 10, employeeId: 7 })
    expect(mocks.loanFindMany.mock.calls[0][0].where).toEqual({
      employee: { departmentId: 10 },
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["kepala_bengkel"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 7, departmentId: null })
    mocks.loanFindMany.mockResolvedValue([])
    await loadEmployeeLoanRecap()
    expect(mocks.loanFindMany.mock.calls[0][0].where).toEqual({ employeeId: 7 })
  })

  it("filter departemen asing TIDAK memperluas scope department/self (irisan AND)", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["kepala_bengkel"] })
    mocks.employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 10 })
    await loadEmployeeLoanRecap({ departmentId: 99 })
    const where = mocks.loanFindMany.mock.calls[0][0].where
    expect(where.employee).toEqual({ departmentId: 10 })
    expect(where.AND).toEqual([{ employee: { departmentId: 99 } }])

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "5", roles: ["admin"] })
    mocks.loanFindMany.mockResolvedValue([])
    await loadEmployeeLoanRecap({ departmentId: 5 })
    expect(mocks.loanFindMany.mock.calls[0][0].where).toEqual({
      employee: { departmentId: 5 },
    })
  })

  it("Decimal diteruskan apa adanya; weekly null tetap null ke builder (tanpa konversi)", async () => {
    mocks.loanFindMany.mockResolvedValue([loanRow()])
    const { recap } = await loadEmployeeLoanRecap()
    const emp = recap.employees[0]
    expect(emp.totalPrincipalActive).toBe(10_000_000)
    expect(emp.totalRemainingActive).toBe(6_000_000)
    expect(emp.monthlyInstallmentTotal).toBe(1_000_000)
    expect(emp.weeklyInstallmentTotal).toBe(0)
    expect(emp.activeWithoutWeeklyCount).toBe(1)
    expect(emp.departmentName).toBe("Bengkel")
  })

  it("tanpa filter loanDate tahap 1 (EC-6): where tidak memuat loanDate", async () => {
    await loadEmployeeLoanRecap()
    const where = mocks.loanFindMany.mock.calls[0][0].where
    expect(JSON.stringify(where)).not.toContain("loanDate")
  })
})
