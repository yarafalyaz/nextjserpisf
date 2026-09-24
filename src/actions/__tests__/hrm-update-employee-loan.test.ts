import { describe, it, expect, vi, beforeEach } from "vitest"
import { updateEmployeeLoan } from "../hrm.actions"

// updateEmployeeLoan now runs its writes inside prisma.$transaction(async (tx) =>
// ...) with a SELECT ... FOR UPDATE guard and a conditional updateMany, and it
// resolves the caller's HR scope first. The mock therefore has to expose the tx
// client, the row-lock raw query, updateMany, and a session user WITH roles
// (getHrScope fails closed on a missing roles array).

const mocks = vi.hoisted(() => {
  const txDelegates = {
    employeeLoan: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  }
  return {
    prismaMock: {
      employeeLoan: {
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
      },
      // getHrScope() looks up the caller's employee row for non-privileged roles.
      employee: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txDelegates)),
    },
    txDelegates,
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
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

const pendingLoan = {
  totalAmount: 10000,
  remainingAmount: 10000,
  status: "pending",
  employeeId: 2,
}

function loanForm(totalAmount: string) {
  const formData = new FormData()
  formData.append("employeeId", "2")
  formData.append("loanDate", "2026-06-15")
  formData.append("totalAmount", totalAmount)
  formData.append("monthlyInstallment", "1000")
  return formData
}

describe("updateEmployeeLoan bug verification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // "admin" is in hr-scope's ALL_ACCESS_ROLES, so scope is `all` and the edit is
    // not restricted to the caller's own employee row.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    mocks.prismaMock.$queryRaw.mockResolvedValue([])
    mocks.txDelegates.$queryRaw.mockResolvedValue([])
    mocks.prismaMock.employeeLoan.updateMany.mockResolvedValue({ count: 1 })
    mocks.txDelegates.employeeLoan.updateMany.mockResolvedValue({ count: 1 })
  })

  it("should fail when updating a non-pending loan (e.g. active, paid_off)", async () => {
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValue({
      ...pendingLoan,
      status: "active",
    })

    const res = await updateEmployeeLoan(1, loanForm("20000"))

    expect(res.success).toBe(false)
    expect(res.error).toContain("Hanya pinjaman berstatus menunggu yang dapat diedit")
    expect(mocks.txDelegates.employeeLoan.updateMany).not.toHaveBeenCalled()
  })

  it("should allow updating a pending loan", async () => {
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValue(pendingLoan)
    mocks.txDelegates.employeeLoan.findUniqueOrThrow.mockResolvedValue(pendingLoan)

    const res = await updateEmployeeLoan(1, loanForm("12000"))

    expect(res.success).toBe(true)
    expect(mocks.txDelegates.employeeLoan.updateMany).toHaveBeenCalledTimes(1)
    // delta = 12000 - 10000 = 2000 -> remaining 10000 + 2000 = 12000
    expect(mocks.txDelegates.employeeLoan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, status: "pending" }),
        data: expect.objectContaining({ remainingAmount: 12000 }),
      }),
    )
  })

  it("reports a conflict when the conditional update matches no pending row", async () => {
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValue(pendingLoan)
    mocks.txDelegates.employeeLoan.findUniqueOrThrow.mockResolvedValue(pendingLoan)
    mocks.txDelegates.employeeLoan.updateMany.mockResolvedValue({ count: 0 })

    const res = await updateEmployeeLoan(1, loanForm("12000"))

    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah diproses")
  })

  it("denies a self-scoped user editing someone else's loan", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: [] })
    // No linked employee row -> fail-closed scope { kind: "self", employeeId: -1 }.
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)

    const res = await updateEmployeeLoan(1, loanForm("12000"))

    expect(res.success).toBe(false)
    expect(mocks.txDelegates.employeeLoan.updateMany).not.toHaveBeenCalled()
  })
})
