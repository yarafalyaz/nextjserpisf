import { prisma } from "@/lib/db/prisma"
import { HR_ALL_ACCESS_ROLES } from "@/lib/auth/role-names"

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
// pada matriks RBAC ia ikut meng-approve cuti, jadi wajib bisa melihat semuanya;
// 'finance' karena memproses penggajian. Daftarnya tinggal di `role-names.ts` —
// dulu ada 'hr'/'hr_manager' di sini yang belum pernah di-seed sehingga cabangnya
// mati. Bila role itu dibuat nanti, tambahkan ke `HR_ALL_ACCESS_ROLES` **dan** ke
// seed role (nama istimewa sengaja tidak bisa dibuat lewat UI Pengaturan → Peran).
const ALL_ACCESS_ROLES: readonly string[] = HR_ALL_ACCESS_ROLES
// Role yang dibatasi ke departemennya sendiri.
const DEPARTMENT_ACCESS_ROLES = ["kepala_bengkel"]

export type HrScope =
  | { kind: "all" }
  | { kind: "department"; departmentId: number | null; employeeId: number }
  | { kind: "team"; employeeId: number; memberIds: number[] }
  | { kind: "self"; employeeId: number }

interface ScopeUser {
  id: string
  roles: string[]
  permissions?: string[]
}

/**
 * Seluruh bawahan rekursif dari pohon organisasi (Employee.managerId),
 * termasuk karyawan itu sendiri. BFS dengan himpunan terlarang supaya
 * data siklik (yang dicegah di lapisan tulis) tidak mengunci query ini.
 */
export async function getSubordinateIds(employeeId: number): Promise<number[]> {
  const memberIds = [employeeId]
  const seen = new Set(memberIds)
  let frontier = [employeeId]
  for (let depth = 0; depth < 64 && frontier.length > 0; depth++) {
    const reports = await prisma.employee.findMany({
      where: { managerId: { in: frontier }, deletedAt: null },
      select: { id: true },
    })
    frontier = []
    for (const r of reports) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      memberIds.push(r.id)
      frontier.push(r.id)
    }
  }
  return memberIds
}

/**
 * Tentukan cakupan akses data HR untuk user. Melakukan satu query employee
 * (by userId) untuk role non-privileged guna mendapat employeeId + departmentId.
 */
export async function getHrScope(user: ScopeUser): Promise<HrScope> {
  // Fail CLOSED. A user object without a usable roles array is treated as an
  // employee with no linked record (employeeId -1 matches nothing), never as
  // full access. This mirrors getWarehouseScope()'s `kind: "none"`. Previously
  // this returned `{ kind: "all" }`, so any future caller/session shape that
  // dropped `roles` would have silently granted organisation-wide access to
  // payroll, loans, attendance and leave.
  if (!user.roles || !Array.isArray(user.roles)) {
    return { kind: "self", employeeId: -1 }
  }

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

  // Otorisasi struktural: izin eksplisit + rantai atasan di pohon organisasi.
  // Sengaja sesudah departemen supaya akses kepala_bengkel yang sudah ada
  // tidak menyempit; scope tim untuk peran lain yang diberi izin ini.
  if ((user.permissions ?? []).includes("view_subordinate_data")) {
    const memberIds = await getSubordinateIds(me.id)
    return { kind: "team", employeeId: me.id, memberIds }
  }

  return { kind: "self", employeeId: me.id }
}

/**
 * Fragment Prisma `where` untuk model yang punya kolom `employeeId` + relasi
 * `employee` (LeaveRequest, OvertimeRequest, EmployeeLoan, Payroll, Attendance, Timesheet).
 * Gabungkan ke where utama dengan spread: `{ ...hrScopeWhere(scope), ...lainnya }`.
 */
export function hrScopeWhere(scope: HrScope): Record<string, unknown> {
  if (scope.kind === "all") return {}
  if (scope.kind === "team") return { employeeId: { in: scope.memberIds } }
  if (scope.kind === "self") return { employeeId: scope.employeeId }
  // department: tampilkan semua employee di departemen yang sama.
  // Jika kepala_bengkel tak punya departemen, jatuhkan ke data sendiri saja.
  if (scope.departmentId == null) return { employeeId: scope.employeeId }
  return { employee: { departmentId: scope.departmentId } }
}

/** Fragment Prisma `where` for employee selectors used by HR forms. */
export function hrEmployeeScopeWhere(scope: HrScope): Record<string, unknown> {
  if (scope.kind === "all") return {}
  if (scope.kind === "team") return { id: { in: scope.memberIds } }
  if (scope.kind === "self") return { id: scope.employeeId }
  if (scope.departmentId == null) return { id: scope.employeeId }
  return { departmentId: scope.departmentId }
}

/** Enforce the same HR scope before mutating a row addressed directly by ID. */
export async function assertHrEmployeeAccess(
  scope: HrScope,
  employeeId: number,
): Promise<void> {
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    throw new Error("Karyawan tidak valid")
  }
  if (scope.kind === "all") return
  if (scope.kind === "team") {
    if (!scope.memberIds.includes(employeeId)) {
      throw new Error("Anda tidak memiliki akses ke data karyawan ini")
    }
    return
  }
  if (scope.kind === "self") {
    if (scope.employeeId !== employeeId) {
      throw new Error("Anda tidak memiliki akses ke data karyawan ini")
    }
    return
  }

  if (scope.departmentId == null) {
    if (scope.employeeId !== employeeId) {
      throw new Error("Anda tidak memiliki akses ke data karyawan ini")
    }
    return
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  })
  if (!employee || employee.departmentId !== scope.departmentId) {
    throw new Error("Anda tidak memiliki akses ke data karyawan ini")
  }
}

/** True bila user boleh memakai pencarian nama bebas (hanya scope 'all'). */
export function canSearchAcrossEmployees(scope: HrScope): boolean {
  return scope.kind === "all"
}
