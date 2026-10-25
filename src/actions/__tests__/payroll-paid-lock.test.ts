import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const payrollFindUniqueOrThrowMock = vi.fn()
const payrollUpdateManyMock = vi.fn()
const loanFindManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
  requireAnyPermission: (...a: unknown[]) => requirePermissionMock(...a),
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
      },
      employee: { findUnique: async () => ({ paymentFrequency: "MONTHLY" }) },
      // F-2026-10-24-132-V: markPayrollPaid memindai baris kompensasi PKWT
      // di slip dalam tx yang sama; tanpa baris -> nol peristiwa dibayar.
      payrollComponentLine: { findMany: vi.fn().mockResolvedValue([]) },
      pkwtCompensationEvent: { update: vi.fn() },
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
    id: 1, status: "approved", employeeId: 2, loanDeduction: 1000,
    grossSalary: 5000000, lateDeduction: 0, deductions: 0,
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

  it("AC-LSV-2: menolak bayar bila potongan Pasal 63 slip tersimpan menembus 50% upah", async () => {
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1, status: "approved", employeeId: 2,
      loanDeduction: 3000000, grossSalary: 5000000,
      lateDeduction: 0, deductions: 0,
    })
    const result = await markPayrollPaid(1)
    expect(result.success).toBe(false)
    expect(result.error).toContain("plafon 50%")
    // Ditolak sebelum klaim status: nol bayar, nol amortisasi pinjaman.
    expect(payrollUpdateManyMock).not.toHaveBeenCalled()
    expect(loanFindManyMock).not.toHaveBeenCalled()
  })

  it("AC-LSV-2: tepat 50% upah masih boleh dibayar", async () => {
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1, status: "approved", employeeId: 2,
      loanDeduction: 2000000, grossSalary: 5000000,
      lateDeduction: 500000, deductions: 0,
    })
    const result = await markPayrollPaid(1)
    expect(result.success).toBe(true)
    expect(payrollUpdateManyMock).toHaveBeenCalledTimes(1)
  })
})
