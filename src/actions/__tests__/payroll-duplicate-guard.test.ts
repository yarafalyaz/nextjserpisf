import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the payroll double-pay race (fix fb0aa99):
// idempotency was app-level only (findFirst-then-create TOCTOU). A DB unique
// constraint guards it atomically; the action must translate the resulting
// P2002 into the same friendly message instead of leaking a raw Prisma error.
// F-2026-10-22-076-S (BR-PF-03): the unique key moved from (employeeId,
// period) to (employeeId, startDate, endDate) and the app-level pre-check
// became the range-overlap guard (findMany + builder) run under an employee
// row lock inside the create transaction.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const payrollFindManyMock = vi.fn()
const payrollCreateMock = vi.fn()
const employeeFindUniqueMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  // The action wraps its writes in prisma.$transaction(async (tx) => ...), so the
  // tx client must expose the same delegates as the global client. Without this
  // the mock threw "$transaction is not a function" and both the happy path and
  // the P2002 translation regressed silently.
  const txDelegates = () => ({
    payroll: {
      findMany: (...a: unknown[]) => payrollFindManyMock(...a),
      // nextSlug (slug-db) memeriksa tabrakan slug lewat delegate findFirst.
      findFirst: vi.fn().mockResolvedValue(null),
      create: (...a: unknown[]) => payrollCreateMock(...a),
    },
    employee: { findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a) },
    employeeLoan: { findMany: vi.fn().mockResolvedValue([]) },
    approvalWorkflow: { findFirst: vi.fn().mockResolvedValue(null) },
    approval: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    // requestApprovalIfConfigured locks the workflow row first and bails out when
    // no workflow is configured; an empty result keeps this test on the create path.
    $queryRaw: vi.fn().mockResolvedValue([]),
    // HCMS K1: applyDueSalaryAdjustments berjalan di dalam $transaction
    // yang sama ($executeRaw kunci baris + findMany kosong = no-op).
    $executeRaw: vi.fn().mockResolvedValue(1),
    salaryAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
  })

  return {
    prisma: {
      payroll: {
        findMany: (...a: unknown[]) => payrollFindManyMock(...a),
        findFirst: vi.fn().mockResolvedValue(null),
        create: (...a: unknown[]) => payrollCreateMock(...a),
      },
      payrollTerBracket: { findMany: vi.fn().mockResolvedValue([]) },
      // F-2026-10-21-027: tanpa penugasan komponen pada fixture ini.
      employeePayrollComponent: { findMany: vi.fn().mockResolvedValue([]) },
      payrollComponentLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      employee: { findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a) },
      employeeLoan: { findMany: vi.fn().mockResolvedValue([]) },
      approvalWorkflow: { findFirst: vi.fn().mockResolvedValue(null) },
      approval: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      // HCMS K1: applyDueSalaryAdjustments membuka $transaction sendiri di
      // jalur processPayroll (no-op tanpa baris jatuh tempo).
      $executeRaw: vi.fn().mockResolvedValue(1),
      salaryAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(txDelegates()),
    },
  }
})
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "PAYROLL-0001") }))
vi.mock("@/lib/services/late-penalty.service", () => ({
  calculateLatePenalty: vi.fn(async () => ({ totalPenalty: 0, totalLateMinutes: 0 })),
}))
vi.mock("@/lib/services/attendance-summary.service", () => ({
  calculateAttendanceSummary: vi.fn(async () => ({ workingDays: 20, presentDays: 20, absentDays: 0, absentDeduction: 0 })),
}))
vi.mock("@/lib/services/payroll-statutory.service", () => ({
  getStatutoryParams: vi.fn(async () => ({ fromFallback: false, asOf: "2026-06-30" })),
  computeBpjsEmployee: () => ({ health: 0, employment: 0, total: 0 }),
  computePph21Monthly: () => 0,
  // F-026: jalur tulis memakai TER; fixture 0% satu bracket terbuka.
  getTerBrackets: vi.fn(async () => [
    { category: "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: "2024-01-01", source: "test" },
  ]),
  computePph21Ter: (_gross: number) => ({
    pph21: 0,
    ratePct: 0,
    bracket: { category: "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: "2024-01-01", source: "test" },
  }),
  computePph21FinalPeriod: () => ({ pph21: 0, overWithheld: 0, underWithheldExcess: 0, annualTax: 0, pkp: 0, netYear: 0 }),
  resolveTerPeriod: () => ({ kind: "monthly", monthsInStint: 6, priorEmployerIncomeIncluded: false }),
  terCategoryFor: () => "A",
  statusCodeDependents: () => null,
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
  for (const m of [requirePermissionMock, revalidateMock, logActivityMock, payrollFindManyMock, payrollCreateMock, employeeFindUniqueMock]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  employeeFindUniqueMock.mockResolvedValue({ maritalStatus: "single", paymentFrequency: "MONTHLY", employeeLoans: [] })
  payrollFindManyMock.mockResolvedValue([])
  payrollCreateMock.mockResolvedValue({ id: 99 })
})

describe("processPayroll duplicate guard", () => {
  it("rejects via the range-overlap guard when an overlapping slip exists", async () => {
    // F-076-S AC-PF-3: penabrak disebut nomor slipnya, bukan pesan period lama.
    payrollFindManyMock.mockResolvedValue([
      { startDate: new Date("2026-06-01"), endDate: new Date("2026-06-30"), status: "draft", documentNo: "PAY-202606-0007" },
    ])
    const result = await processPayroll(fd(baseForm))
    expect(result.success).toBe(false)
    expect(result.error).toContain("PAY-202606-0007")
    expect(payrollCreateMock).not.toHaveBeenCalled()
  })

  it("returns a friendly message when a concurrent insert wins the race (P2002)", async () => {
    // Pre-check passes (no overlapping row) but the DB unique constraint
    // (employeeId, startDate, endDate) rejects the create because a parallel
    // request inserted the same range first.
    payrollFindManyMock.mockResolvedValue([])
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
