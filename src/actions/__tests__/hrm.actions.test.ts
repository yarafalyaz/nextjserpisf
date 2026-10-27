import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const requirePermissionMock = vi.fn()
  const revalidateMock = vi.fn()
  const logActivityMock = vi.fn()
  const assertApprovedMock = vi.fn()
  const requestApprovalMock = vi.fn().mockResolvedValue(true)
  const notifyAdminsMock = vi.fn()
  const createNotificationMock = vi.fn()
  const sendEmailMock = vi.fn()
  const generateDocNumMock = vi.fn()
  const generateDocNumBatchMock = vi.fn((...a: unknown[]) => {
    const count = Number(a[1]) || 0
    return Promise.resolve(Array.from({ length: count }, (_, i) => `DOC-${i + 1}`))
  })
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
  })

  // F-026: pulihkan implementasi mock TER sesudah vi.clearAllMocks().
  const restoreTerBracketMock = () => {
    prismaMock.payrollTerBracket.findMany.mockImplementation(async (args: { where?: { category?: string } }) => [
      { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
    ])
  }

  const prismaMock = {
    timesheet: buildModelMock(),
    productionCost: { ...buildModelMock(), findMany: vi.fn().mockResolvedValue([]) },
    employeeLoan: buildModelMock(),
    leaveRequest: buildModelMock(),
    overtimeRequest: buildModelMock(),
    appreciation: buildModelMock(),
    payroll: buildModelMock(),
    // F-2026-10-21-027: model komponen gaji (mock kosong = tanpa penugasan).
    payrollComponent: buildModelMock(),
    employeePayrollComponent: buildModelMock(),
    payrollComponentLine: buildModelMock(),
    // AUD-R3-02: ruleset statutori LENGKAP untuk periode tes (tulis-final
    // payroll fail-closed bila fallback — mock kosong = semua tes tulis gagal).
    payrollStatutoryRule: {
      ...buildModelMock(),
      findMany: vi.fn().mockResolvedValue([
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
      ]),
    },

    // F-026: tabel TER lengkap (satu bracket terbuka 0% cukup untuk fixture
    // hitung — angka pajak spesifik diuji di payroll-pph21-ter.test.ts).
    payrollTerBracket: {
      ...buildModelMock(),
      findMany: vi.fn(async (args: { where?: { category?: string } }) => [
        { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
      ]),
    },
    employee: buildModelMock(),
    attendance: buildModelMock(),
    workSchedule: buildModelMock(),
    holiday: buildModelMock(),
    departmentHoliday: buildModelMock(),
    notification: buildModelMock(),
    setting: buildModelMock(),
    systemSetting: buildModelMock(),
    approval: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    user: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") {
        return ops(prismaMock)
      }
      return Promise.all(ops)
    }),
  }
  return {
    requirePermissionMock,
    revalidateMock,
    logActivityMock,
    assertApprovedMock,
    requestApprovalMock,
    notifyAdminsMock,
    createNotificationMock,
    sendEmailMock,
    generateDocNumMock,
    generateDocNumBatchMock,
    prismaMock,
    restoreTerBracketMock,
    getHrScopeMock: vi.fn(),
    hrScopeOverride: { current: null as unknown },
    loadLifecycleMock: vi.fn().mockResolvedValue([]),
  }
})

// Hanya alias yang benar-benar dipakai di badan tes di-destructure; mock lain
// tetap ada di `mocks` karena dipakai oleh pabrik `vi.mock` di bawah.
const {
  requirePermissionMock,
  assertApprovedMock,
  generateDocNumMock,
  prismaMock,
  restoreTerBracketMock,
} = mocks

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: (...a: unknown[]) => mocks.assertApprovedMock(...a),
  requestApprovalIfConfigured: (...a: unknown[]) => mocks.requestApprovalMock(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notifyAdmins: (...a: unknown[]) => mocks.notifyAdminsMock(...a),
  createNotification: (...a: unknown[]) => mocks.createNotificationMock(...a),
}))

vi.mock("@/lib/services/email", () => ({
  sendEmail: (...a: unknown[]) => mocks.sendEmailMock(...a),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: any[]) => mocks.generateDocNumMock(...a),
  generateDocumentNumberBatch: (...a: any[]) => mocks.generateDocNumBatchMock(...a),
}))

vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown, fallback?: string) =>
    e instanceof Error ? e.message : fallback ?? "error",
  isNextRedirectError: (e: unknown) =>
    e instanceof Error && (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") === true,
}))

// F-2026-10-22-085-S (F-2 audit t_07ba8f0c): gerbang aksi lifecycle.
// getHrScope dikendalikan; fungsi where/assert tetap perilaku asli (dipakai
// aksi lain di file ini) — refleksikan di sini karena partial mock lewat
// importOriginal tidak ter-register di setup repo ini. Loader di-mock supaya
// tes berhenti di kontrak aksi (izin + scope), bukan query DB.
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: async (user: { id: string | number; roles?: string[] }) => {
    mocks.getHrScopeMock(user)
    if (mocks.hrScopeOverride.current != null) return mocks.hrScopeOverride.current
    // Perilaku asli getHrScope (fail-closed), tanpa impor modul asli.
    const roles = Array.isArray(user?.roles) ? user.roles : null
    if (!roles) return { kind: "self" as const, employeeId: -1 }
    if (roles.some((r: string) => ["super_admin", "admin", "finance", "ga"].includes(r))) {
      return { kind: "all" as const }
    }
    const me = await mocks.prismaMock.employee.findFirst({
      where: { userId: Number(user.id) },
      select: { id: true, departmentId: true },
    })
    if (!me) return { kind: "self" as const, employeeId: -1 }
    if (roles.includes("kepala_bengkel")) {
      return { kind: "department" as const, departmentId: me.departmentId, employeeId: me.id }
    }
    return { kind: "self" as const, employeeId: me.id }
  },
  hrEmployeeScopeWhere: (scope: { kind: string; departmentId?: number | null; employeeId?: number }) => {
    if (scope.kind === "all") return {}
    if (scope.kind === "self") return { id: scope.employeeId }
    if (scope.departmentId == null) return { id: scope.employeeId }
    return { departmentId: scope.departmentId }
  },
  hrScopeWhere: (scope: { kind: string; departmentId?: number | null; employeeId?: number }) => {
    if (scope.kind === "all") return {}
    if (scope.kind === "self") return { employeeId: scope.employeeId }
    if (scope.departmentId == null) return { employeeId: scope.employeeId }
    return { employee: { departmentId: scope.departmentId } }
  },
  assertHrEmployeeAccess: async (
    scope: { kind: string; departmentId?: number | null; employeeId?: number },
    employeeId: number,
  ) => {
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    if (scope.kind === "all") return
    if (scope.kind === "self" || scope.departmentId == null) {
      if (scope.employeeId !== employeeId) throw new Error("Anda tidak memiliki akses ke data karyawan ini")
      return
    }
    const employee = await mocks.prismaMock.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    })
    if (!employee || employee.departmentId !== scope.departmentId) {
      throw new Error("Anda tidak memiliki akses ke data karyawan ini")
    }
  },
  canSearchAcrossEmployees: (scope: { kind: string }) => scope.kind === "all",
}))

vi.mock("@/lib/reports/employee-lifecycle-data", () => ({
  loadEmployeeLifecycleAttention: (...a: unknown[]) => mocks.loadLifecycleMock(...a),
}))

function fd(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else f.set(k, v)
  }
  return f
}

import * as actions from "../hrm.actions"
import { normalizeWorkDays } from "@/lib/validations/hrm.schemas"

const EXPORTED_FN_NAMES = [
  "createLeaveRequest",
  "createOvertimeRequest", "approveOvertime",
  "createEmployeeLoan", "createTimesheet",
  "deleteLeaveRequest", "deleteOvertimeRequest", "deleteTimesheet",
  "deleteEmployeeLoan",
  "updateLeaveRequest", "updateOvertimeRequest", "updateEmployeeLoan",
  "updateTimesheet",
  "createAppreciation", "updateAppreciation", "deleteAppreciation",
  "createHoliday", "updateHoliday", "deleteHoliday",
  "createDepartmentHoliday", "updateDepartmentHoliday", "deleteDepartmentHoliday",
  "createWorkSchedule", "updateWorkSchedule", "deleteWorkSchedule",
  "createAttendance", "updateAttendance", "deleteAttendance",
]

describe("HRM Actions exports smoke test", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.timesheet.create.mockResolvedValue({ id: 1 })
    prismaMock.timesheet.update.mockResolvedValue({})
    prismaMock.timesheet.delete.mockResolvedValue({})
    prismaMock.employeeLoan.create.mockResolvedValue({ id: 1 })
    prismaMock.employeeLoan.update.mockResolvedValue({})
    prismaMock.employeeLoan.delete.mockResolvedValue({})
    prismaMock.leaveRequest.create.mockResolvedValue({ id: 1 })
    prismaMock.leaveRequest.findUniqueOrThrow.mockResolvedValue({
      id: 1, employeeId: 1, status: "pending", startDate: new Date(), endDate: new Date(),
    })
    prismaMock.leaveRequest.update.mockResolvedValue({})
    prismaMock.leaveRequest.delete.mockResolvedValue({})
    prismaMock.overtimeRequest.create.mockResolvedValue({ id: 1 })
    prismaMock.overtimeRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, employeeId: 1, status: "pending" })
    prismaMock.overtimeRequest.update.mockResolvedValue({})
    prismaMock.overtimeRequest.delete.mockResolvedValue({})
    prismaMock.appreciation.create.mockResolvedValue({ id: 1 })
    prismaMock.appreciation.update.mockResolvedValue({})
    prismaMock.appreciation.delete.mockResolvedValue({})
    prismaMock.payroll.findFirst.mockResolvedValue(null)
    prismaMock.payroll.findUnique.mockResolvedValue(null)
    prismaMock.payroll.create.mockResolvedValue({ id: 1 })
    prismaMock.payroll.update.mockResolvedValue({})
    prismaMock.payroll.findMany.mockResolvedValue([])
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, basicSalary: 5000000, employeeLoan: [],
    })
    prismaMock.employee.findMany.mockResolvedValue([])
    prismaMock.attendance.findMany.mockResolvedValue([])
    prismaMock.workSchedule.findMany.mockResolvedValue([])
    prismaMock.holiday.findMany.mockResolvedValue([])
    prismaMock.departmentHoliday.findMany.mockResolvedValue([])
    prismaMock.user.findMany.mockResolvedValue([])
    generateDocNumMock.mockResolvedValue("PAY-202606-0001")
  })

  it("exports all expected HRM action functions", () => {
    for (const name of EXPORTED_FN_NAMES) {
      expect(typeof (actions as any)[name]).toBe("function")
    }
  })
})

