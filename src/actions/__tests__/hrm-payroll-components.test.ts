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
    employeePayrollComponent: buildModel(),
    salaryAdjustment: buildModel(),
    payrollComponentLine: buildModel(),
    payroll: buildModel(),
    employee: buildModel(),
    account: buildModel(),
    employeeLoan: buildModel(),
    overtimeRequest: buildModel(),
    appreciation: buildModel(),
    attendance: buildModel(),
    workSchedule: buildModel(),
    holiday: buildModel(),
    departmentHoliday: buildModel(),
    leaveRequest: buildModel(),
    setting: buildModel(),
    systemSetting: buildModel(),
    payrollStatutoryRule: { ...buildModel(), findMany: vi.fn().mockResolvedValue(rules) },
    payrollTerBracket: {
      ...buildModel(),
      findMany: vi.fn(async (args: any) => [
        { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
      ]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : Promise.all(fn))),
  }
  return {
    prismaMock,
    requirePermissionMock: vi.fn(),
    rules,
  }
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
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("PAY-202605-0001"),
  generateDocumentNumberBatch: vi.fn((...a: unknown[]) => {
    const n = Number(a[1]) || 0
    return Promise.resolve(Array.from({ length: n }, (_, i) => `DOC-${i + 1}`))
  }),
}))
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

const END = new Date("2026-05-31T00:00:00.000Z")
function assignment(id: number, componentId: number, name: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    employeeId: 7,
    componentId,
    defaultAmount: amount,
    effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
    effectiveTo: null,
    component: { name, kind: "earning", recurrence: "fixed", isTaxable: true, accountId: null },
    ...extra,
  }
}

function deductionAssignment(id: number, componentId: number, name: string, amount: number) {
  return assignment(id, componentId, name, amount, {
    component: { name, kind: "deduction", recurrence: "fixed", isTaxable: false, accountId: null },
  })
}

const draftPayroll = {
  id: 55, employeeId: 7, period: "2026-05", status: "draft",
  startDate: new Date("2026-05-01"), endDate: END,
  baseSalary: 5000000, overtimeTotal: 0, appreciationTotal: 0,
  loanDeduction: 0, paymentDate: null, lateDeduction: 0, lateMinutes: 0,
  workingDays: 22, presentDays: 22, absentDays: 0, absentDeduction: 0,
  documentNo: "PAY-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  // restore defaults cleared by clearAllMocks
  prismaMock.payrollComponent.findFirst.mockResolvedValue(null)
  prismaMock.payrollComponent.findUnique.mockResolvedValue(null)
  prismaMock.payrollComponent.create.mockResolvedValue({ id: 11 })
  prismaMock.payrollComponent.update.mockResolvedValue({ id: 11 })
  prismaMock.payrollComponent.findMany.mockResolvedValue([])
  prismaMock.employeePayrollComponent.findFirst.mockResolvedValue(null)
  prismaMock.employeePayrollComponent.findMany.mockResolvedValue([])
  prismaMock.employeePayrollComponent.create.mockResolvedValue({ id: 21 })
  prismaMock.payrollComponentLine.findMany.mockResolvedValue([])
  prismaMock.payrollComponentLine.findFirst.mockResolvedValue(null)
  prismaMock.payrollComponentLine.create.mockResolvedValue({ id: 31 })
  prismaMock.payrollComponentLine.createMany.mockResolvedValue({ count: 2 })
  prismaMock.payrollComponentLine.delete.mockResolvedValue({})
  prismaMock.payrollComponentLine.update.mockResolvedValue({})
  prismaMock.payroll.findFirst.mockResolvedValue(null)
  prismaMock.payroll.findUnique.mockResolvedValue({ ...draftPayroll })
  prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({ ...draftPayroll })
  prismaMock.payroll.create.mockResolvedValue({ id: 55 })
  prismaMock.payroll.update.mockResolvedValue({ id: 55 })
  prismaMock.payroll.findMany.mockResolvedValue([])
  prismaMock.payroll.createMany.mockResolvedValue({ count: 1 })
  prismaMock.employee.findUnique.mockResolvedValue({ id: 7, baseSalary: 5000000, maritalStatus: "single", dependents: 0, employeeLoans: [] })
  prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
  prismaMock.employee.findMany.mockResolvedValue([])
  prismaMock.employeeLoan.findMany.mockResolvedValue([])
  prismaMock.overtimeRequest.findMany.mockResolvedValue([])
  prismaMock.appreciation.findMany.mockResolvedValue([])
  prismaMock.attendance.findMany.mockResolvedValue([])
  prismaMock.workSchedule.findMany.mockResolvedValue([])
  prismaMock.holiday.findMany.mockResolvedValue([])
  prismaMock.departmentHoliday.findMany.mockResolvedValue([])
  prismaMock.leaveRequest.findMany.mockResolvedValue([])
  prismaMock.account.findUnique.mockResolvedValue({ id: 601 })
  prismaMock.payrollStatutoryRule.findMany.mockResolvedValue(mocks.rules)
  prismaMock.payrollTerBracket.findMany.mockImplementation(async (args: any) => [
    { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
  ])
  prismaMock.$transaction.mockImplementation(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : Promise.all(fn)))
})

