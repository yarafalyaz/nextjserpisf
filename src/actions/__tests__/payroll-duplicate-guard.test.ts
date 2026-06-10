import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the payroll double-pay race (fix fb0aa99):
// idempotency was app-level only (findFirst-then-create TOCTOU). A DB unique
// constraint (employeeId, period) now guards it atomically; the action must
// translate the resulting P2002 into the same friendly message instead of
// leaking a raw Prisma error.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const payrollFindFirstMock = vi.fn()
const payrollCreateMock = vi.fn()
const employeeFindUniqueMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: {
      findFirst: (...a: unknown[]) => payrollFindFirstMock(...a),
      create: (...a: unknown[]) => payrollCreateMock(...a),
    },
    employee: { findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a) },
  },
}))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "PAYROLL-0001") }))
vi.mock("@/lib/services/late-penalty.service", () => ({
  calculateLatePenalty: vi.fn(async () => ({ totalPenalty: 0, totalLateMinutes: 0 })),
}))
vi.mock("@/lib/services/attendance-summary.service", () => ({
  calculateAttendanceSummary: vi.fn(async () => ({ workingDays: 20, presentDays: 20, absentDays: 0, absentDeduction: 0 })),
}))
vi.mock("@/lib/services/payroll-statutory.service", () => ({
  computeBpjsEmployee: () => ({ health: 0, employment: 0, total: 0 }),
  computePph21Monthly: () => 0,
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("@/lib/services/holiday-sync.service", () => ({ syncNationalHolidays: vi.fn() }))
vi.mock("@/lib/hooks/accounting.hook", () => ({ onPayrollPaid: vi.fn() }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn(async () => ({})) }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { processPayroll } from "../hrm.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

// lateDeduction/workingDays/absentDeduction set non-zero so the action skips
// the late-penalty + attendance-summary recompute branches and goes straight
// to the create path under test.
const baseForm = {
  employeeId: "5", period: "2026-06", startDate: "2026-06-01", endDate: "2026-06-30",
  baseSalary: "5000000", lateDeduction: "1", workingDays: "20", absentDeduction: "1",
}

beforeEach(() => {
  for (const m of [requirePermissionMock, revalidateMock, logActivityMock, payrollFindFirstMock, payrollCreateMock, employeeFindUniqueMock]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  employeeFindUniqueMock.mockResolvedValue({ maritalStatus: "single" })
  payrollFindFirstMock.mockResolvedValue(null)
  payrollCreateMock.mockResolvedValue({ id: 99 })
})

describe("processPayroll duplicate guard", () => {
  it("rejects via the app-level pre-check when a payroll already exists", async () => {
    payrollFindFirstMock.mockResolvedValue({ id: 7 })
    const result = await processPayroll(fd(baseForm))
    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah ada")
    expect(payrollCreateMock).not.toHaveBeenCalled()
  })

  it("returns a friendly message when a concurrent insert wins the race (P2002)", async () => {
    // Pre-check passes (no existing row) but the DB unique constraint rejects
    // the create because a parallel request inserted first.
    payrollFindFirstMock.mockResolvedValue(null)
    payrollCreateMock.mockRejectedValue({ code: "P2002" })
    const result = await processPayroll(fd(baseForm))
    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah ada")
    expect(result.error).not.toContain("P2002") // never leak a raw Prisma error
  })

  it("creates the payroll on the happy path", async () => {
    const result = await processPayroll(fd(baseForm))
    expect(result.success).toBe(true)
    expect(payrollCreateMock).toHaveBeenCalledTimes(1)
  })
})