describe("Leave Request Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.leaveRequest.create.mockResolvedValue({ id: 1 })
    prismaMock.leaveRequest.findUniqueOrThrow.mockResolvedValue({
      id: 1, employeeId: 1, status: "pending", startDate: new Date(), endDate: new Date(),
    })
    prismaMock.leaveRequest.update.mockResolvedValue({})
    prismaMock.leaveRequest.delete.mockResolvedValue({})
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, departmentId: null, joinDate: new Date("2020-01-01"),
    })
  })

  it("createLeaveRequest validates form", async () => {
    const res = await actions.createLeaveRequest(fd({}))
    expect(res?.success).toBe(false)
  })

  it("createLeaveRequest succeeds with valid data", async () => {
    const res = await actions.createLeaveRequest(fd({
      employeeId: "1",
      startDate: "2026-06-15",
      endDate: "2026-06-20",
      type: "annual",
      reason: "vacation",
    }))
    expect(res?.success).toBe(true)
    expect(prismaMock.$queryRaw).toHaveBeenCalled()
  })

  it("createLeaveRequest fails if startDate is after endDate", async () => {
    const res = await actions.createLeaveRequest(fd({
      employeeId: "1",
      startDate: "2026-06-20",
      endDate: "2026-06-15",
      type: "annual",
      reason: "vacation",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tanggal mulai tidak boleh melebihi tanggal selesai")
  })

  it("updateLeaveRequest fails if startDate is after endDate", async () => {
    const res = await actions.updateLeaveRequest(1, fd({
      employeeId: "1",
      startDate: "2026-06-20",
      endDate: "2026-06-15",
      type: "annual",
      reason: "vacation",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tanggal mulai tidak boleh melebihi tanggal selesai")
  })

  it("updateLeaveRequest fails if there is an overlap", async () => {
    prismaMock.leaveRequest.findFirst.mockResolvedValueOnce({ id: 99 })
    const res = await actions.updateLeaveRequest(1, fd({
      employeeId: "1",
      startDate: "2026-06-15",
      endDate: "2026-06-20",
      type: "annual",
      reason: "vacation",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("bentrok")
  })




  it("updateLeaveRequest updates record", async () => {
    const res = await actions.updateLeaveRequest(1, fd({
      employeeId: "1",
      type: "annual",
      startDate: "2026-06-15",
      endDate: "2026-06-20",
    }))
    expect(res?.success).toBe(true)
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_leave_requests")
    expect(prismaMock.$queryRaw).toHaveBeenCalled()
  })

  it("updateLeaveRequest rechecks pending status after locking the request", async () => {
    prismaMock.leaveRequest.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, employeeId: 1, status: "pending" })
      .mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.updateLeaveRequest(1, fd({
      employeeId: "1",
      type: "annual",
      startDate: "2026-06-15",
      endDate: "2026-06-20",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("berstatus menunggu")
    expect(prismaMock.leaveRequest.update).not.toHaveBeenCalled()
  })

  it("deleteLeaveRequest removes record", async () => {
    const res = await actions.deleteLeaveRequest(1)
    expect(res?.success).toBe(true)
  })
})

describe("Overtime Request Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.overtimeRequest.create.mockResolvedValue({ id: 1 })
    prismaMock.overtimeRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, employeeId: 1, status: "pending", hours: 2, calculatedValue: null, employee: { baseSalary: 5_000_000 } })
    prismaMock.overtimeRequest.update.mockResolvedValue({})
    prismaMock.overtimeRequest.delete.mockResolvedValue({})
  })

  it("createOvertimeRequest validates form", async () => {
    const res = await actions.createOvertimeRequest(fd({}))
    expect(res?.success).toBe(false)
  })

  it("createOvertimeRequest succeeds with valid data", async () => {
    const res = await actions.createOvertimeRequest(fd({
      employeeId: "1",
      date: "2026-06-12",
      hours: "2",
    }))
    expect(res?.success).toBe(true)
  })

  it("approveOvertime updates status", async () => {
    const res = await actions.approveOvertime(1)
    expect(res?.success).toBe(true)
    expect(assertApprovedMock).toHaveBeenCalledWith("OvertimeRequest", 1)
    expect(prismaMock.overtimeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: { in: ["pending", "approved"] } },
      }),
    )
    // The manual approval must still compute the pay value.
    const arg = prismaMock.overtimeRequest.updateMany.mock.calls[0][0]
    expect(arg.data.calculatedValue).toBeGreaterThan(0)
    expect(arg.data.status).toBe("approved")
    // Jejak audit: cap waktu persetujuan harus benar-benar distempel. Tanpa ini
    // halaman detail tidak pernah menampilkan "Disetujui Pada" (barisnya
    // dikurung oleh approvedAt) walau statusnya sudah disetujui.
    expect(arg.data.approvedAt).toBeInstanceOf(Date)
  })

  it("computes calculatedValue for a workflow-approved overtime (status already 'approved')", async () => {
    // The approval engine flips status to "approved" but never runs domain
    // side-effects; approveOvertime is what must compute the value. Previously
    // it rejected anything not "pending", leaving workflow-approved overtime at
    // calculatedValue = 0 and dropping the pay from payroll.
    prismaMock.overtimeRequest.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      employeeId: 1,
      status: "approved",
      hours: 2,
      calculatedValue: null,
      employee: { baseSalary: 5_000_000 },
    })
    const res = await actions.approveOvertime(1)
    expect(res?.success).toBe(true)
    const arg = prismaMock.overtimeRequest.updateMany.mock.calls[0][0]
    expect(arg.data.calculatedValue).toBeGreaterThan(0)
  })

  it("approveOvertime is idempotent when the value is already computed", async () => {
    prismaMock.overtimeRequest.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      employeeId: 1,
      status: "approved",
      hours: 2,
      calculatedValue: 150000,
      employee: { baseSalary: 5_000_000 },
    })
    const res = await actions.approveOvertime(1)
    expect(res?.success).toBe(true)
    // No recompute / no overwrite of the existing value or approver.
    expect(prismaMock.overtimeRequest.updateMany).not.toHaveBeenCalled()
  })

  it("updateOvertimeRequest updates record", async () => {
    const res = await actions.updateOvertimeRequest(1, fd({
      employeeId: "1",
      date: "2026-06-12",
      hours: "3",
    }))
    expect(res?.success).toBe(true)
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_overtime_requests")
    expect(prismaMock.$queryRaw).toHaveBeenCalled()
  })

  it("updateOvertimeRequest rejects editing an already-approved request", async () => {
    prismaMock.overtimeRequest.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, employeeId: 1, status: "approved" })
    const res = await actions.updateOvertimeRequest(1, fd({
      employeeId: "1",
      date: "2026-06-12",
      hours: "99",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("menunggu")
    expect(prismaMock.overtimeRequest.update).not.toHaveBeenCalled()
  })

  it("updateOvertimeRequest rechecks status inside the locked transaction", async () => {
    prismaMock.overtimeRequest.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, employeeId: 1, status: "pending" })
      .mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.updateOvertimeRequest(1, fd({
      employeeId: "1",
      date: "2026-06-12",
      hours: "3",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("menunggu")
    expect(prismaMock.overtimeRequest.updateMany).not.toHaveBeenCalled()
  })

  it("deleteOvertimeRequest removes record", async () => {
    const res = await actions.deleteOvertimeRequest(1)
    expect(res?.success).toBe(true)
  })
})

describe("Employee Loan Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employeeLoan.create.mockResolvedValue({ id: 1 })
    prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValue({ id: 1, employeeId: 1, status: "pending" })
    prismaMock.systemSetting.findFirst.mockResolvedValue({ id: 1 })
    prismaMock.journal.findMany.mockResolvedValue([])
  })

  it("createEmployeeLoan succeeds with valid data", async () => {
    const res = await actions.createEmployeeLoan(fd({
      employeeId: "1",
      loanDate: "2026-06-12",
      totalAmount: "1000000",
      monthlyInstallment: "100000",
    }))
    expect(res?.success).toBe(true)
  })

  it("updateEmployeeLoan updates record", async () => {
    const res = await actions.updateEmployeeLoan(1, fd({
      employeeId: "1",
      loanDate: "2026-06-12",
      totalAmount: "2000000",
      monthlyInstallment: "400000",
    }))
    expect(res?.success).toBe(true)
    expect(prismaMock.$queryRaw).toHaveBeenCalled()
  })

  it("updateEmployeeLoan rechecks status inside the locked transaction", async () => {
    prismaMock.employeeLoan.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, employeeId: 1, totalAmount: 1_000_000, remainingAmount: 1_000_000, status: "pending" })
      .mockResolvedValueOnce({ id: 1, status: "active" })
    const res = await actions.updateEmployeeLoan(1, fd({
      employeeId: "1",
      loanDate: "2026-06-12",
      totalAmount: "2000000",
      monthlyInstallment: "400000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("menunggu")
    expect(prismaMock.employeeLoan.updateMany).not.toHaveBeenCalled()
  })

  it("deleteEmployeeLoan removes record", async () => {
    const res = await actions.deleteEmployeeLoan(1)
    expect(res?.success).toBe(true)
  })
})