describe("F-027 master komponen", () => {
  it("nama aktif ganda beda kapital ditolak", async () => {
    prismaMock.payrollComponent.findFirst.mockResolvedValue({ id: 99 })
    const res = await actions.createPayrollComponent(fd({ name: "Transport", kind: "earning", recurrence: "fixed", isTaxable: "true" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah digunakan")
    expect(prismaMock.payrollComponent.create).not.toHaveBeenCalled()
  })

  it("buat komponen: deduction dipaksa tidak kena pajak", async () => {
    const res = await actions.createPayrollComponent(fd({ name: "Potongan Koperasi", kind: "deduction", recurrence: "variable", isTaxable: "true" }))
    expect(res.success).toBe(true)
    expect(prismaMock.payrollComponent.create.mock.calls[0][0].data).toMatchObject({
      normalizedName: "potongan koperasi", kind: "deduction", isTaxable: false,
    })
  })

  it("scope non-all ditolak kelola master", async () => {
    requirePermissionMock.mockResolvedValue({ id: 2, roles: ["employee"] })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 2, departmentId: 1 })
    const res = await actions.createPayrollComponent(fd({ name: "X", kind: "earning", recurrence: "fixed" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("cakupan semua karyawan")
  })
})

describe("F-027 penugasan", () => {
  it("overlap (employee,component) ditolak", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ id: 7 })
    prismaMock.payrollComponent.findUnique.mockResolvedValue({ id: 3, isActive: true, recurrence: "fixed" })
    prismaMock.employeePayrollComponent.findFirst.mockResolvedValue({ id: 8 })
    const res = await actions.assignEmployeePayrollComponent(fd({
      employeeId: "7", componentId: "3", defaultAmount: "500000", effectiveFrom: "2026-05-01",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("tumpang tindih")
    expect(prismaMock.employeePayrollComponent.create).not.toHaveBeenCalled()
  })

  it("komponen variable ditolak untuk penugasan", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ id: 7 })
    prismaMock.payrollComponent.findUnique.mockResolvedValue({ id: 3, isActive: true, recurrence: "variable" })
    const res = await actions.assignEmployeePayrollComponent(fd({
      employeeId: "7", componentId: "3", defaultAmount: "500000", effectiveFrom: "2026-05-01",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("tetap")
  })

  it("nominal negatif ditolak", async () => {
    const res = await actions.assignEmployeePayrollComponent(fd({
      employeeId: "7", componentId: "3", defaultAmount: "-1", effectiveFrom: "2026-05-01",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("negatif")
  })

  it("nominal format Indonesia tersimpan penuh di penugasan", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ id: 7 })
    prismaMock.payrollComponent.findUnique.mockResolvedValue({ id: 3, isActive: true, recurrence: "fixed" })
    prismaMock.employeePayrollComponent.findFirst.mockResolvedValue(null)
    prismaMock.employeePayrollComponent.create.mockResolvedValue({ id: 99 })
    const res = await actions.assignEmployeePayrollComponent(fd({
      employeeId: "7", componentId: "3", defaultAmount: "2.000.000", effectiveFrom: "2026-05-01",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.employeePayrollComponent.create.mock.calls[0][0].data.defaultAmount).toBe(2000000)
  })

  it("nominal tak terbaca ditolak di penugasan", async () => {
    const res = await actions.assignEmployeePayrollComponent(fd({
      employeeId: "7", componentId: "3", defaultAmount: "abc", effectiveFrom: "2026-05-01",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("negatif")
  })
})

describe("F-027 tarikan generate", () => {
  it("AC-1: 2 penugasan tetap tertarik persis, allowances 800rb (processPayroll)", async () => {
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 500000),
      assignment(22, 4, "Makan", 300000),
    ])
    const res = await actions.processPayroll(fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000", allowances: "999999", deductions: "0",
    }))
    expect(res.success).toBe(true)
    const createArg = prismaMock.payroll.create.mock.calls.at(-1)[0]
    expect(createArg.data.allowances).toBe(800000)
    expect(createArg.data.grossSalary).toBe(5800000)
    const snap = createArg.data.statutorySnapshot
    expect(snap.payrollComponents).toMatchObject({
      mode: "all-taxable-v1", taxableGross: 5800000, nonTaxableEarningTotal: 0,
      earningTotal: 800000, lineCount: 2,
    })
    const lineArg = prismaMock.payrollComponentLine.createMany.mock.calls.at(-1)[0]
    expect(lineArg.data).toHaveLength(2)
    expect(lineArg.data[0]).toMatchObject({
      payrollId: 55, componentId: 3, componentNameSnapshot: "Transport",
      kindSnapshot: "earning", source: "fixed_assignment", assignmentId: 21, amount: 500000,
    })
    expect(lineArg.data[1]).toMatchObject({ componentId: 4, amount: 300000 })
  })

  it("deduction end-to-end: baris deduction masuk deductions persis, gross tidak naik, net turun persis (processPayroll)", async () => {
    const deductionAmount = 700000
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 500000),
      deductionAssignment(22, 5, "Potongan Koperasi", deductionAmount),
    ])
    const res = await actions.processPayroll(fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000", allowances: "999999", deductions: "999999",
      // workingDays > 0 mematikan ringkasan absensi otomatis (mock kosong
      // akan memberi absentDeduction 5jt dan net ter-floor 0).
      workingDays: "22", presentDays: "22", absentDays: "0", absentDeduction: "0",
    }))
    expect(res.success).toBe(true)
    const createArg = prismaMock.payroll.create.mock.calls.at(-1)[0]
    expect(createArg.data.allowances).toBe(500000)
    expect(createArg.data.deductions).toBe(deductionAmount)
    expect(createArg.data.grossSalary).toBe(5500000)

    // Bandingkan tanpa deduction: gross identik, net berbeda persis nominal deduction.
    vi.clearAllMocks()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.payroll.findFirst.mockResolvedValue(null)
    prismaMock.payrollStatutoryRule.findMany.mockResolvedValue(mocks.rules)
    prismaMock.payrollTerBracket.findMany.mockImplementation(async (args: any) => [
      { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
    ])
    prismaMock.payroll.create.mockResolvedValue({ id: 55 })
    prismaMock.payrollComponentLine.findMany.mockResolvedValue([])
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 500000),
    ])

    const baselineRes = await actions.processPayroll(fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000", allowances: "999999", deductions: "999999",
      workingDays: "22", presentDays: "22", absentDays: "0", absentDeduction: "0",
    }))
    expect(baselineRes.success).toBe(true)
    const baselineCreateArg = prismaMock.payroll.create.mock.calls.at(-1)[0]
    expect(baselineCreateArg.data.grossSalary).toBe(createArg.data.grossSalary)
    expect(baselineCreateArg.data.deductions).toBe(0)
    expect(baselineCreateArg.data.netSalary - createArg.data.netSalary).toBe(deductionAmount)
  })

  it("AC-2: effectiveTo sebelum endDate tidak tertarik; mulai tengah periode tertarik penuh", async () => {
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 500000, { effectiveTo: new Date("2026-05-30T00:00:00.000Z") }),
      assignment(22, 4, "Makan", 300000, { effectiveFrom: new Date("2026-05-20T00:00:00.000Z") }),
    ])
    const res = await actions.processPayroll(fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000",
    }))
    expect(res.success).toBe(true)
    const createArg = prismaMock.payroll.create.mock.calls.at(-1)[0]
    expect(createArg.data.allowances).toBe(300000)
    const lineArg = prismaMock.payrollComponentLine.createMany.mock.calls.at(-1)[0]
    expect(lineArg.data).toHaveLength(1)
    expect(lineArg.data[0].componentId).toBe(4)
  })

  it("penugasan nol tidak menulis baris; tanpa penugasan angka identik pra-fitur", async () => {
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 0),
    ])
    const res = await actions.processPayroll(fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000", allowances: "123000",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.payrollComponentLine.createMany).not.toHaveBeenCalled()
    const createArg = prismaMock.payroll.create.mock.calls.at(-1)[0]
    expect(createArg.data.allowances).toBe(123000)
    expect(createArg.data.grossSalary).toBe(5123000)
  })

  it("AC-T4: bulk membawa allowances ke gross + menulis baris; snapshot mode aman", async () => {
    prismaMock.employee.findMany
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValue([{ id: 7, baseSalary: 5000000, maritalStatus: "single", dependents: 0, departmentId: null, employeeLoans: [] }])
    // Urutan findMany bulk: (1) baca luar irisan, (2) baca ulang komponen
    // estimasi, (3) cek ulang irisan DI DALAM transaksi kunci (t_a92d0da1 —
    // wajib kosong agar tidak bentrok diri), (4) baca ulang slip terbit.
    prismaMock.payroll.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 55, employeeId: 7, componentLines: [] }])
    prismaMock.payroll.findUnique.mockResolvedValue({ status: "draft", componentLines: [] })
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      assignment(21, 3, "Transport", 500000),
      assignment(22, 4, "Makan", 300000),
    ])
    const res = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res.success).toBe(true)
    const row = prismaMock.payroll.createMany.mock.calls.at(-1)[0].data[0]
    expect(row.allowances).toBe(800000)
    expect(row.grossSalary).toBe(5800000)
    expect(row.statutorySnapshot.payrollComponents).toMatchObject({
      mode: "all-taxable-v1", taxableGross: 5800000, nonTaxableEarningTotal: 0, lineCount: 2,
    })
    const lineArg = prismaMock.payrollComponentLine.createMany.mock.calls.at(-1)[0]
    expect(lineArg.data).toHaveLength(2)
    expect(lineArg.data.every((l: any) => l.payrollId === 55)).toBe(true)
  })

  it("falsifikasi: tanpa tarikan (query kosong) allowances kembali 0", async () => {
    prismaMock.employee.findMany
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValue([{ id: 7, baseSalary: 5000000, maritalStatus: "single", dependents: 0, departmentId: null, employeeLoans: [] }])
    const res = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res.success).toBe(true)
    const row = prismaMock.payroll.createMany.mock.calls.at(-1)[0].data[0]
    expect(row.allowances).toBe(0)
    expect(row.grossSalary).toBe(5000000)
    expect(prismaMock.payrollComponentLine.createMany).not.toHaveBeenCalled()
  })
})

