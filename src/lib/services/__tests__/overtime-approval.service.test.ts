import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/leave-quota.service", () => ({
  resolveDayKind: vi.fn(async () => ({ isWorkingDay: true, workdaysPerWeek: 5 })),
}))

import { computeOvertimeApprovalValue } from "@/lib/services/overtime-approval.service"
import { computeOvertimePay } from "@/lib/services/overtime-pay.service"

const d = (s: string) => new Date(`${s}T00:00:00Z`)

function mockDb(input: {
  adjustments: { effectiveDate: Date; previousBaseSalary: number; newBaseSalary: number }[]
  assignments?: { defaultAmount: number; component: { name: string; recurrence: string } }[]
}) {
  const updateMany = vi.fn(
    async (_args: { data: Record<string, any> }) => ({ count: 1 }),
  )
  const db = {
    overtimeRequest: {
      findUnique: vi.fn(async () => null),
      updateMany,
    },
    salaryAdjustment: {
      // Tiru filter where Prisma (effectiveDate <= asOf) yang dipakai loader.
      findMany: vi.fn(async (args: { where?: { effectiveDate?: { lte?: Date } } }) => {
        const lte = args?.where?.effectiveDate?.lte
        return input.adjustments.filter((a) => !lte || a.effectiveDate <= lte)
      }),
    },
    employeePayrollComponent: {
      findMany: vi.fn(async () => input.assignments ?? []),
    },
  }
  return { db: db as never, updateMany }
}

describe("R8-SDM-06 basis lembur historis + lantai 75%", () => {
  it("skenario A: lembur 10 Sep (pokok 4jt) disetujui sesudah kenaikan 5jt → dibayar basis 4jt", async () => {
    const { db, updateMany } = mockDb({
      adjustments: [
        { effectiveDate: d("2026-10-01"), previousBaseSalary: 4_000_000, newBaseSalary: 5_000_000 },
      ],
    })
    const ot = {
      id: 7,
      employeeId: 3,
      date: d("2026-09-10"),
      hours: 3,
      employee: { baseSalary: 5_000_000 },
    }
    const r = await computeOvertimeApprovalValue(db, ot, 99)
    expect(r.count).toBe(1)
    const data = updateMany.mock.calls[0][0].data
    // 3 jam hari kerja basis 4jt: (1,5 + 2 + 2) x 4jt/173 = 127.168.
    expect(data.calculatedValue).toBe(computeOvertimePay({ monthlySalary: 4_000_000, hours: 3, dayKind: "workday" }))
    expect(data.calculatedValue).toBe(127_168)
    expect(data.overtimeBaseSnapshot.baseSalary).toBe(4_000_000)
    expect(data.overtimeBaseSnapshot.floor75Applied).toBe(false)
  })

  it("skenario B: porsi tetap 50% → lantai 75% menaikkan basis snapshot", async () => {
    const { db, updateMany } = mockDb({
      adjustments: [],
      assignments: [
        { defaultAmount: 1_000_000, component: { name: "Tunjangan Tetap", recurrence: "fixed" } },
        { defaultAmount: 5_000_000, component: { name: "Insentif", recurrence: "variable" } },
      ],
    })
    const ot = {
      id: 8,
      employeeId: 3,
      date: d("2026-09-10"),
      hours: 3,
      employee: { baseSalary: 4_000_000 },
    }
    await computeOvertimeApprovalValue(db, ot, 99)
    const data = updateMany.mock.calls[0][0].data
    expect(data.overtimeBaseSnapshot.baseTotal).toBe(7_500_000)
    expect(data.overtimeBaseSnapshot.floor75Applied).toBe(true)
    expect(data.overtimeBaseSnapshot.variableComponents).toEqual([
      { name: "Insentif", amount: 5_000_000 },
    ])
    expect(data.calculatedValue).toBe(
      computeOvertimePay({ monthlySalary: 7_500_000, hours: 3, dayKind: "workday" }),
    )
  })

  it("karyawan WEEKLY: nominal mingguan dinormalisasi ke bulanan sebelum /173", async () => {
    const { db, updateMany } = mockDb({ adjustments: [] })
    const ot = {
      id: 9,
      employeeId: 3,
      date: d("2026-09-10"),
      hours: 3,
      // Rp1.200.000 per MINGGU — bukan per bulan.
      employee: { baseSalary: 1_200_000, paymentFrequency: "WEEKLY" },
    }
    await computeOvertimeApprovalValue(db, ot, 99)
    const data = updateMany.mock.calls[0][0].data
    const monthly = (1_200_000 * 52) / 12
    expect(data.overtimeBaseSnapshot.paymentFrequency).toBe("WEEKLY")
    expect(data.overtimeBaseSnapshot.baseTotal).toBe(monthly)
    expect(data.calculatedValue).toBe(
      computeOvertimePay({ monthlySalary: monthly, hours: 3, dayKind: "workday" }),
    )
    // Tanpa normalisasi nilai lama = basis mingguan mentah /173.
    expect(data.calculatedValue).toBeGreaterThan(
      computeOvertimePay({ monthlySalary: 1_200_000, hours: 3, dayKind: "workday" }),
    )
  })
})