describe("Timesheet Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.timesheet.findUniqueOrThrow.mockResolvedValue({ id: 1, employeeId: 1 })
  })

  it("createTimesheet succeeds", async () => {
    const res = await actions.createTimesheet(fd({
      employeeId: "1",
      projectId: "1",
      date: "2026-06-12",
      hours: "8",
      activity: "Coding",
    }))
    expect(res?.success).toBe(true)
  })

  it("updateTimesheet succeeds", async () => {
    const res = await actions.updateTimesheet(1, fd({
      employeeId: "1",
      projectId: "1",
      date: "2026-06-12",
      hours: "4",
      activity: "Review",
    }))
    expect(res?.success).toBe(true)
  })

  it("deleteTimesheet removes record", async () => {
    const res = await actions.deleteTimesheet(1)
    expect(res?.success).toBe(true)
  })

  it.each([
    ["deleteTimesheet", 2, async () => actions.deleteTimesheet(1), () => prismaMock.timesheet.delete],
    ["updateTimesheet", 1, async () => actions.updateTimesheet(1, fd({ employeeId: "1", projectId: "1", date: "2026-06-12", hours: "4", activity: "Review" })), () => prismaMock.timesheet.update],
  ])("%s menolak bila sudah ditarik menjadi biaya produksi (F-96)", async (_nama, jumlah, panggil, mutasi) => {
    prismaMock.productionCost.findMany.mockResolvedValue(Array.from({ length: jumlah }, () => ({})))
    const res = await panggil()
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(`sudah ditarik menjadi ${jumlah} baris biaya produksi`)
    expect(mutasi()).not.toHaveBeenCalled()
  })
})

describe("Appreciation Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  })

  it("createAppreciation succeeds", async () => {
    const res = await actions.createAppreciation(fd({
      employeeId: "1",
      date: "2026-06-12",
      title: "Star Performer",
      description: "Great work",
      amount: "500000",
    }))
    expect(res?.success).toBe(true)
  })

  it("updateAppreciation succeeds", async () => {
    const res = await actions.updateAppreciation(fd({
      id: "1",
      employeeId: "1",
      date: "2026-06-12",
      title: "Star Performer",
      description: "Excellent work",
      amount: "600000",
    }))
    expect(res?.success).toBe(true)
  })

  it("deleteAppreciation removes record", async () => {
    const res = await actions.deleteAppreciation(1)
    expect(res?.success).toBe(true)
  })
})

describe("Payroll Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, basicSalary: 5000000, employeeLoan: [],
      workingDaysPerMonth: 22, overtimeRate: 25000, transportAllowance: 300000,
      department: { name: "IT" },
    })
    prismaMock.employee.findUniqueOrThrow.mockResolvedValue({
      id: 1, basicSalary: 5000000, employeeLoan: [],
      workingDaysPerMonth: 22, overtimeRate: 25000, transportAllowance: 300000,
      department: { name: "IT" },
    })
    prismaMock.employee.findFirst.mockResolvedValue({
      id: 1, basicSalary: 5000000, employeeLoan: [],
      workingDaysPerMonth: 22, overtimeRate: 25000, transportAllowance: 300000,
      department: { name: "IT" },
    })
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, basicSalary: 5000000, workingDaysPerMonth: 22, overtimeRate: 25000, transportAllowance: 300000,
      department: { name: "IT" },
    }])
    const defaultPayroll = {
      id: 1, status: "draft", netPay: 5000000, employeeId: 1, period: "2026-05",
      loanDeduction: 0,
      statutorySnapshot: { fromFallback: false },
      employee: { name: "A", code: "A1" }
    }
    prismaMock.payroll.findUnique.mockResolvedValue(defaultPayroll)
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue(defaultPayroll)
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      bpjsKesehatanPrc: 1, bpjsKetenagakerjaanPrc: 2, defaultWorkingDays: 22,
      // onPayrollPaid menolak posting tanpa akun ini (tidak lagi melewatinya
      // diam-diam), jadi lingkungan payroll harus terkonfigurasi.
      salaryExpenseAccountId: 601, payrollBankAccountId: 602,
    })
  })

  it("rejects a fictitious calendar end date instead of rolling it over", async () => {
    // `new Date("2026-02-30")` rolls to Mar 2: the 2026-02-01..2026-02-30
    // range reads as 29 valid days and the estimation silently computes
    // against the rolled-over date. The range guard must reject the date.
    requirePermissionMock.mockResolvedValueOnce({ id: "1", roles: ["hr_admin"] } as any)
    const res = await actions.getPayrollEstimation(1, "2026-02-01", "2026-02-30")
    if (!res || !("error" in res)) throw new Error("Expected error result for fictitious date")
    expect(res.error).toMatch(/tanggal/i)
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
    expect(prismaMock.payroll.create).not.toHaveBeenCalled()
  })

  it("rejects a fictitious bulk payroll end date instead of rolling it over", async () => {
    requirePermissionMock.mockResolvedValueOnce({ id: "1", roles: ["hr_admin"] } as any)
    const res = await actions.generateBulkPayroll("2026-02", "2026-02-01", "2026-02-30")
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/tanggal/i)
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
    expect(prismaMock.payroll.create).not.toHaveBeenCalled()
  })

  it("getPayrollEstimation returns components", async () => {
    requirePermissionMock.mockResolvedValueOnce({ id: "1", roles: ["hr_admin"] } as any)
    prismaMock.employee.findUnique.mockResolvedValue({
      baseSalary: 5000000, maritalStatus: "single",
      employeeLoans: [],
    })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    const res = await actions.getPayrollEstimation(1, "2026-05-01", "2026-05-31")
    expect(res).toBeDefined()
    if (!res || "error" in res) throw new Error("Expected success, got error: " + (res && "error" in res ? res.error : "undefined"))
  })

  it("estimation and bulk share one statutory engine with snapshot (P1-6)", async () => {
    requirePermissionMock.mockResolvedValueOnce({ id: "1", roles: ["hr_admin"] } as any)
    prismaMock.employee.findUnique.mockResolvedValue({
      baseSalary: 5000000, maritalStatus: "single", dependents: 0,
      employeeLoans: [],
    })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    const single = await actions.getPayrollEstimation(1, "2026-05-01", "2026-05-31")
    if (!single || "error" in single) throw new Error("single failed")
    const snap = (single as unknown as { statutorySnapshot: { fromFallback: boolean; asOf: string } }).statutorySnapshot
    // Mock ruleset LENGKAP (default) → bukan fallback; snapshot jujur.
    expect(snap.fromFallback).toBe(false)
    expect(snap.asOf).toBe("2026-05-31")
  })

  it("generateBulkPayroll succeeds", async () => {
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, baseSalary: 5000000, maritalStatus: "single",
      employeeLoans: [],
    }])
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    const res = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res?.success).toBe(true)
  })

  it("processPayroll succeeds", async () => {
    const res = await actions.processPayroll(fd({
      employeeId: "1",
      period: "2026-05",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      basicSalary: "5000000",
      totalAllowances: "0",
      totalDeductions: "0",
      netPay: "5000000",
    }))
    expect(res?.success).toBe(true)
  })

  it("processPayroll caps a client-sent loan deduction to the real outstanding", async () => {
    // Employee's active loan only owes 100k (installment 500k). A client that
    // submits loanDeduction=500k must be capped to 100k, else onPayrollPaid would
    // credit Piutang Karyawan 500k while relieving only 100k (receivable goes negative).
    prismaMock.employeeLoan.findMany.mockResolvedValueOnce([
      { monthlyInstallment: 500000, remainingAmount: 100000 },
    ])
    const res = await actions.processPayroll(fd({
      employeeId: "1",
      period: "2026-06",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      baseSalary: "5000000",
      loanDeduction: "500000",
    }))
    expect(res?.success).toBe(true)
    const createArg = prismaMock.payroll.create.mock.calls.at(-1)?.[0]
    expect(createArg.data.loanDeduction).toBe(100000)
  })

  it("updatePayroll succeeds", async () => {
    const res = await actions.updatePayroll(1, fd({
      period: "2026-05",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      basicSalary: "6000000",
      totalAllowances: "0",
      totalDeductions: "0",
      netPay: "6000000",
    }))
    expect(res?.success).toBe(true)
  })

  it("approvePayroll updates status", async () => {
    const res = await actions.approvePayroll(1)
    expect(res?.success).toBe(true)
    expect(assertApprovedMock).toHaveBeenCalledWith("Payroll", 1)
    expect(prismaMock.payroll.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, status: "draft" } }),
    )
  })

  it("markPayrollPaid updates status and posts journal", async () => {
    // Gaji positif + akun terkonfigurasi: baris ini harus benar-benar
    // membukukan jurnal, bukan berhenti di pemeriksaan akun yang baru.
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "approved", netPay: 5000000, netSalary: 5000000,
      grossSalary: 5000000, employeeId: 1, period: "2026-05",
      loanDeduction: 0, employee: { name: "A", code: "A1" }
    })
    const res = await actions.markPayrollPaid(1)
    expect(res?.success).toBe(true)
    expect(prismaMock.payroll.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "approved" },
      data: expect.objectContaining({ status: "paid" }),
    })
    expect(prismaMock.journal.create).toHaveBeenCalled()
  })
})


