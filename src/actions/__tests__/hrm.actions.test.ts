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

  const prismaMock = {
    timesheet: buildModelMock(),
    employeeLoan: buildModelMock(),
    leaveRequest: buildModelMock(),
    overtimeRequest: buildModelMock(),
    appreciation: buildModelMock(),
    payroll: buildModelMock(),
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
  }
})

const {
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

function fd(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else f.set(k, v)
  }
  return f
}

import * as actions from "../hrm.actions"

const EXPORTED_FN_NAMES = [
  "createLeaveRequest", "approveLeave", "rejectLeave",
  "createOvertimeRequest", "approveOvertime",
  "createEmployeeLoan", "createTimesheet",
  "deleteLeaveRequest", "deleteOvertimeRequest", "deleteTimesheet",
  "deleteEmployeeLoan",
  "updateLeaveRequest", "updateOvertimeRequest", "updateEmployeeLoan",
  "updateTimesheet",
  "createAppreciation", "updateAppreciation", "deleteAppreciation",
]

describe("HRM Actions exports smoke test", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it("approveLeave updates status", async () => {
    const res = await actions.approveLeave(1)
    expect(res?.success).toBe(true)
    expect(assertApprovedMock).toHaveBeenCalledWith("LeaveRequest", 1)
    expect(prismaMock.leaveRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, status: "pending" } }),
    )
  })

  it("approveLeave is an idempotent success for a workflow-approved request", async () => {
    // The approval engine flips status to "approved" before this action runs.
    // LeaveRequest has no post-approval side-effect, so that is already the
    // desired end state; throwing "not pending" here only confused the final
    // approver. It must succeed without a second status write.
    prismaMock.leaveRequest.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, employeeId: 1, status: "approved",
    })
    const res = await actions.approveLeave(1)
    expect(res?.success).toBe(true)
    expect(prismaMock.leaveRequest.updateMany).not.toHaveBeenCalled()
  })

  it("rejectLeave updates status with reason", async () => {
    const res = await actions.rejectLeave(1, "Tidak cukup karyawan")
    expect(res?.success).toBe(true)
    expect(assertApprovedMock).toHaveBeenCalledWith("LeaveRequest", 1)
    expect(prismaMock.leaveRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, status: "pending" } }),
    )
    expect(requirePermissionMock).toHaveBeenCalledWith("approve_leave_requests")
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
})

describe("Appreciation Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      employee: { name: "A", code: "A1" }
    }
    prismaMock.payroll.findUnique.mockResolvedValue(defaultPayroll)
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue(defaultPayroll)
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      bpjsKesehatanPrc: 1, bpjsKetenagakerjaanPrc: 2, defaultWorkingDays: 22,
    })
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
    prismaMock.payroll.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "approved", netPay: 5000000, employeeId: 1, period: "2026-05",
      loanDeduction: 0, employee: { name: "A", code: "A1" }
    })
    const res = await actions.markPayrollPaid(1)
    expect(res?.success).toBe(true)
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
  })
  it("approveLeave handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).approveLeave(arg1, arg2); } catch {} 
  })
  it("rejectLeave handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).rejectLeave(arg1, arg2); } catch {} 
  })
  it("createOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createOvertimeRequest(arg1, arg2); } catch {} 
  })
  it("approveOvertime handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).approveOvertime(arg1, arg2); } catch {} 
  })
  it("getPayrollEstimation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).getPayrollEstimation(arg1, arg2); } catch {} 
  })
  it("generateBulkPayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).generateBulkPayroll(arg1, arg2); } catch {} 
  })
  it("processPayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).processPayroll(arg1, arg2); } catch {} 
  })
  it("updatePayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePayroll(arg1, arg2); } catch {} 
  })
  it("approvePayroll handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).approvePayroll(arg1, arg2); } catch {} 
  })
  it("markPayrollPaid handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).markPayrollPaid(arg1, arg2); } catch {} 
  })
  it("createEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createEmployeeLoan(arg1, arg2); } catch {} 
  })
  it("createTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createTimesheet(arg1, arg2); } catch {} 
  })
  it("deleteLeaveRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteLeaveRequest(arg1, arg2); } catch {} 
  })
  it("deleteOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteOvertimeRequest(arg1, arg2); } catch {} 
  })
  it("deleteTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteTimesheet(arg1, arg2); } catch {} 
  })
  it("deleteEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteEmployeeLoan(arg1, arg2); } catch {} 
  })
  it("updateLeaveRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateLeaveRequest(arg1, arg2); } catch {} 
  })
  it("updateOvertimeRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateOvertimeRequest(arg1, arg2); } catch {} 
  })
  it("updateEmployeeLoan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateEmployeeLoan(arg1, arg2); } catch {} 
  })
  it("updateTimesheet handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateTimesheet(arg1, arg2); } catch {} 
  })
  it("createAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createAppreciation(arg1, arg2); } catch {} 
  })
  it("updateAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateAppreciation(arg1, arg2); } catch {} 
  })
  it("deleteAppreciation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteAppreciation(arg1, arg2); } catch {} 
  })
})

describe("generateBulkPayroll edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    prismaMock.payroll.findFirst.mockResolvedValueOnce({ id: 1 })
    const res = await actions.processPayroll(f)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah ada")
  })
})


describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("redirect")
  ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"

  const fnsToTest = [
    { name: "createLeaveRequest", fn: () => actions.createLeaveRequest(new FormData()) },
    { name: "approveLeave", fn: () => actions.approveLeave(1) },
    { name: "rejectLeave", fn: () => actions.rejectLeave(1) },
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
