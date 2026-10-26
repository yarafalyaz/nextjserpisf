/**
 * Loader read-only rekap sisa pinjaman aktif per karyawan
 * (F-2026-10-25-046-S, AC-LR46-B2, putusan Lead Q-LR46).
 *
 * Q-LR46-3: izin halaman rekap = reuse `view_employee_loans` (izin daftar
 * existing), TANPA key baru. Q-LR46-4 (putusan Backend): bentuk loader =
 * muat baris EmployeeLoan ter-scope + builder murni
 * (`buildEmployeeLoanRecap`) — bukan agregat groupBy DB, supaya invariant
 * Σ terbayar = Σ pokok − Σ sisa populasi aktif dibuktikan builder murni,
 * dan ember status tak dikenal / tanpa jadwal mingguan bekerja atas baris
 * polos. Filter tanggal loanDate TIDAK ditambah tahap 1 (EC-6): rekap
 * adalah potret berjalan.
 *
 * Gerbang ditegakkan DI SINI sebelum muat apa pun: `requirePermission`
 * lalu `getHrScope` fail-closed (roles rusak → self employeeId -1 →
 * nol baris). Satu query massal EmployeeLoan dalam scope; filter
 * departemen hanya MENYEMPITKAN scope, tidak pernah memperluas
 * (BR-LR46-06) — scope department/self bertemu filter lewat AND.
 *
 * Select TIDAK memuat baseSalary/komponen gaji/nominal slip dan tidak
 * membaca Payroll.loanDeduction sama sekali (BR-LR46-06). Baca-saja
 * murni: nol tulis EmployeeLoan/Employee/status apa pun (BR-LR46-09).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildEmployeeLoanRecap,
  type EmployeeLoanRecap,
} from "@/lib/reports/employee-loan-recap"

export interface EmployeeLoanRecapFilters {
  /** Hanya menyempitkan; hanya efektif penuh pada scope `all` (BR-LR46-06). */
  departmentId?: number | null
}

export async function loadEmployeeLoanRecap(
  filters: EmployeeLoanRecapFilters = {},
): Promise<{ scope: HrScope; recap: EmployeeLoanRecap }> {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

  const where: Record<string, unknown> = { ...hrScopeWhere(scope) }
  if (filters.departmentId != null) {
    if (scope.kind === "all") {
      where.employee = { departmentId: filters.departmentId }
    } else {
      // Scope department/self: filter bertemu scope lewat AND (irisan),
      // tidak pernah menimpa kunci scope — departemen asing = nol baris.
      where.AND = [{ employee: { departmentId: filters.departmentId } }]
    }
  }

  const rows = await prisma.employeeLoan.findMany({
    where,
    select: {
      employeeId: true,
      loanDate: true,
      status: true,
      totalAmount: true,
      monthlyInstallment: true,
      weeklyInstallment: true,
      remainingAmount: true,
      employee: {
        select: {
          name: true,
          departmentId: true,
          isActive: true,
          employmentEndedAt: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ loanDate: "asc" }, { id: "asc" }],
  })

  const recap = buildEmployeeLoanRecap(
    rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentId: r.employee.departmentId,
      departmentName: r.employee.department?.name ?? null,
      isActive: r.employee.isActive,
      employmentEndedAt: r.employee.employmentEndedAt,
      loanDate: r.loanDate,
      status: r.status,
      totalAmount: Number(r.totalAmount),
      monthlyInstallment: Number(r.monthlyInstallment),
      weeklyInstallment:
        r.weeklyInstallment === null ? null : Number(r.weeklyInstallment),
      remainingAmount: Number(r.remainingAmount),
    })),
  )
  return { scope, recap }
}