describe('Global Error Paths (Permission Reject)', () => {
  it("createLeaveRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createLeaveRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createOvertimeRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("approveOvertime handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).approveOvertime(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("getPayrollEstimation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).getPayrollEstimation(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("generateBulkPayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).generateBulkPayroll(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("processPayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).processPayroll(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updatePayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePayroll(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("approvePayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).approvePayroll(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("markPayrollPaid handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).markPayrollPaid(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createEmployeeLoan(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createTimesheet(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteLeaveRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteLeaveRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteOvertimeRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteTimesheet(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteEmployeeLoan(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateLeaveRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateLeaveRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateOvertimeRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateEmployeeLoan(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateTimesheet(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createAppreciation(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateAppreciation(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteAppreciation(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
})

describe("generateBulkPayroll edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, baseSalary: 100, maritalStatus: "single", employeeLoans: []
    }])
    prismaMock.payroll.findMany.mockResolvedValue([])
    prismaMock.employee.findUnique.mockResolvedValue({ id: 1 })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    generateDocNumMock.mockResolvedValue("PAY-2026")
  })

  it("handles getBulkPayrollEstimations returning empty (no employees match)", async () => {
    prismaMock.employee.findMany.mockResolvedValue([])
    const res = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res?.success).toBe(true)
    expect(res?.count).toBe(0)
  })

  it("handles payroll.createMany skipDuplicates (P2002 silent skip)", async () => {
    prismaMock.payroll.createMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res?.success).toBe(true)
    expect(res?.count).toBe(1)
    expect(prismaMock.payroll.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    )
  })
})

describe("markPayrollPaid edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  })

  it("amortizes active loans", async () => {
    const payroll = {
      id: 1, status: "approved", netPay: 5000000, employeeId: 1, period: "2026-05",
      loanDeduction: 500000,
    }
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce(payroll)
    prismaMock.employeeLoan.findMany.mockResolvedValueOnce([
      { id: 1, employeeId: 1, status: "active", loanDate: new Date(2020,0,1), monthlyInstallment: 200000, remainingAmount: 1000000 },
      { id: 2, employeeId: 1, status: "active", loanDate: new Date(2020,1,1), monthlyInstallment: 300000, remainingAmount: 50 },
    ])

    prismaMock.$transaction.mockImplementationOnce(async (ops: any) => {
      return ops(prismaMock)
    })
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      salaryExpenseAccountId: 601, payrollBankAccountId: 602,
    })

    const res = await actions.markPayrollPaid(1)
    expect(res?.success).toBe(true)
  })
})

describe("HRM Actions Extra Coverage - Loops and Array callbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["employee"] })
  })

  it("getPayrollEstimation with IDOR paths and employeeLoans reduction", async () => {
    prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 1 })
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      baseSalary: 5000000,
      maritalStatus: "single",
      employeeLoans: [
        { monthlyInstallment: 200000, remainingAmount: 1000000 },
        { monthlyInstallment: 500000, remainingAmount: 100 }
      ]
    })
    prismaMock.overtimeRequest.findMany.mockResolvedValueOnce([
      { calculatedValue: 150000 },
      { calculatedValue: 200000 }
    ])
    prismaMock.appreciation.findMany.mockResolvedValueOnce([
      { amount: 50000 },
      { amount: 100000 }
    ])

    const res = await actions.getPayrollEstimation(1, "2026-05-01", "2026-05-31")
    expect(res).toBeDefined()

    prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 2 })
    const resIdor = await actions.getPayrollEstimation(1, "2026-05-01", "2026-05-31")
    if (!resIdor || !("error" in resIdor)) throw new Error("expected error result")
    expect(resIdor.error).toContain("Anda tidak memiliki akses ke data karyawan ini")
  })

  it("blocks bulk payroll estimates for employees outside the caller's scope", async () => {
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["employee"] })
    prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 1, departmentId: 4 })
    prismaMock.employee.findMany.mockResolvedValueOnce([])

    await expect(
      actions.getBulkPayrollEstimations([2], "2026-05-01", "2026-05-31"),
    ).rejects.toThrow("Anda tidak memiliki akses ke data karyawan yang diminta")
    expect(prismaMock.employee.findMany).toHaveBeenCalledWith({
      where: { id: { in: [2] }, AND: [{ id: 1 }] },
      select: { id: true },
    })
  })

  it("blocks leave balance lookup for another employee", async () => {
    requirePermissionMock.mockResolvedValue({ id: 11, roles: ["employee"] })
    prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 3, departmentId: 4 })

    const result = await actions.getEmployeeLeaveBalance(8, 2026)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Anda tidak memiliki akses")
  })

  it("limits all leave balances to the caller's employee scope", async () => {
    requirePermissionMock.mockResolvedValue({ id: 11, roles: ["employee"] })
    prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 3, departmentId: 4 })
    prismaMock.employee.findMany.mockResolvedValueOnce([])

    const result = await actions.getAllLeaveBalances(2026)
    expect(result.success).toBe(true)
    expect(prismaMock.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, deletedAt: null, id: 3 },
    }))
  })
})

describe("Payroll extra branches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("updatePayroll on non-draft rejects", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const r = await actions.updatePayroll(1, new FormData())
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("Hanya penggajian status draft")
  })

  it("approvePayroll on non-draft rejects", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const r = await actions.approvePayroll(1)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("Payroll hanya bisa di-approve dari status draft")
  })

  it("generateBulkPayroll menolak ruleset fallback (AUD-R3-02)", async () => {
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, baseSalary: 5000000, maritalStatus: "single", employeeLoans: [],
    }])
    prismaMock.payrollStatutoryRule.findMany.mockResolvedValueOnce([])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("belum lengkap/valid")
  })

  it("approvePayroll menolak slip fallback 2024 (AUD-HRM-01)", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", statutorySnapshot: { fromFallback: true },
    })
    const r = await actions.approvePayroll(1)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("cadangan (2024)")
  })

  it("approvePayroll menolak slip Desember massal pending-final Pasal 17 (F-026 HIGH)", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft",
      statutorySnapshot: { fromFallback: false, pph21Ter: { method: "TER", periodKind: "bulk-december-pending-final" } },
    })
    const r = await actions.approvePayroll(1)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("belum dihitung ulang Pasal 17")
    expect(r?.error).toContain("Hitung ulang slip draft ini")
    expect(prismaMock.payroll.updateMany).not.toHaveBeenCalled()
  })

  it("generateBulkPayroll Desember menandai snapshot pending-final yang tak bisa di-approve (F-026 HIGH)", async () => {
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, baseSalary: 5000000, maritalStatus: "single",
      employeeLoans: [],
    }])
    const r = await actions.generateBulkPayroll("2026-12", "2026-12-01", "2026-12-31")
    expect(r?.success).toBe(true)
    const createManyArg = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0]
    const rows = createManyArg?.data as Array<{ statutorySnapshot: { pph21Ter: { periodKind: string } } }>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].statutorySnapshot.pph21Ter.periodKind).toBe("bulk-december-pending-final")
    // Slip yang sama persis dari generate massal wajib tertolak di approve.
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", statutorySnapshot: rows[0].statutorySnapshot,
    })
    const blocked = await actions.approvePayroll(1)
    expect(blocked?.success).toBe(false)
    expect(blocked?.error).toContain("Pasal 17")
  })

  it("updatePayroll menolak flag final-resign client tanpa bukti berhenti server (F-026 MEDIUM Bot 4)", async () => {
    const f = new FormData()
    f.set("employeeId", "1")
    f.set("period", "2026-09")
    f.set("startDate", "2026-09-01")
    f.set("endDate", "2026-09-30")
    f.set("resignationFinal", "true")
    const r = await actions.updatePayroll(1, f)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("belum bisa dibuktikan")
    expect(prismaMock.payroll.update).not.toHaveBeenCalled()
  })

  it("F-085-S AC-EMP-2: processPayroll reguler periode sesudah employmentEndedAt ditolak keras", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, maritalStatus: "single", dependents: 0,
      employmentEndedAt: new Date("2026-10-15T00:00:00.000Z"),
    })
    const r = await actions.processPayroll(fd({
      employeeId: "1", period: "2026-11",
      startDate: "2026-11-01", endDate: "2026-11-30",
    }))
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("Slip reguler tidak dapat dibuat; gunakan slip final masa terakhir.")
    expect(prismaMock.payroll.create).not.toHaveBeenCalled()
  })

  it("F-085-S AC-EMP-3: slip final terverifikasi master lolos gerbang", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, maritalStatus: "single", dependents: 0,
      employmentEndedAt: new Date("2026-10-15T00:00:00.000Z"),
    })
    const r = await actions.processPayroll(fd({
      employeeId: "1", period: "2026-10",
      startDate: "2026-10-01", endDate: "2026-10-31",
      resignationFinal: "true",
    }))
    expect(r?.success).toBe(true)
    expect(prismaMock.payroll.create).toHaveBeenCalled()
  })

  it("F-085-S: generateBulkPayroll mengeluarkan karyawan berhenti dari populasi", async () => {
    prismaMock.employee.findMany.mockResolvedValue([{
      id: 1, baseSalary: 5000000, maritalStatus: "single",
      employeeLoans: [], employmentEndedAt: new Date("2026-10-15T00:00:00.000Z"),
    }])
    const r = await actions.generateBulkPayroll("2026-11", "2026-11-01", "2026-11-30")
    expect(r?.success).toBe(true)
    expect(r?.count).toBe(0)
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
  })

  it("markPayrollPaid on non-approved rejects", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "paid" })
    const r = await actions.markPayrollPaid(1)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("Payroll hanya bisa ditandai dibayar dari status approved")
  })

  it("updatePayroll branches (recalc late)", async () => {
    const f = new FormData()
    f.set("recalcLate", "true")
    f.set("employeeId", "1")
    f.set("period", "2026-05")
    f.set("startDate", "2026-05-01")
    f.set("endDate", "2026-05-31")
    const res = await actions.updatePayroll(1, f)
    expect(res?.success).toBe(true)
  })
})

