import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader slip mandiri (F-2026-10-25-009-S, AC-PS-1..4).
 * Dijaga: pemetaan self persis dari getHrScope (scope jabatan tidak
 * memperluas permukaan), fail-closed tanpa Employee tertaut / roles
 * rusak (query gaji tidak jalan), filter server employeeId+final saja,
 * detail by id/slug terikat pemilik + status, Decimal apa adanya.
 */

const mocks = vi.hoisted(() => ({
  payrollFindMany: vi.fn(),
  payrollFindFirst: vi.fn(),
  employeeFindFirst: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: { findMany: mocks.payrollFindMany, findFirst: mocks.payrollFindFirst },
    employee: { findFirst: mocks.employeeFindFirst },
  },
}))

import { loadOwnPayslipDetail, loadOwnPayslips, resolveOwnEmployeeId } from "../payslip-self-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const dec = (v: string) => ({ toString: () => v, valueOf: () => Number(v) })

function payRow(overrides: Record<string, unknown> = {}) {
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
    workingDays: 22,
    presentDays: 22,
    absentDays: 0,
    lateMinutes: 0,
    baseSalary: dec("5000000"),
    allowances: dec("500000"),
    deductions: dec("100000"),
    overtimeTotal: dec("200000"),
    appreciationTotal: dec("0"),
    loanDeduction: dec("150000"),
    lateDeduction: dec("25000"),
    absentDeduction: dec("0"),
    grossSalary: dec("5700000"),
    bpjsHealthEmployee: dec("50000"),
    bpjsEmploymentEmployee: dec("100000"),
    pph21: dec("75000"),
    netSalary: dec("5200000"),
    componentLines: [] as unknown[],
    ...overrides,
  }
}

const employeeUser = { id: "42", roles: ["karyawan"] }
const hrUser = { id: "9", roles: ["hr"] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.payrollFindMany.mockResolvedValue([])
  mocks.payrollFindFirst.mockResolvedValue(null)
  mocks.employeeFindFirst.mockResolvedValue({ id: 7 })
})

describe("resolveOwnEmployeeId — self persis, fail-closed", () => {
  it("scope self valid → employeeId scope", async () => {
    await expect(resolveOwnEmployeeId(employeeUser)).resolves.toBe(7)
    expect(mocks.employeeFindFirst).toHaveBeenCalledWith({
      where: { userId: 42 },
      select: { id: true, departmentId: true },
    })
  })

  it("tanpa Employee tertaut → null dan query gaji tidak jalan (AC-PS-3)", async () => {
    mocks.employeeFindFirst.mockResolvedValue(null)
    await expect(loadOwnPayslips(employeeUser)).resolves.toEqual([])
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
    await expect(loadOwnPayslipDetail(employeeUser, 1)).resolves.toBeNull()
    expect(mocks.payrollFindFirst).not.toHaveBeenCalled()
  })

  it("roles rusak (bukan array) → fail-closed -1, tanpa lookup lanjutan (BR-PS-03)", async () => {
    const broken = { id: "42", roles: undefined as unknown as string[] }
    await expect(resolveOwnEmployeeId(broken)).resolves.toBeNull()
    await expect(loadOwnPayslips(broken)).resolves.toEqual([])
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })

  it("AC-PS-4: role HR (scope all) tetap dipetakan ke Employee sendiri, bukan semua slip", async () => {
    mocks.employeeFindFirst.mockResolvedValue({ id: 3 })
    await loadOwnPayslips(hrUser)
    const where = mocks.payrollFindMany.mock.calls[0][0].where
    expect(where.employeeId).toBe(3)
    expect(where.status).toEqual({ in: ["approved", "paid"] })
  })

  it("role HR tanpa Employee tertaut → fail-closed walau scope all", async () => {
    mocks.employeeFindFirst.mockResolvedValue(null)
    await expect(loadOwnPayslips(hrUser)).resolves.toEqual([])
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })

  it("kepala_bengkel (department): hanya employeeId sendiri persis, bukan departemen", async () => {
    mocks.employeeFindFirst.mockResolvedValue({ id: 11, departmentId: 5 })
    await loadOwnPayslips({ id: "77", roles: ["kepala_bengkel"] })
    const where = mocks.payrollFindMany.mock.calls[0][0].where
    expect(where).toEqual({ employeeId: 11, status: { in: ["approved", "paid"] } })
  })
})

describe("loadOwnPayslips — filter server (AC-PS-1)", () => {
  it("where = employeeId self + status final, urut periode/id desc, tanpa field pinjaman rinci", async () => {
    mocks.payrollFindMany.mockResolvedValue([payRow()])
    const list = await loadOwnPayslips(employeeUser)
    const arg = mocks.payrollFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ employeeId: 7, status: { in: ["approved", "paid"] } })
    expect(arg.orderBy).toEqual([{ period: "desc" }, { id: "desc" }])
    expect(JSON.stringify(arg.select)).not.toContain("employeeLoan")
    expect(list).toHaveLength(1)
    expect(list[0].netSalary).toBe(5200000)
    expect(list[0].statusLabel).toBe("Dibayar")
  })

  it("baris draft/orang lain dari DB tetap dibuang builder (lapisan kedua)", async () => {
    mocks.payrollFindMany.mockResolvedValue([
      payRow({ id: 1 }),
      payRow({ id: 2, status: "draft" }),
      payRow({ id: 3, employeeId: 8 }),
    ])
    const list = await loadOwnPayslips(employeeUser)
    expect(list.map((r) => r.id)).toEqual([1])
  })
})

describe("loadOwnPayslipDetail — terikat pemilik + final (AC-PS-2/5)", () => {
  it("by id: where memuat id + employeeId self + status final; angka apa adanya", async () => {
    mocks.payrollFindFirst.mockResolvedValue(
      payRow({
        componentLines: [
          { componentNameSnapshot: "Tunjangan Makan", kindSnapshot: "earning", amount: dec("300000") },
        ],
      }),
    )
    const detail = await loadOwnPayslipDetail(employeeUser, 1)
    const where = mocks.payrollFindFirst.mock.calls[0][0].where
    expect(where).toEqual({ id: 1, employeeId: 7, status: { in: ["approved", "paid"] } })
    expect(detail?.netSalary).toBe(5200000)
    expect(detail?.componentLines[0].amount).toBe(300000)
  })

  it("by slug; kunci kosong/negatif → null tanpa query", async () => {
    mocks.payrollFindFirst.mockResolvedValue(payRow())
    await loadOwnPayslipDetail(employeeUser, "pay-1")
    expect(mocks.payrollFindFirst.mock.calls[0][0].where).toEqual({
      slug: "pay-1",
      employeeId: 7,
      status: { in: ["approved", "paid"] },
    })
    vi.clearAllMocks()
    await expect(loadOwnPayslipDetail(employeeUser, "")).resolves.toBeNull()
    await expect(loadOwnPayslipDetail(employeeUser, -3)).resolves.toBeNull()
    expect(mocks.payrollFindFirst).not.toHaveBeenCalled()
  })

  it("detail tidak ditemukan di DB (orang lain/draft tersaring where) → null", async () => {
    mocks.payrollFindFirst.mockResolvedValue(null)
    await expect(loadOwnPayslipDetail(employeeUser, 999)).resolves.toBeNull()
  })
})
