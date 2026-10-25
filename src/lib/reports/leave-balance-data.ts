/**
 * Loader read-only laporan saldo cuti tahunan (F-2026-10-25-013-S).
 *
 * Menegakkan scope HR fail-closed lewat `hrEmployeeScopeWhere` (scope
 * diputus pemanggil/server — loader tidak pernah memperluasnya,
 * AC-LVB-B1), lalu memanggil SATU-SATUNYA sumber angka kuota
 * `getLeaveQuota` per karyawan (BR-LVB-10: builder/halaman/CSV dilarang
 * menghitung ulang hari kerja/eligibility).
 *
 * Karyawan nonaktif (BR-LVB-13, AC-LVB-B3): tetap dimuat untuk tahun
 * kalender yang memotong masa aktifnya — berhenti pada/di sesudah 1 Jan
 * tahun laporan, atau belum tercatat tanggal berakhirnya — tertanda
 * `isActive: false`; tahun penuh sesudah berhenti tidak memuat barisnya.
 * Baris terhapus lunak (`deletedAt`) tidak pernah dimuat.
 * Baca-saja murni: nol tulis Employee/LeaveRequest/status.
 */

import { prisma } from "@/lib/db/prisma"
import { hrEmployeeScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import { getLeaveQuota } from "@/lib/services/leave-quota.service"
import {
  buildLeaveBalanceReport,
  type LeaveBalanceFilters,
  type LeaveBalanceReport,
} from "@/lib/reports/leave-balance"

export async function loadLeaveBalanceReport(
  scope: HrScope,
  year: number,
  filters: LeaveBalanceFilters = {},
): Promise<LeaveBalanceReport> {
  const yearStart = new Date(year, 0, 1)
  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      ...hrEmployeeScopeWhere(scope),
      OR: [
        { isActive: true },
        { employmentEndedAt: { gte: yearStart } },
        { isActive: false, employmentEndedAt: null },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      departmentId: true,
      joinDate: true,
      isActive: true,
      department: { select: { name: true } },
    },
  })

  const rows = await Promise.all(
    employees.map(async (emp) => {
      const quota = await getLeaveQuota(emp.id, { year })
      return {
        employeeId: emp.id,
        name: emp.name,
        employeeNo: emp.employeeNo,
        departmentId: emp.departmentId,
        department: emp.department?.name ?? null,
        joinDate: emp.joinDate.toISOString().split("T")[0],
        isActive: emp.isActive,
        entitled: quota.entitled,
        used: quota.used,
        usedApproved: quota.usedApproved,
        usedPending: quota.usedPending,
        remaining: quota.remaining,
        eligible: quota.eligible,
        tenureMonths: quota.tenureMonths,
      }
    }),
  )

  return buildLeaveBalanceReport(year, rows, filters)
}