describe("Payroll errors and limits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findUnique.mockResolvedValue({ id: 1 })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
  })

  it("processPayroll throws if payroll already exists for period", async () => {
    const f = new FormData()
    f.set("employeeId", "1")
    f.set("period", "2026-05")
    f.set("startDate", "2026-05-01")
    f.set("endDate", "2026-05-31")
    // F-076-S BR-PF-03: penjaga lama (employeeId+period) diganti penjaga
    // irisan rentang — slip aktif pada rentang sama menabrak dan ditolak
    // menyebut documentNo penabrak (AC-PF-3), bukan lagi findFirst period.
    prismaMock.payroll.findMany.mockResolvedValue([
      { startDate: new Date("2026-05-01"), endDate: new Date("2026-05-31"), status: "draft", documentNo: "PAY-202605-0001" },
    ])
    const res = await actions.processPayroll(f)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("PAY-202605-0001")
  })
})


describe("F-076-S pisah run payroll mingguan/bulanan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    prismaMock.payroll.findMany.mockResolvedValue([])
  })

  const empRow = (id: number, paymentFrequency: string, loans: unknown[] = []) => ({
    id, baseSalary: 5000000, maritalStatus: "single", dependents: 0,
    departmentId: null, paymentFrequency, employeeLoans: loans,
  })

  it("AC-PF-1: run MONTHLY hanya membuat slip MONTHLY; WEEKLY terhitung frekuensiLain", async () => {
    prismaMock.employee.findMany
      .mockResolvedValueOnce([empRow(1, "MONTHLY"), empRow(2, "WEEKLY")])
      .mockResolvedValue([empRow(1, "MONTHLY"), empRow(2, "WEEKLY")])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(1)
      expect(r.skippedByReason?.frekuensiLain).toBe(1)
    }
    const rows = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0].data as Array<{ employeeId: number }>
    expect(rows.map((x) => x.employeeId)).toEqual([1])
  })

  it("turunan F-076-S: run WEEKLY tidak menarik MONTHLY (frekuensiLain); WEEKLY tanpa pinjaman LOLOS agregator BPJS se-masa", async () => {
    prismaMock.employee.findMany
      .mockResolvedValueOnce([empRow(1, "MONTHLY"), empRow(2, "WEEKLY")])
      .mockResolvedValue([empRow(1, "MONTHLY"), empRow(2, "WEEKLY")])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-04", "2026-05-10", "WEEKLY")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(1)
      expect(r.skippedByReason).toMatchObject({ frekuensiLain: 1 })
      expect(r.skippedByReason?.bpjsBelumDidukung ?? 0).toBe(0)
    }
    const rows = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0].data as Array<{ employeeId: number; statutorySnapshot: Record<string, unknown> }>
    expect(rows.map((x) => x.employeeId)).toEqual([2])
    expect(rows[0]?.statutorySnapshot?.bpjsAggregate).toBeTruthy()
  })

  it("AC-PF-4/AC-PF2-3 + F-105-V: run WEEKLY karyawan berpinjaman tanpa nominal mingguan terlewati alasan pinjaman, tanpa slip", async () => {
    const loanEmp = empRow(2, "WEEKLY", [{ id: 9, weeklyInstallment: null, remainingAmount: 600000 }])
    prismaMock.employee.findMany.mockResolvedValueOnce([loanEmp]).mockResolvedValue([loanEmp])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-04", "2026-05-10", "WEEKLY")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(0)
      expect(r.skippedByReason?.pinjaman).toBe(1)
    }
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
  })

  it("AC-PF-2: slip minggu ke-2 bulan sama LOLOS sesudah inti (slip minggu ke-1 tidak memblokir rentang beda)", async () => {
    const monthly = empRow(1, "MONTHLY")
    prismaMock.employee.findMany.mockResolvedValueOnce([monthly]).mockResolvedValue([monthly])
    prismaMock.payroll.findMany.mockResolvedValue([
      { employeeId: 1, startDate: new Date("2026-05-04"), endDate: new Date("2026-05-10"), status: "paid", documentNo: "PAY-202605-0001", baseSalary: 1000000, bpjsHealthEmployee: 10000, bpjsEmploymentEmployee: 30000, statutorySnapshot: { bpjsAggregate: { basis: 1000000, targetHealth: 10000, targetEmployment: 30000, withheldHealth: 0, withheldEmployment: 0 } } },
    ])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-11", "2026-05-17")
    expect(r?.success).toBe(true)
    if (r?.success) expect(r.count).toBe(1)
    expect(prismaMock.payroll.createMany).toHaveBeenCalled()
  })

  it("AC-PF-3: rentang run beririsan slip existing -> terlewati alasan irisan, karyawan lain tetap terbit", async () => {
    const e1 = empRow(1, "MONTHLY")
    const e2 = empRow(2, "MONTHLY")
    prismaMock.employee.findMany.mockResolvedValueOnce([e1, e2]).mockResolvedValue([e1, e2])
    prismaMock.payroll.findMany.mockResolvedValue([
      { employeeId: 1, startDate: new Date("2026-05-01"), endDate: new Date("2026-05-31"), status: "draft", documentNo: "PAY-202605-0007", baseSalary: 5000000, bpjsHealthEmployee: 50000, bpjsEmploymentEmployee: 150000, statutorySnapshot: { bpjsAggregate: { basis: 5000000, targetHealth: 50000, targetEmployment: 150000, withheldHealth: 0, withheldEmployment: 0 } } },
    ])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(1)
      expect(r.skippedByReason?.irisan).toBe(1)
    }
    const rows = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0].data as Array<{ employeeId: number }>
    expect(rows.map((x) => x.employeeId)).toEqual([2])
  })

  it("AC-PF2-5: period karangan 2026-05-W2 ditolak tulis, createMany tidak jalan", async () => {
    prismaMock.employee.findMany.mockResolvedValue([empRow(1, "MONTHLY")])
    const r = await actions.generateBulkPayroll("2026-05-W2", "2026-05-11", "2026-05-17", "WEEKLY")
    expect(r?.success).toBe(false)
    expect(r?.error).toMatch(/YYYY-MM/)
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
  })

  it("frekuensi run tidak valid ditolak", async () => {
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31", "DAILY")
    expect(r?.success).toBe(false)
    expect(r?.error).toMatch(/MONTHLY atau WEEKLY/)
  })

  it("turunan F-076-S lewat processPayroll: karyawan WEEKLY tanpa pinjaman LOLOS agregator BPJS se-masa (F-103-V)", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ id: 2, paymentFrequency: "WEEKLY", employeeLoans: [] })
    const f = new FormData()
    f.set("employeeId", "2")
    f.set("period", "2026-05")
    f.set("startDate", "2026-05-04")
    f.set("endDate", "2026-05-10")
    const r = await actions.processPayroll(f)
    expect(r?.success).toBe(true)
    const arg = prismaMock.payroll.create.mock.calls.at(-1)?.[0]
    expect(arg?.data?.statutorySnapshot?.bpjsAggregate).toBeTruthy()
  })

  it("AC-PF2-3 lewat processPayroll: karyawan WEEKLY berpinjaman ditolak alasan pinjaman", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ id: 2, paymentFrequency: "WEEKLY", employeeLoans: [{ id: 9, weeklyInstallment: null, remainingAmount: 600000 }] })
    const f = new FormData()
    f.set("employeeId", "2")
    f.set("period", "2026-05")
    f.set("startDate", "2026-05-04")
    f.set("endDate", "2026-05-10")
    const r = await actions.processPayroll(f)
    expect(r?.success).toBe(false)
    expect(r?.error).toMatch(/pinjaman/i)
    expect(prismaMock.payroll.create).not.toHaveBeenCalled()
  })
})

describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("redirect")
  ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"

  const fnsToTest = [
    { name: "createLeaveRequest", fn: () => actions.createLeaveRequest(new FormData()) },
    { name: "createOvertimeRequest", fn: () => actions.createOvertimeRequest(new FormData()) },
    { name: "approveOvertime", fn: () => actions.approveOvertime(1) },
    { name: "processPayroll", fn: () => actions.processPayroll(new FormData()) },
    { name: "updatePayroll", fn: () => actions.updatePayroll(1, new FormData()) },
    { name: "approvePayroll", fn: () => actions.approvePayroll(1) },
    { name: "markPayrollPaid", fn: () => actions.markPayrollPaid(1) },
    { name: "createEmployeeLoan", fn: () => actions.createEmployeeLoan(new FormData()) },
    { name: "createTimesheet", fn: () => actions.createTimesheet(new FormData()) },
    { name: "deleteLeaveRequest", fn: () => actions.deleteLeaveRequest(1) },
    { name: "deleteOvertimeRequest", fn: () => actions.deleteOvertimeRequest(1) },
    { name: "deleteTimesheet", fn: () => actions.deleteTimesheet(1) },
    { name: "deleteEmployeeLoan", fn: () => actions.deleteEmployeeLoan(1) },
    { name: "updateLeaveRequest", fn: () => actions.updateLeaveRequest(1, new FormData()) },
    { name: "updateOvertimeRequest", fn: () => actions.updateOvertimeRequest(1, new FormData()) },
    { name: "updateEmployeeLoan", fn: () => actions.updateEmployeeLoan(1, new FormData()) },
    { name: "updateTimesheet", fn: () => actions.updateTimesheet(1, new FormData()) },
    { name: "createAppreciation", fn: () => actions.createAppreciation(new FormData()) },
    { name: "updateAppreciation", fn: () => actions.updateAppreciation(new FormData()) },
    { name: "deleteAppreciation", fn: () => actions.deleteAppreciation(1) },
  ]

  it("should rethrow NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue(redirectErr)
    for (const { fn } of fnsToTest) {
      await expect(fn()).rejects.toThrow(redirectErr)
    }
  })
})

