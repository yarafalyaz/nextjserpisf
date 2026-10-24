/**
 * Loader daftar perhatian siklus hidup karyawan (F-2026-10-22-085-S).
 *
 * Satu query massal Employee dalam scope HR pemanggil (BR-EMP-08:
 * view_employees + getHrScope; self hanya barisnya sendiri). Select TIDAK
 * memuat baseSalary/nominal apa pun (BR-EMP-07/AC-EMP-7).
 */

import { prisma } from "@/lib/db/prisma"
import { hrEmployeeScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildEmployeeLifecycleAttention,
  type EmployeeLifecycleAttentionRow,
} from "@/lib/reports/employee-lifecycle"

export async function loadEmployeeLifecycleAttention(
  scope: HrScope,
  today: Date = new Date(),
): Promise<EmployeeLifecycleAttentionRow[]> {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, ...hrEmployeeScopeWhere(scope) },
    select: {
      id: true,
      name: true,
      employmentStatus: true,
      contractEndDate: true,
      employmentEndedAt: true,
      endReason: true,
      isActive: true,
    },
    orderBy: { id: "asc" },
  })
  return buildEmployeeLifecycleAttention(
    employees.map((e) => ({
      employeeId: e.id,
      name: e.name,
      employmentStatus: e.employmentStatus,
      contractEndDate: e.contractEndDate,
      employmentEndedAt: e.employmentEndedAt,
      endReason: e.endReason,
      isActive: e.isActive,
    })),
    today,
  )
}
