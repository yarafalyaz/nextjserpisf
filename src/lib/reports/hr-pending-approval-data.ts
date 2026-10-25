/**
 * Loader read-only antrean persetujuan HR tertunda
 * (F-2026-10-25-007-S tahap 1 + kind pinjaman F-2026-10-25-018-S, NOL migrasi).
 *
 * Tiga query massal (LeaveRequest + OvertimeRequest + EmployeeLoan
 * berstatus PERSIS `pending`) dalam scope HR pemanggil lewat
 * `hrScopeWhere` existing — scope diterapkan di server, bukan
 * penyaringan UI (BR-HP-03/BR-LS-06). Relasi employee.department
 * (+ project lembur) dimuat lewat select relasi Prisma (satu query per
 * model, anti-N+1, BR-HP-12).
 *
 * Gerbang ganda view+approve ditegakkan PEMANGGIL sebelum loader ini
 * dipanggil (halaman/aksi): `view_leave_requests` +
 * `approve_leave_requests` untuk cuti, `view_overtime` +
 * `approve_overtime_requests` untuk lembur, `view_employee_loans` +
 * `approve_loans` untuk pinjaman (§4 spec + Q-LS-3a 026-L). Loader
 * menerima scope yang sudah ditegakkan itu apa adanya; scope rusak dari
 * `getHrScope` (self employeeId -1) menghasilkan nol baris.
 *
 * Select TIDAK memuat nominal GAJI apa pun (BR-HP-08, AC-HP-B7).
 * Nominal pinjaman (totalAmount/cicilan tersimpan) tampil penuh dalam
 * scope per Q-LS-3a — nominal pinjaman bukan gaji. Hanya baca: nol
 * mutasi LeaveRequest/OvertimeRequest/EmployeeLoan/ApprovalWorkflow
 * (BR-HP-05/06).
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
  const [leaves, overtimes, loans] = await Promise.all([
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
    prisma.employeeLoan.findMany({
      where: { status: "pending", ...scopeWhere },
      select: {
        id: true,
        slug: true,
        status: true,
        employeeId: true,
        loanDate: true,
        totalAmount: true,
        monthlyInstallment: true,
        weeklyInstallment: true,
        notes: true,
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
      loanTotalAmount: null,
      loanMonthlyInstallment: null,
      loanWeeklyInstallment: null,
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
      loanTotalAmount: null,
      loanMonthlyInstallment: null,
      loanWeeklyInstallment: null,
    })),
    ...loans.map((r) => ({
      id: r.id,
      kind: "loan" as const,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentName: r.employee.department?.name ?? null,
      slug: r.slug,
      status: r.status,
      createdAt: r.createdAt,
      eventDate: r.loanDate,
      endDate: null,
      leaveType: null,
      hours: null,
      reason: r.notes,
      projectName: null,
      // Nominal pinjaman apa adanya sebagai string desimal (Q-LS-3a);
      // mingguan null jujur = tanpa perjanjian tertulis (BR-LS-08).
      loanTotalAmount: r.totalAmount.toString(),
      loanMonthlyInstallment: r.monthlyInstallment.toString(),
      loanWeeklyInstallment: r.weeklyInstallment?.toString() ?? null,
    })),
  ]

  return buildHrPendingApprovalQueue(inputs, today)
}