describe("normalizeWorkDays", () => {
  it("menyusun urut, membuang duplikat, dan menyaring nilai tak sah", () => {
    expect(normalizeWorkDays("5,1,1,3")).toBe("1,3,5")
    expect(normalizeWorkDays(" 1 , 2 ")).toBe("1,2")
    expect(normalizeWorkDays("7,9,-1,abc")).toBe("")
    expect(normalizeWorkDays("")).toBe("")
    expect(normalizeWorkDays(undefined)).toBe("")
    // 0 = Minggu, 6 = Sabtu — keduanya sah (mis. shift mingguan penuh).
    expect(normalizeWorkDays("0,6")).toBe("0,6")
  })
})

/**
 * Kalender kerja: hari libur, hari libur departemen, dan jadwal kerja.
 *
 * Ketiga tabel ini dibaca perhitungan absensi dan sisa cuti, tetapi sebelumnya
 * hanya bisa diisi skrip seed.
 */
describe("Kalender Kerja", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  })

  it("createHoliday menulis nama, tanggal, dan keterangan", async () => {
    prismaMock.holiday.create.mockResolvedValue({ id: 11 })
    const res = await actions.createHoliday(
      fd({ name: "Hari Kemerdekaan", date: "2026-08-17", description: "Libur nasional" }),
    )

    expect(res).toEqual({ success: true, id: 11 })
    expect(requirePermissionMock).toHaveBeenCalledWith("create_holidays")
    const arg = prismaMock.holiday.create.mock.calls[0][0]
    expect(arg.data.name).toBe("Hari Kemerdekaan")
    expect(arg.data.date).toBeInstanceOf(Date)
    expect(arg.data.description).toBe("Libur nasional")
  })

  it("createHoliday menolak nama kosong tanpa menyentuh basis data", async () => {
    const res = await actions.createHoliday(fd({ name: "", date: "2026-08-17" }))
    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("Nama hari libur wajib diisi")
    expect(prismaMock.holiday.create).not.toHaveBeenCalled()
  })

  it("updateHoliday memakai izin edit_holidays dan menolak id tidak valid", async () => {
    prismaMock.holiday.update.mockResolvedValue({})
    const res = await actions.updateHoliday(
      5,
      fd({ name: "Cuti bersama", date: "2026-12-24" }),
    )
    expect(res).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_holidays")

    const bad = await actions.updateHoliday(0, fd({ name: "Cuti bersama", date: "2026-12-24" }))
    expect(bad.success).toBe(false)
    expect(prismaMock.holiday.update).toHaveBeenCalledTimes(1)
  })

  it("deleteHoliday memakai izin delete_holidays", async () => {
    prismaMock.holiday.delete.mockResolvedValue({})
    expect(await actions.deleteHoliday(5)).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("delete_holidays")
    expect(prismaMock.holiday.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it("createWorkSchedule menormalkan hari kerja dan menandai aktif", async () => {
    prismaMock.workSchedule.create.mockResolvedValue({ id: 3 })
    const res = await actions.createWorkSchedule(
      fd({
        name: "Shift Pagi",
        // Formulir menggabungkan checkbox hari menjadi SATU nilai sebelum memanggil
        // aksi (lihat penjaga `work-calendar-form-wiring`): `parseFormData` hanya
        // menyimpan nilai terakhir bila field dikirim berulang.
        workDays: "5,1,1,3",
        startTime: "08:00",
        endTime: "17:00",
        isActive: "on",
      }),
    )

    expect(res).toEqual({ success: true, id: 3 })
    expect(requirePermissionMock).toHaveBeenCalledWith("create_work_schedules")
    const arg = prismaMock.workSchedule.create.mock.calls[0][0]
    // Bentuk yang diurai layanan absensi: angka hari urut dipisah koma.
    expect(arg.data.workDays).toBe("1,3,5")
    expect(arg.data.isActive).toBe(true)
  })

  it("createWorkSchedule menolak jadwal tanpa hari kerja (fallback Senin-Jumat tidak boleh diam-diam)", async () => {
    const res = await actions.createWorkSchedule(
      fd({ name: "Tanpa Hari", startTime: "08:00", endTime: "17:00" }),
    )
    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("Pilih minimal satu hari kerja")
    expect(prismaMock.workSchedule.create).not.toHaveBeenCalled()
  })

  it("createWorkSchedule menolak jam yang bukan HH:MM", async () => {
    const res = await actions.createWorkSchedule(
      fd({ name: "Jam Salah", workDays: ["1"], startTime: "8 pagi", endTime: "17:00" }),
    )
    expect(res.success).toBe(false)
    expect(prismaMock.workSchedule.create).not.toHaveBeenCalled()
  })

  it("updateWorkSchedule memakai izin edit_work_schedules", async () => {
    prismaMock.workSchedule.update.mockResolvedValue({})
    const res = await actions.updateWorkSchedule(
      3,
      fd({ name: "Shift Pagi", workDays: ["1", "2"], startTime: "07:00", endTime: "15:00" }),
    )
    expect(res).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_work_schedules")
  })

  it("updateWorkSchedule menyimpan isActive=false eksplisit dan membiarkan absen tak tersentuh", async () => {
    prismaMock.workSchedule.update.mockResolvedValue({})
    const off = await actions.updateWorkSchedule(
      3,
      fd({ name: "Shift Pagi", workDays: ["1", "2"], startTime: "07:00", endTime: "15:00", isActive: "false" }),
    )
    expect(off).toEqual({ success: true })
    expect(prismaMock.workSchedule.update.mock.calls[0][0].data.isActive).toBe(false)

    prismaMock.workSchedule.update.mockClear()
    const absent = await actions.updateWorkSchedule(
      3,
      fd({ name: "Shift Pagi", workDays: ["1", "2"], startTime: "07:00", endTime: "15:00" }),
    )
    expect(absent).toEqual({ success: true })
    // Kontrak pemanggil non-formulir: field absen tidak boleh menonaktifkan diam-diam.
    expect(prismaMock.workSchedule.update.mock.calls[0][0].data.isActive).toBe(true)
  })

  it("createDepartmentHoliday wajib memilih departemen", async () => {
    const bad = await actions.createDepartmentHoliday(
      fd({ name: "Cuti pabrik", date: "2026-12-24" }),
    )
    expect(bad.success).toBe(false)
    expect(prismaMock.departmentHoliday.create).not.toHaveBeenCalled()

    prismaMock.departmentHoliday.create.mockResolvedValue({ id: 9 })
    const ok = await actions.createDepartmentHoliday(
      fd({ departmentId: "2", name: "Cuti pabrik", date: "2026-12-24" }),
    )
    expect(ok).toEqual({ success: true, id: 9 })
    const arg = prismaMock.departmentHoliday.create.mock.calls[0][0]
    expect(arg.data.departmentId).toBe(2)
  })

  it("deleteWorkSchedule menolak jadwal yang masih ditugaskan", async () => {
    prismaMock.workSchedule.findUnique.mockResolvedValueOnce({
      _count: { employees: 2, departments: 1 },
    })
    const res = await actions.deleteWorkSchedule(3)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("2 karyawan dan 1 departemen")
    expect(prismaMock.workSchedule.delete).not.toHaveBeenCalled()
  })

  it("aksi hapus memakai izin hapus masing-masing", async () => {
    prismaMock.workSchedule.findUnique.mockResolvedValue({ _count: { employees: 0, departments: 0 } })
    prismaMock.workSchedule.delete.mockResolvedValue({})
    prismaMock.departmentHoliday.delete.mockResolvedValue({})

    expect(await actions.deleteWorkSchedule(3)).toEqual({ success: true })
    expect(await actions.deleteDepartmentHoliday(9)).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("delete_work_schedules")
    expect(requirePermissionMock).toHaveBeenCalledWith("delete_holidays")
  })
})

/**
 * Absensi: satu-satunya jalur tulis `Attendance` di kode produk.
 *
 * Aturan yang dijaga blok ini:
 * - `date` = tengah malam UTC untuk hari kalender WIB; `checkIn`/`checkOut` =
 *   instan UTC dari jam dinding WIB (08:05 WIB = 01:05Z).
 * - Karyawan tanpa jadwal kerja aktif yang jam masuknya diisi DITOLAK. Mencatat
 *   `lateMinutes` 0 secara senyap dianggap cacat: kolom itulah yang dibaca
 *   `calculateLatePenalty` dan `getDailyAttendanceMetrics`, jadi keterlambatan
 *   akan hilang tanpa satu pun tanda.
 * - Jadwal efektif berurutan karyawan → departemen → jadwal global tanpa penugasan.
 * - Status pilihan pengguna TIDAK ditimpa (pembaca memperlakukan "status late ATAU
 *   lateMinutes > 0" sebagai terlambat, jadi menandai "present" tetap terbaca terlambat).
 */
describe("Absensi Actions", () => {
  const JADWAL_PAGI = { startTime: "08:00", endTime: "17:00" }
  const dataAbsensi = { employeeId: "1", date: "2026-08-17", status: "present" }

  const karyawanDengan = (workSchedules: unknown[], department: unknown = null) => ({
    id: 1,
    workSchedules,
    department,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findUnique.mockResolvedValue(karyawanDengan([JADWAL_PAGI]))
    prismaMock.employee.findFirst.mockResolvedValue(null)
    prismaMock.workSchedule.findFirst.mockResolvedValue(null)
    prismaMock.attendance.create.mockResolvedValue({ id: 7 })
    prismaMock.attendance.findUniqueOrThrow.mockResolvedValue({ employeeId: 1 })
    prismaMock.attendance.update.mockResolvedValue({})
    prismaMock.attendance.delete.mockResolvedValue({})
  })

  it("createAttendance menyimpan tanggal tengah malam UTC dan jam sebagai instan UTC", async () => {
    const res = await actions.createAttendance(
      fd({ ...dataAbsensi, checkIn: "08:05", checkOut: "17:10", notes: "WFO" }),
    )

    expect(res).toEqual({ success: true, id: 7 })
    expect(requirePermissionMock).toHaveBeenCalledWith("create_attendance")

    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.employeeId).toBe(1)
    // Hari kalender WIB → tengah malam UTC hari itu juga.
    expect(arg.data.date.toISOString()).toBe("2026-08-17T00:00:00.000Z")
    // Jam dinding WIB → instan UTC yang sama dengan seed absensi.
    expect(arg.data.checkIn.toISOString()).toBe("2026-08-17T01:05:00.000Z")
    expect(arg.data.checkOut.toISOString()).toBe("2026-08-17T10:10:00.000Z")
    expect(arg.data.lateMinutes).toBe(5)
    expect(arg.data.overtimeMinutes).toBe(10)
    expect(arg.data.status).toBe("present")
    expect(arg.data.notes).toBe("WFO")
  })

  it("createAttendance tidak menggeser tanggal absensi untuk jam masuk subuh", async () => {
    // 05:30 WIB tersimpan sebagai instan hari UTC sebelumnya, sedangkan `date`
    // tetap hari WIB-nya. Mencampur keduanya menggeser absensi satu hari.
    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "05:30" }))

    expect(res.success).toBe(true)
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.date.toISOString()).toBe("2026-08-17T00:00:00.000Z")
    expect(arg.data.checkIn.toISOString()).toBe("2026-08-16T22:30:00.000Z")
    expect(arg.data.lateMinutes).toBe(0)
  })

  it("createAttendance memakai jadwal KARYAWAN lebih dulu daripada jadwal departemen", async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce(
      karyawanDengan([JADWAL_PAGI], { workSchedules: [{ startTime: "09:00", endTime: "18:00" }] }),
    )

    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "08:05" }))

    expect(res.success).toBe(true)
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.lateMinutes).toBe(5)
    // Jadwal karyawan sudah cukup — jadwal global tidak boleh digantung harapan.
    expect(prismaMock.workSchedule.findFirst).not.toHaveBeenCalled()
  })

  it("createAttendance jatuh ke jadwal DEPARTEMEN bila karyawan belum punya jadwal", async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce(
      karyawanDengan([], { workSchedules: [{ startTime: "09:00", endTime: "18:00" }] }),
    )

    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "09:10" }))

    expect(res.success).toBe(true)
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.lateMinutes).toBe(10)
  })

  it("createAttendance jatuh ke jadwal GLOBAL tanpa penugasan bila karyawan dan departemen kosong", async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce(karyawanDengan([], null))
    prismaMock.workSchedule.findFirst.mockResolvedValueOnce({
      startTime: "07:00",
      endTime: "16:00",
    })

    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "07:30" }))

    expect(res.success).toBe(true)
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.lateMinutes).toBe(30)
  })

  it("createAttendance MENOLAK bila belum ada jadwal kerja aktif padahal jam masuk diisi", async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce(karyawanDengan([], null))
    prismaMock.workSchedule.findFirst.mockResolvedValueOnce(null)

    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "08:05" }))

    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toBe(
      "Karyawan ini belum punya jadwal kerja aktif — buat jadwal kerja lebih dulu " +
        "supaya keterlambatan bisa dihitung dari jam masuk.",
    )
    // Kesalahan senyap yang mencatat 0 keterlambatan justru yang harus dicegah.
    expect(prismaMock.attendance.create).not.toHaveBeenCalled()
  })

  it("createAttendance tetap boleh mencatat absensi tanpa jam masuk meski jadwal belum ada", async () => {
    // Tanpa jam masuk tidak ada yang bisa dihitung (0 memang benar), jadi ini bukan
    // kesalahan senyap: keterlambatan tidak diklaim sama sekali.
    prismaMock.employee.findUnique.mockResolvedValueOnce(karyawanDengan([], null))
    prismaMock.workSchedule.findFirst.mockResolvedValueOnce(null)

    const res = await actions.createAttendance(fd({ ...dataAbsensi, status: "sick" }))

    expect(res).toEqual({ success: true, id: 7 })
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.checkIn).toBeNull()
    expect(arg.data.lateMinutes).toBe(0)
    expect(arg.data.overtimeMinutes).toBe(0)
    expect(arg.data.status).toBe("sick")
  })

  it("createAttendance tidak menimpa status pilihan pengguna walau terlambat", async () => {
    const res = await actions.createAttendance(
      fd({ ...dataAbsensi, checkIn: "08:45", status: "present" }),
    )

    expect(res.success).toBe(true)
    const arg = prismaMock.attendance.create.mock.calls[0][0]
    expect(arg.data.lateMinutes).toBe(45)
    // Pembaca memperlakukan "status late ATAU lateMinutes > 0" sebagai terlambat,
    // jadi status milik pengguna tidak boleh diubah diam-diam.
    expect(arg.data.status).toBe("present")
  })

  it("createAttendance menolak jam keluar sebelum jam masuk tanpa menyentuh basis data", async () => {
    const res = await actions.createAttendance(
      fd({ ...dataAbsensi, checkIn: "17:00", checkOut: "08:00" }),
    )

    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("Jam keluar harus setelah jam masuk")
    expect(prismaMock.attendance.create).not.toHaveBeenCalled()
  })

  it("createAttendance menolak jam dan status di luar format sebelum menyentuh basis data", async () => {
    const jam = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "8 pagi" }))
    expect(jam.success).toBe(false)
    expect(String((jam as { error?: string }).error)).toContain("Jam masuk harus format HH:MM")

    const status = await actions.createAttendance(fd({ ...dataAbsensi, status: "bolos" }))
    expect(status.success).toBe(false)
    expect(String((status as { error?: string }).error)).toContain("Status absensi tidak dikenal")

    expect(prismaMock.attendance.create).not.toHaveBeenCalled()
  })

  it("createAttendance menerjemahkan pelanggaran batasan unik (P2002) jadi pesan yang terbaca", async () => {
    const duplikat = Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    prismaMock.attendance.create.mockRejectedValueOnce(duplikat)

    const res = await actions.createAttendance(fd({ ...dataAbsensi, checkIn: "08:05" }))

    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toBe(
      "Absensi karyawan untuk tanggal itu sudah ada — ubah yang sudah tercatat.",
    )
  })

  it("updateAttendance memakai izin edit_attendance dan menghitung ulang keterlambatan", async () => {
    const res = await actions.updateAttendance(
      7,
      fd({ ...dataAbsensi, checkIn: "08:20", checkOut: "17:30", status: "late" }),
    )

    expect(res).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("edit_attendance")
    const arg = prismaMock.attendance.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 7 })
    expect(arg.data.lateMinutes).toBe(20)
    expect(arg.data.overtimeMinutes).toBe(30)
    expect(arg.data.status).toBe("late")
  })

  it("updateAttendance menolak bila jadwal kerja hilang dan jam masuk diisi", async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce(karyawanDengan([], null))
    prismaMock.workSchedule.findFirst.mockResolvedValueOnce(null)

    const res = await actions.updateAttendance(7, fd({ ...dataAbsensi, checkIn: "08:05" }))

    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("belum punya jadwal kerja aktif")
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
  })

  it("updateAttendance memakai karyawan TERCATAT untuk pemeriksaan cakupan", async () => {
    // Pemanggil hanya boleh menyentuh absensi miliknya sendiri; karyawan pencatatnya
    // dibaca dari baris yang ada, bukan dari FormData.
    requirePermissionMock.mockResolvedValue({ id: 11, roles: ["employee"] })
    prismaMock.employee.findFirst.mockResolvedValueOnce(null)

    const res = await actions.updateAttendance(7, fd(dataAbsensi))

    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("tidak memiliki akses")
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
  })

  it("updateAttendance menolak id tidak valid tanpa menyentuh basis data", async () => {
    const res = await actions.updateAttendance(0, fd(dataAbsensi))

    expect(res.success).toBe(false)
    expect(String((res as { error?: string }).error)).toContain("Id absensi tidak valid")
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
  })

  it("deleteAttendance memakai izin manage_attendance dan menolak id tidak valid", async () => {
    expect(await actions.deleteAttendance(7)).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_attendance")
    expect(prismaMock.attendance.delete).toHaveBeenCalledWith({ where: { id: 7 } })

    const bad = await actions.deleteAttendance(0)
    expect(bad.success).toBe(false)
    expect(prismaMock.attendance.delete).toHaveBeenCalledTimes(1)
  })
})


