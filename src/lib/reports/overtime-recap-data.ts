/**
 * Loader read-only rekap lembur per karyawan per periode
 * (F-2026-10-25-016-S, AC-OVR-B2/B3/B5).
 *
 * Satu query massal OvertimeRequest dalam scope HR pemanggil
 * (`getHrScope` ditegakkan pemanggil; loader menerima scope yang sudah
 * diputus server, pola employee-lifecycle-data) + periode kolom `date`
 * (BR-OVR-07). Filter departemen/proyek/status hanya MENYEMPITKAN scope,
 * tidak pernah memperluas (BR-OVR-06): scope department/self mengunci
 * filter departemen asing menjadi tanpa hasil lewat hrScopeWhere.
 *
 * Select TIDAK memuat baseSalary/komponen gaji (BR-OVR-12) dan tidak
 * menjumlahkan calculatedValue (BR-OVR-04); nilai hanya diteruskan
 * keberadaannya (null = belum dihitung, EC-2) ke builder.
 * Baca-saja murni: nol tulis OvertimeRequest/status/dokumen.
 */

import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildOvertimeRecap,
  type OvertimeRecap,
  type OvertimeRecapStatus,
} from "@/lib/reports/overtime-recap"

export interface OvertimeRecapFilters {
  /** Awal periode (inklusif) menurut kolom `date` lembur. */
  periodStart: Date
  /** Akhir periode (inklusif) menurut kolom `date` lembur. */
  periodEnd: Date
  departmentId?: number | null
  projectId?: number | null
  status?: OvertimeRecapStatus | null
}

export async function loadOvertimeRecap(
  scope: HrScope,
  filters: OvertimeRecapFilters,
): Promise<OvertimeRecap> {
  const where: Record<string, unknown> = {
    ...hrScopeWhere(scope),
    date: { gte: filters.periodStart, lte: filters.periodEnd },
  }
  if (filters.departmentId != null) {
    if (scope.kind === "all") {
      where.employee = { departmentId: filters.departmentId }
    } else {
      // Scope department/self: filter bertemu scope lewat AND (irisan),
      // tidak pernah menimpa kunci scope — departemen asing = nol baris.
      where.AND = [{ employee: { departmentId: filters.departmentId } }]
    }
  }
  if (filters.projectId != null) where.projectId = filters.projectId
  if (filters.status != null) where.status = filters.status

  const rows = await prisma.overtimeRequest.findMany({
    where,
    select: {
      employeeId: true,
      projectId: true,
      date: true,
      status: true,
      hours: true,
      totalHours: true,
      mealHours: true,
      billableHours: true,
      calculatedValue: true,
      createdAt: true,
      employee: {
        select: {
          name: true,
          departmentId: true,
          department: { select: { name: true } },
        },
      },
      project: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  return buildOvertimeRecap(
    rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentId: r.employee.departmentId,
      departmentName: r.employee.department?.name ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      date: r.date,
      status: r.status,
      hours: Number(r.hours),
      totalHours: r.totalHours === null ? null : Number(r.totalHours),
      mealHours: r.mealHours === null ? null : Number(r.mealHours),
      billableHours: r.billableHours === null ? null : Number(r.billableHours),
      calculatedValue: r.calculatedValue === null ? null : Number(r.calculatedValue),
      createdAt: r.createdAt,
    })),
  )
}
