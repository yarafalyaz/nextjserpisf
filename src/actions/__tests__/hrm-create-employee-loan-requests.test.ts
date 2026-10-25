import { describe, it, expect, vi, beforeEach } from "vitest"
import { createEmployeeLoan } from "../hrm.actions"

// F-2026-10-25-018-S Q-LS-1/Q-LS-3b: createEmployeeLoan menerima DUA pintu
// izin — create_loans (staf/titipan, perilaku existing) dan
// create_employee_loan_requests (mandiri, hanya employee tertaut sendiri).
// update/deleteEmployeeLoan tetap create_loans saja (diuji di file existing).

const mocks = vi.hoisted(() => {
  const txDelegates = {
    employeeLoan: { create: vi.fn() },
  }
  return {
    prismaMock: {
      employee: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      employeeLoan: { create: vi.fn() },
      $transaction: vi.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(txDelegates),
      ),
    },
    txDelegates,
    requireAnyPermissionMock: vi.fn(),
    requirePermissionMock: vi.fn(),
    requestApprovalMock: vi.fn().mockResolvedValue(false),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
  requireAnyPermission: mocks.requireAnyPermissionMock,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidateMock,
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))

vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: mocks.requestApprovalMock,
  assertApproved: vi.fn(),
}))

vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn().mockResolvedValue("pinjaman-2026-10-25"),
}))

function loanForm(employeeId: string) {
  const formData = new FormData()
  formData.append("employeeId", employeeId)
  formData.append("loanDate", "2026-10-25")
  formData.append("totalAmount", "5000000")
  formData.append("monthlyInstallment", "500000")
  return formData
}

describe("createEmployeeLoan dua pintu izin (Q-LS-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requestApprovalMock.mockResolvedValue(false)
    mocks.txDelegates.employeeLoan.create.mockResolvedValue({ id: 11 })
    // User 42 tertaut employee 7.
    mocks.prismaMock.employee.findFirst.mockResolvedValue({
      id: 7,
      departmentId: 3,
    })
  })

  it("AC-LS-B1: karyawan mandiri mengajukan untuk diri sendiri -> pending + createdBy pengaju", async () => {
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 42,
      roles: ["karyawan"],
      permissions: ["create_employee_loan_requests", "view_employee_loans"],
    })

    const res = await createEmployeeLoan(loanForm("7"))

    expect(res.success).toBe(true)
    expect(mocks.requireAnyPermissionMock).toHaveBeenCalledWith([
      "create_loans",
      "create_employee_loan_requests",
    ])
    expect(mocks.txDelegates.employeeLoan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 7,
        status: "pending",
        createdBy: 42,
      }),
    })
  })

  it("AC-LS-B1: karyawan mandiri mengajukan untuk orang lain ditolak server, nol baris", async () => {
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 42,
      roles: ["karyawan"],
      permissions: ["create_employee_loan_requests", "view_employee_loans"],
    })

    const res = await createEmployeeLoan(loanForm("8"))

    expect(res.success).toBe(false)
    expect(res.error).toContain("diri sendiri")
    expect(mocks.txDelegates.employeeLoan.create).not.toHaveBeenCalled()
  })

  it("AC-LS-B2: user tanpa employee tertaut (scope -1) ditolak, nol baris", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 42,
      roles: ["karyawan"],
      permissions: ["create_employee_loan_requests"],
    })

    const res = await createEmployeeLoan(loanForm("7"))

    expect(res.success).toBe(false)
    expect(mocks.txDelegates.employeeLoan.create).not.toHaveBeenCalled()
  })

  it("AC-LS-B8: pintu mandiri tidak membuka titipan walau scope department", async () => {
    // kepala_bengkel tanpa create_loans tetapi memegang key mandiri:
    // scope department tidak boleh dipakai mengajukan untuk bawahan.
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 42,
      roles: ["kepala_bengkel"],
      permissions: ["create_employee_loan_requests"],
    })
    mocks.prismaMock.employee.findUnique.mockResolvedValue({
      departmentId: 3,
    })

    const res = await createEmployeeLoan(loanForm("8"))

    expect(res.success).toBe(false)
    expect(res.error).toContain("diri sendiri")
    expect(mocks.txDelegates.employeeLoan.create).not.toHaveBeenCalled()
  })

  it("AC-LS-B2: pengajuan sah lahir pending + SATU permintaan approval dalam satu transaksi, nol hook jurnal pencairan", async () => {
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 42,
      roles: ["karyawan"],
      permissions: ["create_employee_loan_requests", "view_employee_loans"],
    })
    mocks.requestApprovalMock.mockResolvedValue(true)

    const res = await createEmployeeLoan(loanForm("7"))

    expect(res.success).toBe(true)
    // Satu transaksi membungkus lahirnya pinjaman + permintaan approval.
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txDelegates.employeeLoan.create).toHaveBeenCalledTimes(1)
    expect(mocks.txDelegates.employeeLoan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "pending" }),
    })
    // Tepat satu permintaan ApprovalWorkflow, di dalam transaksi yang sama
    // (argumen ke-4 = klien tx), untuk pinjaman yang baru lahir.
    expect(mocks.requestApprovalMock).toHaveBeenCalledTimes(1)
    expect(mocks.requestApprovalMock).toHaveBeenCalledWith(
      "EmployeeLoan",
      11,
      42,
      mocks.txDelegates,
    )
  })

  it("regresi staf: pemegang create_loans tetap bisa titipan dalam scope (all)", async () => {
    mocks.requireAnyPermissionMock.mockResolvedValue({
      id: 1,
      roles: ["finance"],
      permissions: ["create_loans"],
    })

    const res = await createEmployeeLoan(loanForm("8"))

    expect(res.success).toBe(true)
    expect(mocks.txDelegates.employeeLoan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 8,
        status: "pending",
        createdBy: 1,
      }),
    })
  })
})
