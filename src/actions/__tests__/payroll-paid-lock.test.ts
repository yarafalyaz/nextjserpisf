import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const payrollFindUniqueOrThrowMock = vi.fn()
const payrollUpdateManyMock = vi.fn()
const loanFindManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: {
      findUniqueOrThrow: (...a: unknown[]) => payrollFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => payrollUpdateManyMock(...a),
    },
    employeeLoan: {
      findMany: (...a: unknown[]) => loanFindManyMock(...a),
    },
    $transaction: async (cb: any) => cb({
      payroll: { updateMany: (...a: unknown[]) => payrollUpdateManyMock(...a) },
      employeeLoan: { 
        findMany: (...a: unknown[]) => loanFindManyMock(...a),
        update: vi.fn(),
      }
    }),
  },
}))

vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("@/lib/hooks/accounting.hook", () => ({ onPayrollPaid: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { markPayrollPaid } from "../hrm.actions"

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  payrollFindUniqueOrThrowMock.mockResolvedValue({
    id: 1, status: "approved", employeeId: 2, loanDeduction: 1000
  })
  payrollUpdateManyMock.mockResolvedValue({ count: 1 })
  loanFindManyMock.mockResolvedValue([])
})

describe("markPayrollPaid concurrency guard", () => {
  it("completes via an atomic conditional claim scoped to approved status", async () => {
    const result = await markPayrollPaid(1)
    expect(result.success).toBe(true)
    expect(payrollUpdateManyMock).toHaveBeenCalledTimes(1)
    const claimArg = payrollUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where.id).toBe(1)
    expect(claimArg.where.status).toBe("approved")
    expect(claimArg.data.status).toBe("paid")
  })

  it("aborts when the claim is lost (count===0)", async () => {
    payrollUpdateManyMock.mockResolvedValue({ count: 0 })
    const result = await markPayrollPaid(1)
    expect(result.success).toBe(false)
    expect(loanFindManyMock).not.toHaveBeenCalled()
  })
})
