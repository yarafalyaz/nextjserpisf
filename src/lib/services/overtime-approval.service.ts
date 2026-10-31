import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"
import { safeRound } from "@/lib/utils/math"
import { resolveDayKind } from "@/lib/services/leave-quota.service"
import {
  computeOvertimePay,
  resolveOvertimeBasis,
  type OvertimeDayKind,
} from "@/lib/services/overtime-pay.service"
import {
  loadSalaryHistoryAsOf,
  salaryAsOfFromHistory,
} from "@/lib/services/payroll-prorate.service"

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

  // R8-SDM-06: basis lembur memakai gaji yang berlaku PADA tanggal
  // lembur (rantai SalaryAdjustment terapan), bukan master berjalan —
  // approval sesudah kenaikan tidak boleh me-reprice lembur lama.
  const currentBase = Number(ot.employee?.baseSalary ?? 0)
  const history = await loadSalaryHistoryAsOf(db, ot.employeeId, currentBase, ot.date)
  const baseSalaryAsOf = safeRound(salaryAsOfFromHistory(history), 2)

  // Klasifikasi tunjangan pada tanggal lembur: recurrence "fixed" =
  // tunjangan tetap, "variable" = tidak tetap (PP 36/2021 Pasal 27).
  const assignments = await db.employeePayrollComponent.findMany({
    where: {
      employeeId: ot.employeeId,
      isActive: true,
      effectiveFrom: { lte: ot.date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ot.date } }],
      component: { isActive: true, kind: "earning", recurrence: { in: ["fixed", "variable"] } },
    },
    select: {
      defaultAmount: true,
      component: { select: { name: true, recurrence: true } },
    },
  })
  const fixedAssignments = assignments.filter((a) => a.component.recurrence === "fixed")
  const variableAssignments = assignments.filter((a) => a.component.recurrence === "variable")
  const sumAmounts = (rows: typeof assignments) =>
    rows.reduce((sum, a) => safeRound(sum + Number(a.defaultAmount), 2), 0)
  // Lantai 75%: pokok + tetap < 75% upah total → basis 75% upah total.
  const basisResult = resolveOvertimeBasis({
    baseSalary: baseSalaryAsOf,
    fixedAllowance: sumAmounts(fixedAssignments),
    variableAllowance: sumAmounts(variableAssignments),
  })
  const baseSalary = safeRound(basisResult.basis, 2)
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
    baseSalary: baseSalaryAsOf,
    components: fixedAssignments.map((a) => ({
      name: a.component.name,
      amount: Number(a.defaultAmount),
    })),
    variableComponents: variableAssignments.map((a) => ({
      name: a.component.name,
      amount: Number(a.defaultAmount),
    })),
    baseTotal: baseSalary,
    floor75Applied: basisResult.floor75Applied,
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