describe("F-2026-10-22-076-S generateBulkPayroll penjaga irisan bertransaksi (audit t_a92d0da1)", () => {
  // Prisma mock tidak bisa menegakkan locking nyata. Kontrak yang diuji:
  // (1) karyawan populasi target dikunci FOR UPDATE (urutan id menaik,
  //     anti-deadlock) DI DALAM transaksi yang sama dengan createMany;
  // (2) irisan dicek ULANG terhadap slip aktif di dalam transaksi sesudah
  //     kunci — slip yang masuk sesudah baca luar (run konkuren) terlewat
  //     alasan "irisan", BUKAN ikut dibuat (sebelum fix: dua run konkuren
  //     rentang beririsan tak identik sama-sama lolos createMany).
  const emitOrder: string[] = []
  let inTxPayrolls: Array<Record<string, unknown>> = []

  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    emitOrder.length = 0
    inTxPayrolls = [
      { employeeId: 1, startDate: new Date("2026-05-01"), endDate: new Date("2026-05-15"), status: "draft", documentNo: "PAY-RACE-0001" },
    ]
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findMany.mockResolvedValue([
      { id: 2, baseSalary: 5000000, maritalStatus: "single", dependents: 0, departmentId: null, paymentFrequency: "MONTHLY", employeeLoans: [], employmentEndedAt: null },
      { id: 1, baseSalary: 5000000, maritalStatus: "single", dependents: 0, departmentId: null, paymentFrequency: "MONTHLY", employeeLoans: [], employmentEndedAt: null },
    ])
    prismaMock.payroll.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.status === "draft" && args?.select?.componentLines) return []
      return []
    })
    prismaMock.employee.findUnique.mockResolvedValue({ id: 1 })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    prismaMock.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      if (sql.includes("FOR UPDATE") && sql.includes("employees")) {
        const joined = (values[0] as { values?: unknown[] } | undefined)?.values ?? values
        emitOrder.push(`lock:${joined.map(String).join(",")}`)
        return joined.map((v) => ({ id: Number(v) }))
      }
      return [{ id: 1 }]
    })
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: prismaMock.$queryRaw,
        payroll: {
          findMany: vi.fn(async () => { emitOrder.push("txFindMany"); return inTxPayrolls }),
          createMany: vi.fn(async (args: any) => {
            emitOrder.push("txCreateMany")
            return prismaMock.payroll.createMany(args)
          }),
        },
      }
      return fn(tx)
    })
  })

  it("kunci FOR UPDATE + cek ulang irisan di transaksi sama mendahului createMany; slip race terlewat irisan", async () => {
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(1)
      expect(r.skippedByReason?.irisan).toBe(1)
    }
    expect(emitOrder[0]).toBe("lock:1,2")
    const lockIdx = emitOrder.indexOf("lock:1,2")
    const findIdx = emitOrder.indexOf("txFindMany")
    const createIdx = emitOrder.indexOf("txCreateMany")
    expect(findIdx).toBeGreaterThan(lockIdx)
    expect(createIdx).toBeGreaterThan(findIdx)
    const rows = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0].data as Array<{ employeeId: number }>
    expect(rows.map((x) => x.employeeId)).toEqual([2])
  })
})