describe("F-027 baris draft", () => {
  it("AC-3: baris manual draft mengubah agregat persis", async () => {
    prismaMock.payrollComponent.findUnique.mockResolvedValue({
      id: 9, name: "Bonus", kind: "earning", recurrence: "variable", isTaxable: true, isActive: true, accountId: null,
    })
    prismaMock.payrollComponentLine.findMany.mockResolvedValue([{ id: 31, payrollId: 55, componentId: 9, componentNameSnapshot: "Bonus", kindSnapshot: "earning", recurrenceSnapshot: "variable", isTaxableSnapshot: true, source: "manual", assignmentId: null, accountIdSnapshot: null, amount: 250000 }])
    const res = await actions.addPayrollComponentLine(55, fd({ componentId: "9", amount: "250000" }))
    expect(res.success).toBe(true)
    const upd = prismaMock.payroll.update.mock.calls.at(-1)[0]
    expect(upd.data.allowances).toBe(250000)
    expect(upd.data.grossSalary).toBe(5250000)
  })

  it("AC-5: slip paid tambah baris ditolak", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({ ...draftPayroll, status: "paid" })
    const res = await actions.addPayrollComponentLine(55, fd({ componentId: "9", amount: "250000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("draft")
    expect(prismaMock.payrollComponentLine.create).not.toHaveBeenCalled()
  })

  it("nominal format Indonesia tersimpan penuh di baris draft", async () => {
    prismaMock.payrollComponent.findUnique.mockResolvedValue({
      id: 9, name: "Bonus", kind: "earning", recurrence: "variable", isTaxable: true, isActive: true, accountId: null,
    })
    prismaMock.payrollComponentLine.findMany.mockResolvedValue([{ id: 31, payrollId: 55, componentId: 9, componentNameSnapshot: "Bonus", kindSnapshot: "earning", recurrenceSnapshot: "variable", isTaxableSnapshot: true, source: "manual", assignmentId: null, accountIdSnapshot: null, amount: 2000000 }])
    const res = await actions.addPayrollComponentLine(55, fd({ componentId: "9", amount: "2.000.000" }))
    expect(res.success).toBe(true)
    expect(prismaMock.payrollComponentLine.create.mock.calls[0][0].data.amount).toBe(2000000)
  })

  it("duplikat komponen dalam satu slip ditolak", async () => {
    prismaMock.payrollComponent.findUnique.mockResolvedValue({
      id: 9, name: "Bonus", kind: "earning", recurrence: "variable", isTaxable: true, isActive: true, accountId: null,
    })
    prismaMock.payrollComponentLine.findFirst.mockResolvedValue({ id: 31 })
    const res = await actions.addPayrollComponentLine(55, fd({ componentId: "9", amount: "250000" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah ada")
  })

  it("updatePayroll slip berbaris: agregat klien diabaikan, turunan baris menang", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({ ...draftPayroll })
    prismaMock.payroll.findUnique.mockResolvedValue({ id: 7, maritalStatus: "single", dependents: 0 })
    prismaMock.payrollComponentLine.findMany.mockResolvedValue([
      { id: 31, payrollId: 55, componentId: 3, componentNameSnapshot: "Transport", kindSnapshot: "earning", recurrenceSnapshot: "fixed", isTaxableSnapshot: true, source: "fixed_assignment", assignmentId: 21, accountIdSnapshot: null, amount: 800000 },
    ])
    const res = await actions.updatePayroll(55, fd({
      employeeId: "7", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31",
      baseSalary: "5000000", allowances: "1", deductions: "0",
    }))
    expect(res.success).toBe(true)
    const upd = prismaMock.payroll.update.mock.calls.at(-1)[0]
    expect(upd.data.allowances).toBe(800000)
    expect(upd.data.grossSalary).toBe(5800000)
  })
})
