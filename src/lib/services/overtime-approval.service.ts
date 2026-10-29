import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"
import { safeRound } from "@/lib/utils/math"
import { resolveDayKind } from "@/lib/services/leave-quota.service"
import {
  computeOvertimePay,
  type OvertimeDayKind,
} from "@/lib/services/overtime-pay.service"

type Db = Prisma.TransactionClient | typeof prisma

export async function computeOvertimeApprovalValue(
  db: Db,
  ot: {
    id: number
    employeeId: number
    date: Date
    hours: unknown
    employee?: { baseSalary: unknown } | null
  },
  approvedBy: number,
): Promise<{ count: number }> {
  if (!ot.employee) {
    const row = await db.overtimeRequest.findUnique({
      where: { id: ot.id },
      select: { employee: { select: { baseSalary: true } } },
    })
    ot = { ...ot, employee: row?.employee ?? null }
  }

  const fixedAssignments = await db.employeePayrollComponent.findMany({
    where: {
      employeeId: ot.employeeId,
      isActive: true,
      effectiveFrom: { lte: ot.date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ot.date } }],
      component: { isActive: true, recurrence: "fixed", kind: "earning" },
    },
    select: {
      defaultAmount: true,
      component: { select: { name: true } },
    },
  })
  const fixedAllowance = fixedAssignments.reduce(
    (sum, a) => safeRound(sum + Number(a.defaultAmount), 2),
    0,
  )
  const baseSalary = safeRound(
    Number(ot.employee?.baseSalary ?? 0) + fixedAllowance,
    2,
  )
  const dayProfile = await resolveDayKind(ot.employeeId, ot.date, db)
  const dayKind: OvertimeDayKind = dayProfile.isWorkingDay
    ? "workday"
    : dayProfile.workdaysPerWeek >= 6
      ? "rest_6day"
      : "rest_5day"
  const calculatedValue = computeOvertimePay({
    monthlySalary: baseSalary,
    hours: Number(ot.hours),
    dayKind,
  })
  const overtimeBaseSnapshot = {
    baseSalary: safeRound(Number(ot.employee?.baseSalary ?? 0), 2),
    components: fixedAssignments.map((a) => ({
      name: a.component.name,
      amount: Number(a.defaultAmount),
    })),
    baseTotal: baseSalary,
    overtimeDate: new Date(ot.date).toISOString(),
  }

  return db.overtimeRequest.updateMany({
    where: { id: ot.id, status: { in: ["pending", "approved"] } },
    data: {
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
      calculatedValue,
      overtimeBaseSnapshot,
    },
  })
}
