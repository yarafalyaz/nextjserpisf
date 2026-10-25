/**
 * Loader read-only antrean persetujuan HR tertunda
 * (F-2026-10-25-007-S tahap 1, NOL migrasi).
 *
 * Dua query massal (LeaveRequest + OvertimeRequest berstatus PERSIS
 * `pending`) dalam scope HR pemanggil lewat `hrScopeWhere` existing —
 * scope diterapkan di server, bukan penyaringan UI (BR-HP-03). Relasi
 * employee.department + project dimuat lewat select relasi Prisma
 * (satu query per model, anti-N+1, BR-HP-12).
 *
 * Gerbang ganda view+approve ditegakkan PEMANGGIL sebelum loader ini
 * dipanggil (halaman/aksi): `view_leave_requests` +
 * `approve_leave_requests` untuk cuti, `view_overtime` +
 * `approve_overtime_requests` untuk lembur (§4 spec). Loader menerima
 * scope yang sudah ditegakkan itu apa adanya; scope rusak dari
 * `getHrScope` (self employeeId -1) menghasilkan nol baris.
 *
 * Select TIDAK memuat `calculatedValue`/nominal gaji apa pun
 * (BR-HP-08, AC-HP-B7). Hanya baca: nol mutasi
 * LeaveRequest/OvertimeRequest/ApprovalWorkflow (BR-HP-05/06).
 */

import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildHrPendingApprovalQueue,
  type HrPendingApprovalInput,
  type HrPendingApprovalRow,
} from "@/lib/reports/hr-pending-approval"

export async function loadHrPendingApprovalQueue(
  scope: HrScope,
  today: Date = new Date(),
): Promise<HrPendingApprovalRow[]> {
  const scopeWhere = hrScopeWhere(scope)
  const [leaves, overtimes] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "pending", ...scopeWhere },
      select: {
        id: true,
        slug: true,
        status: true,
        employeeId: true,
        type: true,
        startDate: true,
        endDate: true,
        reason: true,
        createdAt: true,
        employee: {
          select: {
            name: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.overtimeRequest.findMany({
      where: { status: "pending", ...scopeWhere },
      select: {
        id: true,
        slug: true,
        status: true,
        employeeId: true,
        date: true,
        hours: true,
        reason: true,
        createdAt: true,
        employee: {
          select: {
            name: true,
            department: { select: { name: true } },
          },
        },
        project: { select: { name: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ])

  const inputs: HrPendingApprovalInput[] = [
    ...leaves.map((r) => ({
      id: r.id,
      kind: "leave" as const,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentName: r.employee.department?.name ?? null,
      slug: r.slug,
      status: r.status,
      createdAt: r.createdAt,
      eventDate: r.startDate,
      endDate: r.endDate,
      leaveType: r.type,
      hours: null,
      reason: r.reason,
      projectName: null,
    })),
    ...overtimes.map((r) => ({
      id: r.id,
      kind: "overtime" as const,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentName: r.employee.department?.name ?? null,
      slug: r.slug,
      status: r.status,
      createdAt: r.createdAt,
      eventDate: r.date,
      endDate: null,
      leaveType: null,
      // Jam verbatim sebagai string desimal (BR-HP-07); bukan nominal.
      hours: r.hours.toString(),
      reason: r.reason,
      projectName: r.project?.name ?? null,
    })),
  ]

  return buildHrPendingApprovalQueue(inputs, today)
}