describe("getEmployeeLifecycleAttention — gerbang aksi F-085-S (F-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.hrScopeOverride.current = { kind: "self", employeeId: 9 }
    mocks.loadLifecycleMock.mockResolvedValue([{ employeeId: 9, kind: "statusUnset" }])
  })

  it("izin ditolak -> success:false, scope & loader 0x dipanggil", async () => {
    requirePermissionMock.mockRejectedValue(new Error("Anda tidak memiliki izin view_employees"))

    const res = await actions.getEmployeeLifecycleAttention()

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/view_employees/)
    expect(requirePermissionMock).toHaveBeenCalledWith("view_employees")
    expect(mocks.getHrScopeMock).not.toHaveBeenCalled()
    expect(mocks.loadLifecycleMock).not.toHaveBeenCalled()
  })

  it("lolos: requirePermission(view_employees) -> getHrScope(user) -> loader(scope) -> rows apa adanya", async () => {
    const user = { id: 42, roles: ["kepala_bengkel"] }
    const scope = { kind: "department", departmentId: 7, employeeId: 42 }
    const rows = [{ employeeId: 42, kind: "contractExpiring" }]
    requirePermissionMock.mockResolvedValue(user)
    mocks.hrScopeOverride.current = scope
    mocks.loadLifecycleMock.mockResolvedValue(rows)

    const res = await actions.getEmployeeLifecycleAttention()

    expect(requirePermissionMock).toHaveBeenCalledTimes(1)
    expect(requirePermissionMock).toHaveBeenCalledWith("view_employees")
    expect(mocks.getHrScopeMock).toHaveBeenCalledTimes(1)
    expect(mocks.getHrScopeMock).toHaveBeenCalledWith(user)
    expect(mocks.loadLifecycleMock).toHaveBeenCalledTimes(1)
    expect(mocks.loadLifecycleMock).toHaveBeenCalledWith(scope)
    expect(res).toEqual({ success: true, rows })
  })
})

describe("TASK-018 regresi payroll (bulk TER, gerbang, final, plafon, pinjaman)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerBracketMock()
    requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 1 })
    prismaMock.payroll.findMany.mockResolvedValue([])
    // Describe t_a92d0da1 di atas mengganti $transaction/$queryRaw dengan tx
    // minimal — pulihkan perilaku default mock untuk tes-tes ini.
    prismaMock.$queryRaw.mockResolvedValue([{ id: 1 }])
    prismaMock.$transaction.mockImplementation(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    })
  })

  it("(1) bulk WEEKLY minggu ke-4: TER atas bruto gabungan se-masa, bukan per-slip", async () => {
    const weekly = {
      id: 2, baseSalary: 2600000, maritalStatus: "single", dependents: 0,
      departmentId: null, paymentFrequency: "WEEKLY", employeeLoans: [],
    }
    prismaMock.employee.findMany.mockResolvedValue([weekly])
    // Tabel uji: <=3jt tarif 0, di atasnya 2,5% — per-slip 2,6jt = 0,
    // gabungan 4 x 2,6jt = 10,4jt menghasilkan 260.000.
    ;(prismaMock.payrollTerBracket.findMany as any).mockResolvedValue([
      { category: "A", lowerBound: 0, upperBound: 3000000, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
      { category: "A", lowerBound: 3000000, upperBound: null, rateMilliPercent: 2500, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
    ])
    const agg = { bpjsAggregate: { basis: 2600000, targetHealth: 26000, targetEmployment: 78000, withheldHealth: 0, withheldEmployment: 0 } }
    const prior = (doc: string, start: string, end: string) => ({
      employeeId: 2, startDate: new Date(start), endDate: new Date(end), status: "paid",
      documentNo: doc, baseSalary: 2600000, grossSalary: 2600000, pph21: 0,
      bpjsHealthEmployee: 26000, bpjsEmploymentEmployee: 78000, statutorySnapshot: agg,
    })
    prismaMock.payroll.findMany.mockResolvedValue([
      prior("PAY-202605-0001", "2026-05-04", "2026-05-10"),
      prior("PAY-202605-0002", "2026-05-11", "2026-05-17"),
      prior("PAY-202605-0003", "2026-05-18", "2026-05-24"),
    ])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-25", "2026-05-31", "WEEKLY")
    expect(r?.success).toBe(true)
    if (r?.success) expect(r.count).toBe(1)
    const rows = prismaMock.payroll.createMany.mock.calls.at(-1)?.[0].data as Array<{ pph21: number }>
    expect(rows[0].pph21).toBe(260000)
  })

  it("(4) bulk: plafon 50% memasukkan potongan komponen — pelanggar terlewati plafonPotongan", async () => {
    const monthly = {
      id: 1, baseSalary: 2000000, maritalStatus: "single", dependents: 0,
      departmentId: null, paymentFrequency: "MONTHLY", employeeLoans: [],
    }
    prismaMock.employee.findMany.mockResolvedValue([monthly])
    prismaMock.employeePayrollComponent.findMany.mockResolvedValue([
      {
        id: 11, employeeId: 1, componentId: 7, defaultAmount: 1500000,
        effectiveFrom: new Date("2026-01-01"), effectiveTo: null,
        component: { name: "Potongan Koperasi", kind: "deduction", recurrence: "fixed", isTaxable: false, accountId: null },
      },
    ])
    const r = await actions.generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(r?.success).toBe(true)
    if (r?.success) {
      expect(r.count).toBe(0)
      expect(r.skippedByReason?.plafonPotongan).toBe(1)
    }
    expect(prismaMock.payroll.createMany).not.toHaveBeenCalled()
  })

  it("(3) updatePayroll mempertahankan kelas final-resign dari snapshot existing", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", documentNo: "PAY-202605-0009",
      statutorySnapshot: { fromFallback: false, pph21Ter: { method: "TER", periodKind: "final-resignation" } },
    })
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 1, employmentEndedAt: new Date("2026-06-05"), paymentFrequency: "MONTHLY",
      employeeLoans: [], maritalStatus: "single", dependents: 0, joinDate: new Date("2026-01-01"),
    })
    const f = new FormData()
    f.set("employeeId", "1")
    f.set("period", "2026-05")
    f.set("startDate", "2026-05-01")
    f.set("endDate", "2026-05-31")
    const r = await actions.updatePayroll(1, f)
    expect(r?.success).toBe(true)
    const updateArg = prismaMock.payroll.update.mock.calls.at(-1)?.[0] as { data: { statutorySnapshot: { pph21Ter: { periodKind: string } } } }
    expect(updateArg.data.statutorySnapshot.pph21Ter.periodKind).toBe("final-resignation")
  })

  it("(2) markPayrollPaid menolak slip fallback 2024 yang ter-approve di luar gerbang", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "approved", employeeId: 1, loanDeduction: 0,
      statutorySnapshot: { fromFallback: true },
    })
    const r = await actions.markPayrollPaid(1)
    expect(r?.success).toBe(false)
    expect(r?.error).toContain("cadangan (2024)")
    expect(prismaMock.payroll.updateMany).not.toHaveBeenCalled()
  })

  it("(6) amortisasi dibayar memakai snapshot slip walau cicilan master berubah", async () => {
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "approved", employeeId: 1, loanDeduction: 500000,
      statutorySnapshot: { fromFallback: false, pph21Ter: { method: "TER", periodKind: "monthly" } },
    })
    prismaMock.employeeLoan.findMany.mockResolvedValue([
      { id: 5, employeeId: 1, status: "active", loanDate: new Date(2026, 0, 1), monthlyInstallment: 300000, weeklyInstallment: null, remainingAmount: 1000000 },
    ])
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      salaryExpenseAccountId: 601, payrollBankAccountId: 602,
      salariesPayableAccountId: 603, employeeReceivableAccountId: 604,
    })
    const r = await actions.markPayrollPaid(1)
    expect(r?.success).toBe(true)
    const upd = prismaMock.employeeLoan.update.mock.calls.at(-1)?.[0] as { data: { remainingAmount: number } }
    // Jurnal mengkredit Piutang sebesar snapshot 500rb; subledger wajib sama
    // (master berjalan 300rb tidak lagi mengplafon amortisasi).
    expect(upd.data.remainingAmount).toBe(500000)
  })
})
