/**
 * Loader read-only daftar kesenjangan kompetensi lintas karyawan
 * (F-2026-10-27-078-S, PUTUSAN LEAD Q-CGQ-1..8, kartu 078-B).
 *
 * Fail-closed `view_competencies` DAN `view_employees` SEBELUM query
 * (Q-CGQ-6, nol key baru), lalu `getHrScope` fail-closed (roles rusak/
 * tanpa employee tertaut → self employeeId -1 → nol baris, AC-CGQ-B1).
 * Tiga query massal anti-N+1: karyawan populasi dalam scope
 * (`hrEmployeeScopeWhere`), syarat jabatan populasi atas kompetensi
 * hidup, aktual pasangan populasi — BUKAN loop per karyawan pola
 * fungsi gap per-karyawan existing (AC-CGQ-B1).
 *
 * Baca-saja mutlak (BR-CGQ-11, AC-CGQ-B4): loader tidak memanggil
 * assess/setPosition/create/delete kompetensi dan tidak menulis apa pun.
 * Select tidak memuat penilai/catatan penilaian, data gaji/payroll,
 * atau field turunan apa pun (BR-CGQ-09/10) — payload hanya level
 * syarat/aktual + gap + tanggal dinilai dari builder murni. Rekap
 * dihitung builder dari baris populasi yang sama, sehingga tidak
 * pernah menghitung luar scope.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import {
  buildCompetencyGapQueue,
  type CompetencyGapQueue,
} from "@/lib/reports/competency-gap-queue"

export async function getCompetencyGapQueue(): Promise<CompetencyGapQueue> {
  const user = await requirePermission("view_competencies")
  await requirePermission("view_employees")
  const scope = await getHrScope(user)

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      employmentEndedAt: null,
      ...hrEmployeeScopeWhere(scope),
    },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      isActive: true,
      employmentEndedAt: true,
      positionId: true,
      position: { select: { name: true } },
    },
    orderBy: [{ id: "asc" }],
  })

  const employeeIds = employees.map((employee) => employee.id)
  const positionIds = [
    ...new Set(
      employees
        .map((employee) => employee.positionId)
        .filter((id): id is number => id != null),
    ),
  ]

  const [requirements, actuals] =
    employeeIds.length > 0 && positionIds.length > 0
      ? await Promise.all([
          prisma.positionCompetency.findMany({
            where: {
              positionId: { in: positionIds },
              competency: { deletedAt: null },
            },
            select: {
              positionId: true,
              competencyId: true,
              requiredLevel: true,
              competency: { select: { name: true, deletedAt: true } },
            },
            orderBy: [{ id: "asc" }],
          }),
          prisma.employeeCompetency.findMany({
            where: {
              employeeId: { in: employeeIds },
              competency: { deletedAt: null },
            },
            select: {
              employeeId: true,
              competencyId: true,
              level: true,
              assessedAt: true,
              competency: { select: { deletedAt: true } },
            },
            orderBy: [{ id: "asc" }],
          }),
        ])
      : [[], []]

  return buildCompetencyGapQueue({
    employees: employees.map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      employeeDeletedAt: employee.deletedAt,
      employeeIsActive: employee.isActive,
      employeeEmploymentEndedAt: employee.employmentEndedAt,
      positionId: employee.positionId,
      positionName: employee.position?.name ?? null,
    })),
    requirements: requirements.map((req) => ({
      positionId: req.positionId,
      competencyId: req.competencyId,
      competencyName: req.competency.name,
      competencyDeletedAt: req.competency.deletedAt,
      requiredLevel: req.requiredLevel,
    })),
    actuals: actuals.map((actual) => ({
      employeeId: actual.employeeId,
      competencyId: actual.competencyId,
      level: actual.level,
      assessedAt: actual.assessedAt,
    })),
  })
}
