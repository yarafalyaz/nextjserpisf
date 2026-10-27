import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader kompensasi PKWT — scope HR (utang pasca-merge #724, vonis QA
 * 6384023131 + putusan Lead 6384040455). Yang dijaga:
 * - getPkwtCompensationReport(scope) menerapkan hrScopeWhere(scope) ke
 *   SEMUA query yang mengekspos karyawan: peristiwa, akrual subledger,
 *   baris slip terbayar (lewat relasi payroll), slip pending-approval.
 * - scope self hanya membawa peristiwa karyawan sendiri; hasil keluaran
 *   (rows/totals/unpaid/pending) hanya karyawan dalam scope.
 * - glPayableBalance saldo perusahaan tidak ter-scope; untuk scope
 *   terbatas report menandai glIsCompanyWide/glComparableToScope dan
 *   builder TIDAK menerbitkan GL_VS_EVENT_DIFF dari artefak cakupan.
 * Falsifikasi: hapus where scope dari query -> test merah.
 */

const mocks = vi.hoisted(() => ({
  systemSettingFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  accrualGroupBy: vi.fn(),
  lineFindMany: vi.fn(),
  journalEntryFindMany: vi.fn(),
  payrollFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.systemSettingFindFirst },
    pkwtCompensationEvent: { findMany: mocks.eventFindMany },
    pkwtCompensationAccrual: { groupBy: mocks.accrualGroupBy },
    payrollComponentLine: { findMany: mocks.lineFindMany },
    journalEntry: { findMany: mocks.journalEntryFindMany },
    payroll: { findMany: mocks.payrollFindMany },
  },
}))

import { getPkwtCompensationReport } from "../pkwt-compensation-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function eventRow(id: number, employeeId: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    employeeId,
    segmentStart: d("2026-01-01"),
    segmentEnd: d("2026-06-30"),
    serviceMonths: 6,
    amount: 2_500_000,
    status: "approved",
    isLegacy: false,
    employee: { name, employeeNumber: `EMP-${employeeId}` },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.systemSettingFindFirst.mockResolvedValue({
    pkwtCompensationExpenseAccountId: 10,
    pkwtCompensationPayableAccountId: 20,
  })
  mocks.eventFindMany.mockResolvedValue([])
  mocks.accrualGroupBy.mockResolvedValue([])
  mocks.lineFindMany.mockResolvedValue([])
  mocks.journalEntryFindMany.mockResolvedValue([])
  mocks.payrollFindMany.mockResolvedValue([])
})

describe("getPkwtCompensationReport — scope HR diterapkan ke semua query karyawan", () => {
  it.each([
    ["all", { kind: "all" } as HrScope, {}, {}],
    ["self", { kind: "self", employeeId: 7 } as HrScope, { employeeId: 7 }, { payroll: { employeeId: 7 } }],
    [
      "department",
      { kind: "department", departmentId: 3, employeeId: 7 } as HrScope,
      { employee: { departmentId: 3 } },
      { payroll: { employee: { departmentId: 3 } } },
    ],
    [
      "department tanpa departemen jatuh ke diri sendiri",
      { kind: "department", departmentId: null, employeeId: 7 } as HrScope,
      { employeeId: 7 },
      { payroll: { employeeId: 7 } },
    ],
  ])("scope %s: where peristiwa/akrual/pending + baris slip via payroll", async (_label, scope, expectedScopeWhere, expectedLineScope) => {
    await getPkwtCompensationReport(scope)

    expect(mocks.eventFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual(expectedScopeWhere)

    expect(mocks.accrualGroupBy).toHaveBeenCalledTimes(1)
    expect(mocks.accrualGroupBy.mock.calls[0][0].where).toEqual(expectedScopeWhere)

    expect(mocks.lineFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.lineFindMany.mock.calls[0][0].where).toEqual({
      pkwtEventId: { not: null },
      ...expectedLineScope,
    })

    expect(mocks.payrollFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.payrollFindMany.mock.calls[0][0].where).toEqual({
      status: "approved",
      ...expectedScopeWhere,
    })
  })

  it("scope self: hanya peristiwa karyawan sendiri yang keluar; total ikut ter-scope", async () => {
    mocks.eventFindMany.mockResolvedValue([eventRow(1, 7, "Budi")])
    mocks.accrualGroupBy.mockResolvedValue([
      { employeeId: 7, segmentStart: d("2026-01-01"), _sum: { amount: 2_000_000 } },
    ])

    const report = await getPkwtCompensationReport({ kind: "self", employeeId: 7 })

    expect(report.rows.map((r) => r.employeeId)).toEqual([7])
    expect(report.rows[0].employeeName).toBe("Budi")
    expect(report.rows[0].accruedToDate).toBe(2_000_000)
    expect(report.expectedPayableTotal).toBe(2_500_000)
    expect(report.accrualSubledgerTotal).toBe(2_000_000)
    expect(report.unpaidList.map((r) => r.employeeId)).toEqual([7])
  })

  it("scope self: slip pending-approval hanya dari payroll ter-scope", async () => {
    mocks.eventFindMany.mockResolvedValue([eventRow(1, 7, "Budi"), eventRow(2, 8, "Ani")])
    // payrollFindMany ter-scope mengembalikan hanya slip Budi (event 1);
    // event Ani tidak boleh bocor ke pendingApprovalSlips lewat jalur ini.
    mocks.payrollFindMany.mockResolvedValue([
      { id: 50, componentLines: [{ pkwtEventId: 1 }] },
    ])

    const report = await getPkwtCompensationReport({ kind: "self", employeeId: 7 })

    expect(report.pendingApprovalSlips.map((r) => r.employeeId)).toEqual([7])
    expect(mocks.payrollFindMany.mock.calls[0][0].where).toEqual({
      status: "approved",
      employeeId: 7,
    })
  })

  it("saldo GL perusahaan tidak ter-scope; scope terbatas menandainya tidak comparable", async () => {
    mocks.journalEntryFindMany.mockResolvedValue([{ debit: 0, credit: 9_000_000 }])
    mocks.eventFindMany.mockResolvedValue([eventRow(1, 7, "Budi")])

    const selfReport = await getPkwtCompensationReport({ kind: "self", employeeId: 7 })
    expect(selfReport.glPayableBalance).toBe(9_000_000)
    expect(selfReport.glIsCompanyWide).toBe(true)
    expect(selfReport.glComparableToScope).toBe(false)
    // Selisih GL perusahaan vs total scope BUKAN temuan.
    expect(selfReport.anomalies.some((a) => a.code === "GL_VS_EVENT_DIFF")).toBe(false)
    // Query GL sendiri tanpa filter karyawan.
    expect(mocks.journalEntryFindMany.mock.calls[0][0].where).toEqual({
      accountId: 20,
      journal: { status: { in: ["POSTED", "REVERSED"] }, deletedAt: null },
    })

    const allReport = await getPkwtCompensationReport({ kind: "all" })
    expect(allReport.glIsCompanyWide).toBe(false)
    expect(allReport.glComparableToScope).toBe(true)
    expect(allReport.anomalies.some((a) => a.code === "GL_VS_EVENT_DIFF")).toBe(true)
  })

  it("mapping kosong: tanpa query GL + anomaly MAPPING_MISSING", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: null,
      pkwtCompensationPayableAccountId: null,
    })

    const report = await getPkwtCompensationReport({ kind: "all" })

    expect(mocks.journalEntryFindMany).not.toHaveBeenCalled()
    expect(report.glPayableBalance).toBe(0)
    expect(report.anomalies.some((a) => a.code === "MAPPING_MISSING")).toBe(true)
  })
})
