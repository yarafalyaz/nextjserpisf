import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader rekap lembur (F-2026-10-25-016-S, AC-OVR-B2/B3/B5).
 * Builder murni terkunci di overtime-recap.test.ts; di sini dijaga:
 * scope HR diterapkan ke where (fail-closed), periode memakai kolom
 * `date`, filter departemen/proyek/status hanya menyempitkan, select
 * tanpa field gaji, dan Decimal diteruskan apa adanya ke builder.
 */

const mocks = vi.hoisted(() => ({
  overtimeFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    overtimeRequest: { findMany: mocks.overtimeFindMany },
  },
}))

import { loadOvertimeRecap } from "../overtime-recap-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const PERIOD = { periodStart: d("2026-10-01"), periodEnd: d("2026-10-31") }

function otRow(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: 1,
    projectId: 100,
    date: d("2026-10-05"),
    status: "approved",
    hours: { toString: () => "2.00" },
    totalHours: null,
    mealHours: null,
    billableHours: { toString: () => "2.00" },
    calculatedValue: { toString: () => "50000.00" },
    createdAt: d("2026-10-05"),
    employee: { name: "Budi", departmentId: 10, department: { name: "Bengkel" } },
    project: { name: "Proyek A" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.overtimeFindMany.mockResolvedValue([])
})

describe("loadOvertimeRecap — rantai loader F-016-S", () => {
  it("scope all: where hanya periode date; select tanpa baseSalary", async () => {
    await loadOvertimeRecap({ kind: "all" }, PERIOD)
    expect(mocks.overtimeFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.overtimeFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ date: { gte: PERIOD.periodStart, lte: PERIOD.periodEnd } })
    expect(JSON.stringify(arg.select)).not.toContain("baseSalary")
    expect(arg.select.calculatedValue).toBe(true)
    expect(arg.orderBy).toEqual([{ date: "asc" }, { id: "asc" }])
  })

  it("scope self fail-closed: where mengunci employeeId sendiri (roles rusak = -1 dari getHrScope)", async () => {
    const scope: HrScope = { kind: "self", employeeId: -1 }
    mocks.overtimeFindMany.mockResolvedValue([otRow({ employeeId: 99 })])
    await loadOvertimeRecap(scope, PERIOD)
    const arg = mocks.overtimeFindMany.mock.calls[0][0]
    expect(arg.where.employeeId).toBe(-1)
  })

  it("scope department: where lewat relasi employee.departmentId; departemen null jatuh ke diri sendiri", async () => {
    await loadOvertimeRecap(
      { kind: "department", departmentId: 10, employeeId: 7 },
      PERIOD,
    )
    expect(mocks.overtimeFindMany.mock.calls[0][0].where.employee).toEqual({
      departmentId: 10,
    })
    vi.clearAllMocks()
    mocks.overtimeFindMany.mockResolvedValue([])
    await loadOvertimeRecap(
      { kind: "department", departmentId: null, employeeId: 7 },
      PERIOD,
    )
    expect(mocks.overtimeFindMany.mock.calls[0][0].where).toMatchObject({
      employeeId: 7,
    })
  })

  it("filter departemen asing TIDAK memperluas scope department (irisan AND, kunci scope utuh)", async () => {
    await loadOvertimeRecap(
      { kind: "department", departmentId: 10, employeeId: 7 },
      { ...PERIOD, departmentId: 99 },
    )
    const where = mocks.overtimeFindMany.mock.calls[0][0].where
    expect(where.employee).toEqual({ departmentId: 10 })
    expect(where.AND).toEqual([{ employee: { departmentId: 99 } }])
    expect(where.employeeId).toBeUndefined()
  })

  it("filter departemen scope all langsung; scope self bertemu AND", async () => {
    await loadOvertimeRecap({ kind: "all" }, { ...PERIOD, departmentId: 5 })
    expect(mocks.overtimeFindMany.mock.calls[0][0].where.employee).toEqual({
      departmentId: 5,
    })
    vi.clearAllMocks()
    mocks.overtimeFindMany.mockResolvedValue([])
    await loadOvertimeRecap(
      { kind: "self", employeeId: 3 },
      { ...PERIOD, departmentId: 5 },
    )
    const where = mocks.overtimeFindMany.mock.calls[0][0].where
    expect(where.employeeId).toBe(3)
    expect(where.AND).toEqual([{ employee: { departmentId: 5 } }])
  })

  it("filter proyek/status/periode diteruskan apa adanya", async () => {
    await loadOvertimeRecap(
      { kind: "all" },
      { ...PERIOD, projectId: 5, status: "pending" },
    )
    const where = mocks.overtimeFindMany.mock.calls[0][0].where
    expect(where.projectId).toBe(5)
    expect(where.status).toBe("pending")
    expect(where.date).toEqual({ gte: PERIOD.periodStart, lte: PERIOD.periodEnd })
  })

  it("pemetaan Decimal -> number apa adanya ke builder (paritas AC-OVR-B3)", async () => {
    mocks.overtimeFindMany.mockResolvedValue([
      otRow({}),
      otRow({
        status: "pending",
        hours: { toString: () => "3.50" },
        billableHours: null,
        calculatedValue: null,
        date: d("2026-10-07"),
      }),
    ])
    const recap = await loadOvertimeRecap({ kind: "all" }, PERIOD)
    expect(recap.employees).toHaveLength(1)
    expect(recap.employees[0].submittedHours).toBe(5.5)
    expect(recap.employees[0].approvedHours).toBe(2)
    expect(recap.employees[0].pendingHours).toBe(3.5)
    expect(recap.employees[0].billableHours).toBe(2)
    expect(recap.employees[0].departmentName).toBe("Bengkel")
    expect(recap.employees[0].oldestPendingDate).toEqual(d("2026-10-07"))
  })

  it("baris approved calculatedValue null dari DB ditandai belum dihitung (EC-2)", async () => {
    mocks.overtimeFindMany.mockResolvedValue([
      otRow({ calculatedValue: null }),
    ])
    const recap = await loadOvertimeRecap({ kind: "all" }, PERIOD)
    expect(recap.employees[0].approvedValueMissingCount).toBe(1)
  })
})
