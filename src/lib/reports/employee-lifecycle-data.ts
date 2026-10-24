/**
 * Loader daftar perhatian siklus hidup karyawan (F-2026-10-22-085-S;
 * perluasan F-2026-10-24-099-S Q-PROB-4 tahap 1 — daftar pasif existing
 * SAJA, tanpa daftar kedua dan tanpa menyentuh cron daily-notifications).
 *
 * Satu query massal Employee dalam scope HR pemanggil (BR-EMP-08:
 * view_employees + getHrScope; self hanya barisnya sendiri) + query
 * ProbationReview/ContractDecisionRequest dalam scope sama untuk fakta
 * turunan probation/keputusan. Select TIDAK memuat baseSalary/nominal
 * apa pun (BR-EMP-07/AC-EMP-7, BR-PROB-11).
 */

import { prisma } from "@/lib/db/prisma"
import { hrEmployeeScopeWhere, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildEmployeeLifecycleAttention,
  type EmployeeLifecycleAttentionRow,
} from "@/lib/reports/employee-lifecycle"
import { probationMilestoneSlots } from "@/lib/reports/probation"

export async function loadEmployeeLifecycleAttention(
  scope: HrScope,
  today: Date = new Date(),
): Promise<EmployeeLifecycleAttentionRow[]> {
  const employeeWhere = { deletedAt: null, ...hrEmployeeScopeWhere(scope) }
  const [employees, reviews, decisions] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        name: true,
        employmentStatus: true,
        contractEndDate: true,
        employmentEndedAt: true,
        endReason: true,
        isActive: true,
        joinDate: true,
        probationEndDate: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.probationReview.findMany({
      where: hrScopeWhere(scope),
      select: {
        employeeId: true,
        milestone: true,
        dueDate: true,
        status: true,
        finalDecision: true,
      },
    }),
    prisma.contractDecisionRequest.findMany({
      where: hrScopeWhere(scope),
      select: { employeeId: true, status: true, createdAt: true },
    }),
  ])

  const reviewsByEmployee = new Map<number, typeof reviews>()
  for (const r of reviews) {
    const list = reviewsByEmployee.get(r.employeeId) ?? []
    list.push(r)
    reviewsByEmployee.set(r.employeeId, list)
  }
  const pendingDecisionEmployees = new Set<number>()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  for (const d of decisions) {
    if (d.status === "approved") pendingDecisionEmployees.add(d.employeeId)
    else if (d.status === "submitted" && d.createdAt < sevenDaysAgo) {
      pendingDecisionEmployees.add(d.employeeId)
    }
  }

  return buildEmployeeLifecycleAttention(
    employees.map((e) => {
      const own = reviewsByEmployee.get(e.id) ?? []
      const finalRow = own.find(
        (r) => (r.milestone === "90" || r.milestone === "final") && r.status === "decided",
      )
      let nextDue: Date | null = null
      if (e.probationEndDate != null) {
        const submittedMilestones = new Set(
          own.filter((r) => r.status !== "draft").map((r) => r.milestone),
        )
        for (const slot of probationMilestoneSlots(e.joinDate, e.probationEndDate)) {
          if (!submittedMilestones.has(slot.milestone)) {
            nextDue = slot.dueDate
            break
          }
        }
      }
      return {
        employeeId: e.id,
        name: e.name,
        employmentStatus: e.employmentStatus,
        contractEndDate: e.contractEndDate,
        employmentEndedAt: e.employmentEndedAt,
        endReason: e.endReason,
        isActive: e.isActive,
        joinDate: e.joinDate,
        probationEndDate: e.probationEndDate,
        probationFinalDecision: finalRow?.finalDecision ?? null,
        probationNextDueDate: nextDue,
        contractDecisionPending: pendingDecisionEmployees.has(e.id),
      }
    }),
    today,
  )
}
