import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Scope HR loader kompensasi PKWT (kelanjutan PR #724 / utang BOT 6).
 * Yang dijaga: setiap query terikat karyawan membawa hrScopeWhere,
 * scope self hanya menghasilkan peristiwa sendiri, dan anomali
 * GL-perusahaan tidak dibandingkan dengan subledger scope sebagian.
 */

const mocks = vi.hoisted(() => ({
  systemSettingFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  accrualGroupBy: vi.fn(),
  payrollComponentLineFindMany: vi.fn(),
  journalEntryFindMany: vi.fn(),
  payrollFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.systemSettingFindFirst },
    pkwtCompensationEvent: { findMany: mocks.eventFindMany },
    pkwtCompensationAccrual: { groupBy: mocks.accrualGroupBy },
    payrollComponentLine: { findMany: mocks.payrollComponentLineFindMany },
    journalEntry: { findMany: mocks.journalEntryFindMany },
    payroll: { findMany: mocks.payrollFindMany },
  },
}))

import { getPkwtCompensationReport } from "../pkwt-compensation-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    employeeId: 9,
    segmentStart: d("2026-01-01"),
    segmentEnd: d("2026-06-30"),
    serviceMonths: 6,
    amount: 2_500_000,
    status: "approved",
    isLegacy: false,
    employee: { name: "Budi", employeeNumber: "EMP-009" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.systemSettingFindFirst.mockResolvedValue({
    pkwtCompensationExpenseAccountId: 631,
    pkwtCompensationPayableAccountId: 231,
  })
  mocks.eventFindMany.mockImplementation(async (arg: { where?: Record<string, unknown> }) => {
    const where = arg.where ?? {}
    const rows = [
      eventRow(),
      eventRow({
        id: 12,
        employeeId: 4,
        employee: { name: "Sari", employeeNumber: "EMP-004" },
      }),
    ]
    if (typeof where.employeeId === "number") {
      return rows.filter((r) => r.employeeId === where.employeeId)
    }
    return rows
  })
  mocks.accrualGroupBy.mockImplementation(
    async (arg: { where?: Record<string, unknown> }) => {
      const where = arg.where ?? {}
      const rows = [
        { employeeId: 9, segmentStart: d("2026-01-01"), _sum: { amount: 1_000_000 } },
        { employeeId: 4, segmentStart: d("2026-01-01"), _sum: { amount: 3_000_000 } },
      ]
      if (typeof where.employeeId === "number") {
        return rows.filter((r) => r.employeeId === where.employeeId)
      }
      return rows
    },
  )
  mocks.payrollComponentLineFindMany.mockImplementation(
    async (arg: { where?: { payroll?: Record<string, unknown> } }) => {
      const payrollWhere = arg.where?.payroll ?? {}
      const rows = [
        { pkwtEventId: 11, amount: 500_000, payroll: { status: "paid", employeeId: 9 } },
        { pkwtEventId: 12, amount: 700_000, payroll: { status: "paid", employeeId: 4 } },
      ]
      if (typeof payrollWhere.employeeId === "number") {
        return rows.filter((r) => r.payroll.employeeId === payrollWhere.employeeId)
      }
      return rows
    },
  )
  mocks.journalEntryFindMany.mockResolvedValue([{ debit: 0, credit: 10_000_000 }])
  mocks.payrollFindMany.mockImplementation(
    async (arg: { where?: Record<string, unknown> }) => {
      const where = arg.where ?? {}
      const rows = [
        { id: 101, employeeId: 9, componentLines: [{ pkwtEventId: 11 }] },
        { id: 102, employeeId: 4, componentLines: [{ pkwtEventId: 12 }] },
      ]
      if (typeof where.employeeId === "number") {
        return rows.filter((r) => r.employeeId === where.employeeId)
      }
      return rows
    },
  )
})

describe("getPkwtCompensationReport — scope HR", () => {
  it("scope self: hanya peristiwa sendiri; akrual, slip terbayar, slip pending ikut scope", async () => {
    const report = await getPkwtCompensationReport({ kind: "self", employeeId: 9 })

    expect(report.rows.map((r) => r.employeeId)).toEqual([9])
    expect(report.accrualSubledgerTotal).toBe(1_000_000)
    expect(report.paidSlipTotal).toBe(500_000)
    expect(report.pendingApprovalSlips.map((r) => r.employeeId)).toEqual([9])

    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual({ employeeId: 9 })
    expect(mocks.accrualGroupBy.mock.calls[0][0].where).toEqual({ employeeId: 9 })
    expect(mocks.payrollComponentLineFindMany.mock.calls[0][0].where).toEqual({
      pkwtEventId: { not: null },
      payroll: { employeeId: 9 },
    })
    expect(mocks.payrollFindMany.mock.calls[0][0].where).toEqual({
      status: "approved",
      employeeId: 9,
    })
  })

  it("scope department: where sama dengan hrScopeWhere diteruskan ke semua query terikat karyawan", async () => {
    const scope: HrScope = { kind: "department", departmentId: 7, employeeId: 5 }
    await getPkwtCompensationReport(scope)

    const dept = { employee: { departmentId: 7 } }
    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual(dept)
    expect(mocks.accrualGroupBy.mock.calls[0][0].where).toEqual(dept)
    expect(mocks.payrollComponentLineFindMany.mock.calls[0][0].where).toEqual({
      pkwtEventId: { not: null },
      payroll: dept,
    })
    expect(mocks.payrollFindMany.mock.calls[0][0].where).toEqual({ status: "approved", ...dept })
  })

  it("scope all: tanpa batas karyawan", async () => {
    const report = await getPkwtCompensationReport({ kind: "all" })

    expect(report.rows.map((r) => r.employeeId)).toEqual([9, 4])
    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual({})
    expect(mocks.accrualGroupBy.mock.calls[0][0].where).toEqual({})
    expect(mocks.payrollFindMany.mock.calls[0][0].where).toEqual({ status: "approved" })
  })

  it("scope terbatas: anomali GL perusahaan tidak dibandingkan dengan subledger sebagian", async () => {
    const limited = await getPkwtCompensationReport({ kind: "self", employeeId: 9 })
    expect(limited.anomalies.some((a) => a.code === "GL_VS_EVENT_DIFF")).toBe(false)

    const all = await getPkwtCompensationReport({ kind: "all" })
    expect(all.anomalies.some((a) => a.code === "GL_VS_EVENT_DIFF")).toBe(true)
  })
})
