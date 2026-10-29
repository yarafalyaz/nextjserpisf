import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModel = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  })
  const rules = [
    { key: "bpjs_health_employee_rate", value: 0.01, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "bpjs_health_ceiling", value: 12000000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "bpjs_jht_employee_rate", value: 0.02, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "bpjs_jp_employee_rate", value: 0.01, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "bpjs_jp_ceiling", value: 10500000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "ptkp_single", value: 54000000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "ptkp_married_extra", value: 4500000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "ptkp_dependent_extra", value: 4500000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "occupational_cost_rate", value: 0.05, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    { key: "occupational_cost_ceiling_year", value: 6000000, effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
  ]
  const prismaMock: Record<string, any> = {
    payrollComponent: buildModel(),
    payrollComponentLine: buildModel(),
    payroll: buildModel(),
    employee: buildModel(),
    commissionPayable: buildModel(),
    // recalcDraftPayrollFromLines menyentuh model-model ini via buildPayrollWrite
    account: buildModel(),
    employeeLoan: buildModel(),
    overtimeRequest: buildModel(),
    appreciation: buildModel(),
    attendance: buildModel(),
    workSchedule: buildModel(),
    holiday: buildModel(),
    departmentHoliday: buildModel(),
    leaveRequest: buildModel(),
    payrollStatutoryRule: { ...buildModel(), findMany: vi.fn().mockResolvedValue(rules) },
    payrollTerBracket: {
      ...buildModel(),
      findMany: vi.fn(async (args: any) => [
        { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
      ]),
    },
    $transaction: vi.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : Promise.all(fn))),
    // Kunci baris dalam tx komisi (FOR UPDATE): mock terima raw lock.
    $executeRaw: vi.fn().mockResolvedValue(1),
  }
  return { prismaMock, requirePermissionMock: vi.fn(), rules }
})

const { prismaMock, requirePermissionMock } = mocks

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: vi.fn(),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/services/notification.service", () => ({ notifyAdmins: vi.fn(), createNotification: vi.fn() }))
vi.mock("@/lib/services/email", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown, fb?: string) => (e instanceof Error ? e.message : fb ?? "error"),
  isNextRedirectError: () => false,
}))

import * as actions from "../hrm.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const draftPayroll = {
  id: 55, employeeId: 7, period: "2026-05", status: "draft",
  startDate: new Date("2026-05-01"), endDate: new Date("2026-05-31T00:00:00.000Z"),
  baseSalary: 5000000, overtimeTotal: 0, appreciationTotal: 0,
  loanDeduction: 0, paymentDate: null, lateDeduction: 0, lateMinutes: 0,
  workingDays: 22, presentDays: 22, absentDays: 0, absentDeduction: 0,
  documentNo: "PAY-1",
}

const masterKomisi = {
  id: 9, name: "Komisi Penjualan", normalizedName: "komisi penjualan",
  kind: "earning", recurrence: "variable", isTaxable: true, isActive: true, accountId: 210212,
}

