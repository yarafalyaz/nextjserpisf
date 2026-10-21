import { describe, it, expect, vi, beforeEach } from "vitest"
import { loadPayrollPageContext } from "../payroll-page-context"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireAnyPermission: vi.fn(),
  loadPayrollRows: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
  requireAnyPermission: (...args: unknown[]) => mocks.requireAnyPermission(...args),
}))
vi.mock("@/lib/reports/payroll-reports-data", () => ({
  loadPayrollRows: (...args: unknown[]) => mocks.loadPayrollRows(...args),
}))

const DATA = {
  rows: [],
  draftSlips: 0,
  duplicateEmployees: [],
  periodLabel: "Periode Okt 2026",
  periodCaption: "Periode Okt 2026",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "HR", email: "hr@test.com" })
  mocks.loadPayrollRows.mockResolvedValue(DATA)
})

describe("loadPayrollPageContext gerbang halaman gaji", () => {
  it("wajibkan view_payroll_reports tunggal (bukan any-of view_reports)", async () => {
    const ctx = await loadPayrollPageContext(Promise.resolve({}), Promise.resolve({}))

    expect(mocks.requirePermission).toHaveBeenCalledTimes(1)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_payroll_reports")
    expect(mocks.requireAnyPermission).not.toHaveBeenCalled()
    expect(mocks.loadPayrollRows).toHaveBeenCalledTimes(1)
    expect(ctx.data).toBe(DATA)
  })

  it("tolak sebelum memuat data gaji bila izin payroll ditolak (redirect guard)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_REDIRECT"))

    await expect(
      loadPayrollPageContext(Promise.resolve({}), Promise.resolve({})),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.loadPayrollRows).not.toHaveBeenCalled()
  })
})
