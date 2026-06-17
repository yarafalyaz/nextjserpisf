import { prisma } from "@/lib/db/prisma"

/**
 * Self-service scoping untuk data HR sensitif (cuti, lembur, pinjaman, gaji,
 * absensi). Kebijakan (dikonfirmasi 2026-06-17):
 *  - karyawan / role lain   → HANYA data miliknya sendiri
 *  - kepala_bengkel         → data se-departemennya
 *  - HR/finance/admin/ga    → semua data
 *
 * Pakai lookup employee per-request (BUKAN menaruh employeeId di session) supaya
 * tidak menyentuh auth/JWT — konsisten dengan pola lama di halaman absensi/penggajian
 * dan menghindari kebutuhan re-login.
 */

// Role yang boleh melihat SEMUA data HR. 'ga' (general affairs) di-include karena
// pada matriks RBAC ia ikut meng-approve cuti, jadi wajib bisa melihat semuanya.
// 'hr' disertakan untuk forward-compat bila role itu dibuat nanti.
const ALL_ACCESS_ROLES = ["super_admin", "admin", "hr", "finance", "ga"]
// Role yang dibatasi ke departemennya sendiri.
const DEPARTMENT_ACCESS_ROLES = ["kepala_bengkel"]

export type HrScope =
  | { kind: "all" }
  | { kind: "department"; departmentId: number | null; employeeId: number }
  | { kind: "self"; employeeId: number }

interface ScopeUser {
  id: string
  roles: string[]
}

/**
 * Tentukan cakupan akses data HR untuk user. Melakukan satu query employee
 * (by userId) untuk role non-privileged guna mendapat employeeId + departmentId.
 */
export async function getHrScope(user: ScopeUser): Promise<HrScope> {
  if (user.roles.some((r) => ALL_ACCESS_ROLES.includes(r))) {
    return { kind: "all" }
  }

  const me = await prisma.employee.findFirst({
    where: { userId: Number(user.id) },
    select: { id: true, departmentId: true },
  })

  // User tanpa employee tertaut & bukan role privileged → tidak boleh lihat apa pun.
  // employeeId: -1 menjamin query tidak pernah match (id auto-increment selalu > 0).
  if (!me) return { kind: "self", employeeId: -1 }

  if (user.roles.some((r) => DEPARTMENT_ACCESS_ROLES.includes(r))) {
    return { kind: "department", departmentId: me.departmentId, employeeId: me.id }
  }

  return { kind: "self", employeeId: me.id }
}

/**
 * Fragment Prisma `where` untuk model yang punya kolom `employeeId` + relasi
 * `employee` (LeaveRequest, OvertimeRequest, EmployeeLoan, Payroll, Attendance).
 * Gabungkan ke where utama dengan spread: `{ ...hrScopeWhere(scope), ...lainnya }`.
 */
export function hrScopeWhere(scope: HrScope): Record<string, unknown> {
  if (scope.kind === "all") return {}
  if (scope.kind === "self") return { employeeId: scope.employeeId }
  // department: tampilkan semua employee di departemen yang sama.
  // Jika kepala_bengkel tak punya departemen, jatuhkan ke data sendiri saja.
  if (scope.departmentId == null) return { employeeId: scope.employeeId }
  return { employee: { departmentId: scope.departmentId } }
}

/** True bila user boleh memakai pencarian nama bebas (hanya scope 'all'). */
export function canSearchAcrossEmployees(scope: HrScope): boolean {
  return scope.kind === "all"
}
