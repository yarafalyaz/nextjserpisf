import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-018-S AC-LS-B3/B4 — persetujuan pinjaman lewat mesin
 * ApprovalWorkflow existing (approval.actions.ts):
 * - AC-LS-B3: pembuat pinjaman TIDAK bisa menyetujui pinjamannya sendiri
 *   (Maker-Checker existing) dan izin menyetujui digerbang `approve_loans`
 *   (APPROVAL_REFERENCE_PERMISSIONS.EmployeeLoan) — bukan izin lain.
 * - AC-LS-B4: persetujuan final membalik EmployeeLoan pending→active +
 *   memanggil hook jurnal pencairan `onEmployeeLoanDisbursed` TEPAT satu
 *   kali di dalam transaksi yang sama; retry sesudah approval selesai
 *   ditolak ("Approval sudah diproses") tanpa jurnal kedua.
 *
 * Mock mengikuti pola approval.actions.test.ts existing; hook jurnal
 * dimock supaya hitungan panggilan = bukti jurnal (nol panggilan ekstra).
 */

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: 1 }),
  })

  const prismaMock: Record<string, unknown> = {
    approval: buildModelMock(),
    approvalHistory: buildModelMock(),
    employeeLoan: buildModelMock(),
    role: buildModelMock(),
    $transaction: vi.fn(async (ops: unknown) => {
      if (typeof ops === "function") {
        return (ops as (tx: unknown) => unknown)(prismaMock)
      }
      return Promise.all(ops as Promise<unknown>[])
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }

  return {
    prismaMock: prismaMock as typeof prismaMock & {
      approval: ReturnType<typeof buildModelMock>
      employeeLoan: ReturnType<typeof buildModelMock>
    },
    requirePermissionMock: vi.fn(),
    authMock: vi.fn(),
    disbursedMock: vi.fn().mockResolvedValue(undefined),
    syncPettyCashMock: vi.fn().mockResolvedValue(undefined),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/auth/auth", () => ({ auth: mocks.authMock }))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onEmployeeLoanDisbursed: mocks.disbursedMock,
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: mocks.syncPettyCashMock,
}))
vi.mock("@/lib/security/csrf", () => ({ assertCSRF: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))

import { approveStep } from "../approval.actions"

const fd = () => {
  const f = new FormData()
  f.append("notes", "OK")
  return f
}

function seedLoanApproval(over: Record<string, unknown> = {}) {
  mocks.prismaMock.approval.findUnique.mockResolvedValue({
    id: 9,
    slug: "approval-pinjaman",
    status: "pending",
    currentStep: 1,
    referenceType: "EmployeeLoan",
    referenceId: 77,
    requestedBy: 42,
    workflow: {
      steps: [{ stepOrder: 1, roleId: null, userId: null, approverType: "any" }],
    },
    ...over,
  })
}

const asApprover = (id: number, permissions: string[]) =>
  mocks.authMock.mockResolvedValue({
    user: { id: String(id), roles: ["hr"], permissions },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.disbursedMock.mockResolvedValue(undefined)
  seedLoanApproval()
})

describe("approveStep EmployeeLoan (AC-LS-B3/B4)", () => {
  it("AC-LS-B4: persetujuan final -> EmployeeLoan active + hook jurnal pencairan tepat satu kali", async () => {
    asApprover(5, ["approve_loans"])

    await approveStep(9, fd())

    expect(mocks.prismaMock.employeeLoan.update).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.employeeLoan.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { status: "active", approvedBy: 5 },
    })
    expect(mocks.disbursedMock).toHaveBeenCalledTimes(1)
    expect(mocks.disbursedMock).toHaveBeenCalledWith(
      77,
      5,
      expect.anything(),
    )
  })

  it("AC-LS-B4: retry sesudah approval selesai ditolak, nol jurnal kedua dan nol flip ulang", async () => {
    asApprover(5, ["approve_loans"])
    seedLoanApproval({ status: "approved" })

    await expect(approveStep(9, fd())).rejects.toThrow("Approval sudah diproses")

    expect(mocks.disbursedMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("AC-LS-B3: pembuat pinjaman tidak menyetujui pinjamannya sendiri (Maker-Checker)", async () => {
    // requestedBy = 42; approver adalah user 42 yang sama.
    asApprover(42, ["approve_loans"])

    await expect(approveStep(9, fd())).rejects.toThrow("Maker-Checker")

    expect(mocks.disbursedMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("AC-LS-B3: tanpa approve_loans ditolak walau memegang izin approve dokumen lain", async () => {
    asApprover(5, ["approve_leave_requests", "view_employee_loans"])

    await expect(approveStep(9, fd())).rejects.toThrow(
      "tidak memiliki izin menyetujui",
    )

    expect(mocks.disbursedMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employeeLoan.update).not.toHaveBeenCalled()
  })
})