const payable = (extra: Record<string, unknown> = {}) => ({
  id: 101, salesInvoiceId: 5001, salesEmployeeId: 7,
  accruedAmount: 1000000, reversalAmount: 200000, paidAmount: 100000,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({ ...draftPayroll })
  prismaMock.payrollComponentLine.findMany.mockResolvedValue([])
  prismaMock.payrollComponentLine.findUnique.mockResolvedValue(null)
  prismaMock.payrollComponentLine.create.mockResolvedValue({ id: 31 })
  prismaMock.payrollComponentLine.delete.mockResolvedValue({})
  prismaMock.payrollComponentLine.update.mockResolvedValue({})
  prismaMock.payrollComponent.findFirst.mockResolvedValue({ ...masterKomisi })
  prismaMock.payroll.update.mockResolvedValue({ id: 55 })
  prismaMock.employee.findUnique.mockResolvedValue({ id: 7, baseSalary: 5000000, maritalStatus: "single", dependents: 0, employeeLoans: [] })
  prismaMock.commissionPayable.findUnique.mockResolvedValue(payable())
  prismaMock.payrollStatutoryRule.findMany.mockResolvedValue(mocks.rules)
  prismaMock.payrollTerBracket.findMany.mockImplementation(async (args: any) => [
    { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
  ])
})

describe("addPayrollCommissionLine", () => {
  it("payable beda employee ditolak", async () => {
    prismaMock.commissionPayable.findUnique.mockResolvedValue(payable({ salesEmployeeId: 999 }))
    const res = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "100000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("bukan milik karyawan")
    expect(prismaMock.payrollComponentLine.create).not.toHaveBeenCalled()
  })

  it("amount melebihi saldo (A−R−P) ditolak", async () => {
    // saldo = 1.000.000 − 200.000 − 100.000 = 700.000
    const res = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "700001" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("melebihi saldo")
    expect(prismaMock.payrollComponentLine.create).not.toHaveBeenCalled()
  })

  it("duplikat payable (sudah tertaut baris) ditolak", async () => {
    prismaMock.payrollComponentLine.findUnique.mockResolvedValue({ id: 31 })
    const res = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "100000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah dibayar")
    expect(prismaMock.payrollComponentLine.create).not.toHaveBeenCalled()
  })

  it("saldo Decimal sen-persis: amount persis saldo diterima, +1 sen ditolak", async () => {
    // Decimal(15,2) nyata dari Prisma = objek Decimal (toString string eksak),
    // bukan number: 0.30 − 0.10 − 0.10 float = 0.0999… akan menolak bayar pas.
    const dec = (s: string) => ({ toString: () => s })
    prismaMock.commissionPayable.findUnique.mockResolvedValue(
      payable({ accruedAmount: dec("0.30"), reversalAmount: dec("0.10"), paidAmount: dec("0.10") }),
    )
    const ok = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "0.10" }))
    expect(ok.success).toBe(true)
    const over = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "0.11" }))
    expect(over.success).toBe(false)
    expect(over.error).toContain("melebihi saldo")
  })

  it("master Komisi Penjualan tak-aktif/tak-ada ditolak fail-closed", async () => {
    prismaMock.payrollComponent.findFirst.mockResolvedValue(null)
    const res = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "100000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("master Komponen")
    expect(prismaMock.payrollComponentLine.create).not.toHaveBeenCalled()
  })

  it("sukses: tulis baris snapshot komisi + recalc slip", async () => {
    prismaMock.payrollComponentLine.findMany.mockResolvedValue([{
      id: 31, payrollId: 55, componentId: 9, componentNameSnapshot: "Komisi Penjualan",
      kindSnapshot: "earning", recurrenceSnapshot: "variable", isTaxableSnapshot: true,
      source: "commission", assignmentId: null, accountIdSnapshot: 210212,
      commissionPayableId: 101, commissionInvoiceId: 5001, amount: 700000,
    }])
    const res = await actions.addPayrollCommissionLine(55, fd({ commissionPayableId: "101", amount: "700000" }))
    expect(res.success).toBe(true)
    const data = prismaMock.payrollComponentLine.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      payrollId: 55,
      componentId: 9,
      componentNameSnapshot: "Komisi Penjualan",
      kindSnapshot: "earning",
      recurrenceSnapshot: "variable",
      isTaxableSnapshot: true,
      source: "commission",
      commissionPayableId: 101,
      commissionInvoiceId: 5001,
      accountIdSnapshot: 210212,
      amount: 700000,
    })
    const upd = prismaMock.payroll.update.mock.calls.at(-1)[0]
    expect(upd.data.allowances).toBe(700000)
  })
})

describe("batas baris komisi", () => {
  it("update nominal baris komisi ditolak (hapus + tambah ulang)", async () => {
    prismaMock.payrollComponentLine.findUnique.mockResolvedValue({ id: 31, payrollId: 55, commissionPayableId: 101 })
    const res = await actions.updatePayrollComponentLineAmount(31, fd({ amount: "500000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("tambah ulang")
    expect(prismaMock.payrollComponentLine.update).not.toHaveBeenCalled()
  })
})
