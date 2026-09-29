"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { safeAdd, safeSubtract, safeSum } from "@/lib/utils/math";
import {
  computeBpjsEmployee,
  computePph21Monthly,
} from "@/lib/services/payroll-statutory.service";
import { prisma } from "@/lib/db/prisma";
import {
  generateDocumentNumber,
  generateDocumentNumberBatch,
} from "@/lib/utils/document-number";
import { revalidatePath } from "next/cache";
import {
  requireId,
  safeNumber,
} from "@/lib/utils/safe-parse";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  appreciationSchema,
  payrollSchema,
} from "@/lib/validations/hrm.schemas";
import { calculateLatePenalty } from "@/lib/services/late-penalty.service";
import { calculateAttendanceSummary } from "@/lib/services/attendance-summary.service";
import {
  getLeaveQuota,
  countLeaveWorkingDays,
  QUOTA_LEAVE_TYPES,
} from "@/lib/services/leave-quota.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { onPayrollPaid, onEmployeeLoanDisbursed, deleteJournalByReferenceTx } from "@/lib/hooks/accounting.hook";
import { getSystemSettings } from "@/lib/utils/settings";
import { assertHrEmployeeAccess, getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope";
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service";


function getWibNow(now = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000;
  return new Date(now.getTime() + wibOffset);
}

function getWibDateOnly(now = new Date()) {
  const wibNow = getWibNow(now);
  return new Date(
    Date.UTC(
      wibNow.getUTCFullYear(),
      wibNow.getUTCMonth(),
      wibNow.getUTCDate(),
    ),
  );
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((v) => Number(v || 0));
  return h * 60 + m;
}

/** Menit irisan antara periode kerja [inMin,outMin] dengan jam istirahat (ISOMA). */
function breakOverlapMinutes(
  inMin: number,
  outMin: number,
  breakStart?: string | null,
  breakEnd?: string | null,
): number {
  if (!breakStart || !breakEnd) return 0;
  const bs = toMinutes(breakStart);
  const be = toMinutes(breakEnd);
  if (be <= bs || outMin <= inMin) return 0;
  return Math.max(0, Math.min(outMin, be) - Math.max(inMin, bs));
}

// ==================== LEAVE REQUEST ACTIONS ====================

export async function createLeaveRequest(formData: FormData) {
  try {
    const user = await requirePermission("create_leave_requests");

    const parsed = parseFormData(leaveRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId;

    const scope = await getHrScope(user);
    if (scope.kind === "self" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya diperbolehkan membuat pengajuan cuti untuk diri sendiri");
    } else if (scope.kind === "department") {
      const targetEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { departmentId: true }
      });
      if (!targetEmployee || targetEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan membuat pengajuan cuti untuk karyawan se-departemen");
      }
    }
    const startDate = new Date(v.startDate);
    const endDate = new Date(v.endDate);

    // Guard: a leave period must not start after it ends. Without this, an
    // inverted range (startDate > endDate) silently bypasses the overlap check
    // below (both date predicates evaluate false), persisting a nonsensical
    // record and letting a second overlapping leave slip through.
    if (startDate > endDate) {
      throw new Error("Tanggal mulai tidak boleh melebihi tanggal selesai");
    }

    // Guard: overlap — no pending/approved leave can overlap [startDate, endDate].
    // Wrap the overlap check + insert in a single $transaction. Without this,
    // two concurrent submissions for the same employee / same week both pass
    // the check (TOCTOU) and create duplicate pending leaves. A transaction
    // alone does not serialize these reads at the default isolation level, so
    // lock the employee row before checking overlap/quota. Requests for the
    // same employee now proceed one at a time.
    const leave = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;

      const overlap = await tx.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: ["pending", "approved"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new Error(
          "Terdapat pengajuan cuti lain yang bentrok di tanggal yang sama. Hapus atau tolak yang lama terlebih dahulu.",
        );
      }

      // Annual-leave quota gate (only `annual` draws down the 12-day/calendar-year
      // balance — see QUOTA_LEAVE_TYPES). Two enforced rules:
      //  1. Tenure: employees with < 1 year of service (from joinDate) are not
      //     entitled to paid annual leave at all (entitled = 0).
      //  2. Balance: (already-used + days requested) must not exceed the 12-day
      //     entitlement. Working days are counted per the employee's WorkSchedule
      //     and exclude national/department holidays. pending requests count
      //     toward "used" so two in-flight requests can't both pass the check.
      // Runs inside the same tx as the overlap check + insert so the read used
      // for the gate and the write are atomic. Quota is keyed on the leave's
      // START year (a leave straddling Dec→Jan is charged to the year it begins).
      if (QUOTA_LEAVE_TYPES.has(v.type)) {
        const quotaYear = startDate.getFullYear();
        const quota = await getLeaveQuota(employeeId, {
          year: quotaYear,
          db: tx,
        });
        if (!quota.eligible) {
          throw new Error(
            "Cuti tahunan hanya untuk karyawan dengan masa kerja minimal 1 tahun.",
          );
        }
        const requestedDays = await countLeaveWorkingDays(
          employeeId,
          startDate,
          endDate,
          tx,
        );
        if (requestedDays === 0) {
          throw new Error(
            "Rentang cuti tidak mengandung hari kerja (semua tanggal jatuh pada akhir pekan / hari libur).",
          );
        }
        if (quota.used + requestedDays > quota.entitled) {
          throw new Error(
            `Sisa jatah cuti tahunan ${quota.remaining} hari tidak cukup untuk ${requestedDays} hari yang diajukan ` +
              `(jatah ${quota.entitled} hari/tahun ${quotaYear}, sudah terpakai ${quota.used} hari).`,
          );
        }
      }

      const created = await tx.leaveRequest.create({
        data: {
          employeeId,
          type: v.type,
          startDate,
          endDate,
          reason: v.reason ?? null,
          status: "pending",
        },
      });
      await requestApprovalIfConfigured(
        "LeaveRequest",
        created.id,
        Number(user.id),
        tx,
      );
      return created;
    });

    await logActivity(
      "create",
      "LeaveRequest",
      leave.id,
      "Membuat pengajuan cuti",
    );
    revalidatePath("/sdm/cuti");
    return { success: true, id: leave.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createLeaveRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function approveLeave(leaveId: number) {
  try {
    const user = await requirePermission("approve_leave_requests");
    await assertApproved("LeaveRequest", leaveId);

    const leave = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: leaveId },
    });

    if (leave.status !== "pending") {
      throw new Error(
        "Leave request hanya bisa di-approve dari status pending",
      );
    }

    const claim = await prisma.leaveRequest.updateMany({
      where: { id: leaveId, status: "pending" },
      data: { status: "approved", approvedBy: Number(user.id) },
    });
    if (claim.count === 0) {
      throw new Error("Leave request sudah diproses atau status tidak valid");
    }

    await logActivity(
      "approve",
      "LeaveRequest",
      leaveId,
      "Menyetujui pengajuan cuti",
    );
    revalidatePath("/sdm/cuti");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveLeave]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function rejectLeave(leaveId: number, reason?: string) {
  try {
    const user = await requirePermission("edit_leave_requests");
    await assertApproved("LeaveRequest", leaveId);

    const leave = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: leaveId },
      select: { status: true },
    });
    if (leave.status !== "pending") {
      throw new Error(
        "Hanya pengajuan cuti berstatus menunggu yang dapat ditolak",
      );
    }

    const claim = await prisma.leaveRequest.updateMany({
      where: { id: leaveId, status: "pending" },
      data: {
        status: "rejected",
        approvedBy: Number(user.id),
        rejectionReason: reason,
      },
    });
    if (claim.count === 0) {
      throw new Error("Pengajuan cuti sudah diproses atau status tidak valid");
    }

    await logActivity(
      "reject",
      "LeaveRequest",
      leaveId,
      "Menolak pengajuan cuti",
    );
    revalidatePath("/sdm/cuti");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[rejectLeave]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== OVERTIME REQUEST ACTIONS ====================

export async function createOvertimeRequest(formData: FormData) {
  try {
    const user = await requirePermission("create_overtime_requests");
    const scope = await getHrScope(user);

    const parsed = parseFormData(overtimeRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;
    await assertHrEmployeeAccess(scope, v.employeeId);

    const overtime = await prisma.$transaction(async (tx) => {
      const created = await tx.overtimeRequest.create({
        data: {
          employeeId: v.employeeId,
          projectId: v.projectId ?? null,
          date: new Date(v.date),
          hours: v.hours,
          totalHours: v.totalHours ?? null,
          mealHours: v.mealHours ?? null,
          billableHours: v.billableHours ?? null,
          reason: v.reason ?? null,
          status: "pending",
        },
      });
      await requestApprovalIfConfigured(
        "OvertimeRequest",
        created.id,
        Number(user.id),
        tx,
      );
      return created;
    });

    await logActivity(
      "create",
      "OvertimeRequest",
      overtime.id,
      "Membuat pengajuan lembur",
    );
    revalidatePath("/sdm/lembur");
    return { success: true, id: overtime.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createOvertimeRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function approveOvertime(overtimeId: number) {
  try {
    const user = await requirePermission("approve_overtime_requests");
    await assertApproved("OvertimeRequest", overtimeId);

    const ot = await prisma.overtimeRequest.findUniqueOrThrow({
      where: { id: overtimeId },
      include: { employee: { select: { baseSalary: true } } },
    });
    if (ot.status !== "pending") {
      throw new Error(
        "Hanya pengajuan lembur berstatus menunggu yang dapat disetujui",
      );
    }

    // Compute overtime value: hours * baseSalary * multiplier * coefficient.
    // Default: multiplier ≈ 1/173 (monthly-to-hourly), coefficient 1.10 (first-hour rate).
    const settings = await prisma.systemSetting.findFirst({
      select: { overtimeMultiplier: true, overtimeCoefficient: true },
    });
    const multiplier = Number(settings?.overtimeMultiplier ?? 0.00578035);
    const coefficient = Number(settings?.overtimeCoefficient ?? 1.1);
    const baseSalary = Number(ot.employee?.baseSalary ?? 0);
    const hours = Number(ot.hours);
    const calculatedValue = Math.round(
      hours * baseSalary * multiplier * coefficient,
    );

    const claim = await prisma.overtimeRequest.updateMany({
      where: { id: overtimeId, status: "pending" },
      data: {
        status: "approved",
        approvedBy: Number(user.id),
        calculatedValue,
      },
    });
    if (claim.count === 0) {
      throw new Error("Pengajuan lembur sudah diproses atau status tidak valid");
    }

    await logActivity(
      "approve",
      "OvertimeRequest",
      overtimeId,
      "Menyetujui pengajuan lembur",
    );
    revalidatePath("/sdm/lembur");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveOvertime]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PAYROLL ACTIONS ====================

// Internal computation helper: NOT exported, so it's not reachable as a "use
// server" action. The exported wrapper below is the only public entry point
// and it ALWAYS calls requirePermission("view_payroll") first. Previously this
// took a `skipPermissionCheck` boolean argument; that flag was controllable
// over the wire (Next.js serialises args to server actions), so a remote
// caller could pass `true` to forge a super_admin session and read any
// employee's salary/loans/attendance. Mirrors the computeBulkPayrollEstimations
// hardening.
interface PayrollEstimationResult {
  baseSalary: number;
  overtimeTotal: number;
  appreciationTotal: number;
  loanDeduction: number;
  lateDeduction: number;
  lateMinutes: number;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  holidayDays: number;
  absentDays: number;
  dailyRate: number;
  absentDeduction: number;
  grossSalary: number;
  bpjsHealthEmployee: number;
  bpjsEmploymentEmployee: number;
  pph21: number;
}

type PayrollSessionUser = { id: number | string; roles: readonly string[] };

function assertPayrollDateRange(startDateStr: string, endDateStr: string): void {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  const rangeMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs < 0) {
    throw new Error("Rentang tanggal penggajian tidak valid");
  }
  if (rangeMs > 90 * 24 * 60 * 60 * 1000) {
    throw new Error("Rentang tanggal penggajian maksimal 90 hari");
  }
}

async function computePayrollEstimation(
  employeeId: number,
  startDateStr: string,
  endDateStr: string,
): Promise<PayrollEstimationResult> {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  // Queries 1–5 are mutually independent (each keyed only on employeeId and the
  // date range), so fire them in a single Promise.all instead of five sequential
  // round-trips. This matters most in generateBulkPayroll, which invokes this
  // estimator once per active employee inside a serial loop: the change collapses
  // 5×N sequential DB hits into N batched round-trips.
  const [employee, overtimes, appreciations, latePenalty, attendance] =
    await Promise.all([
      // 1. Base Salary & Active Loans
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          baseSalary: true,
          maritalStatus: true,
          employeeLoans: {
            where: { status: "active" },
          },
        },
      }),
      // 2. Overtime
      prisma.overtimeRequest.findMany({
        where: {
          employeeId,
          status: "approved",
          date: { gte: startDate, lte: endDate },
        },
      }),
      // 3. Appreciation
      prisma.appreciation.findMany({
        where: {
          employeeId,
          date: { gte: startDate, lte: endDate },
        },
      }),
      // 4. Late Deduction
      calculateLatePenalty(employeeId, startDate, endDate),
      // 5. Attendance summary (working days, absent/bolos deduction, holidays excluded)
      calculateAttendanceSummary(employeeId, startDate, endDate),
    ]);

  if (!employee) throw new Error("Employee not found");

  const baseSalary = Number(employee.baseSalary);
  // Loan deduction capped to what each loan actually still owes (remaining), so the
  // final-installment scenario doesn't over-deduct the employee.
  const loanDeduction = employee.employeeLoans.reduce(
    (sum, loan) =>
      sum +
      safeAdd(
        0,
        Math.min(Number(loan.monthlyInstallment), Number(loan.remainingAmount)),
        0,
      ),
    0,
  );

  const overtimeTotal = overtimes.reduce(
    (sum, ot) => safeAdd(sum, ot.calculatedValue ?? 0, 0),
    0,
  );

  const appreciationTotal = appreciations.reduce(
    (sum, ap) => safeAdd(sum, ap.amount ?? 0, 0),
    0,
  );

  // 6. Statutory: BPJS (employee portion) + PPh21
  const grossSalary = safeSum(
    [baseSalary, overtimeTotal, appreciationTotal],
    0,
  );
  const bpjs = computeBpjsEmployee(baseSalary);
  const pph21 = computePph21Monthly(
    grossSalary,
    employee.maritalStatus,
    bpjs.total,
  );

  return {
    baseSalary,
    overtimeTotal,
    appreciationTotal,
    loanDeduction,
    lateDeduction: latePenalty.totalPenalty,
    lateMinutes: latePenalty.totalLateMinutes,
    workingDays: attendance.workingDays,
    presentDays: attendance.presentDays,
    leaveDays: attendance.leaveDays,
    holidayDays: attendance.holidayDays,
    absentDays: attendance.absentDays,
    dailyRate: attendance.dailyRate,
    absentDeduction: attendance.absentDeduction,
    grossSalary,
    bpjsHealthEmployee: bpjs.health,
    bpjsEmploymentEmployee: bpjs.employment,
    pph21,
  };
}

export async function getPayrollEstimation(
  employeeId: number,
  startDateStr: string,
  endDateStr: string,
) {
  try {
    const sessionUser = await requirePermission("view_payroll");
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new Error("Karyawan tidak valid");
    }
    assertPayrollDateRange(startDateStr, endDateStr);
    const scope = await getHrScope({
      id: String(sessionUser.id),
      roles: Array.isArray(sessionUser.roles) ? [...sessionUser.roles] : [],
    });
    await assertHrEmployeeAccess(scope, employeeId);
    return await computePayrollEstimation(
      employeeId,
      startDateStr,
      endDateStr,
    );
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getPayrollEstimation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Local copy of attendance-summary.dateKey to keep the bulk estimator self-contained. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface BulkPayrollEstimation {
  baseSalary: number;
  overtimeTotal: number;
  appreciationTotal: number;
  loanDeduction: number;
  lateDeduction: number;
  lateMinutes: number;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  holidayDays: number;
  absentDays: number;
  dailyRate: number;
  absentDeduction: number;
  grossSalary: number;
  bpjsHealthEmployee: number;
  bpjsEmploymentEmployee: number;
  pph21: number;
}

/**
 * Batch payroll estimator: collapses the per-employee N+1 in
 * `generateBulkPayroll` to a constant number of queries.
 *
 * The per-employee `getPayrollEstimation` fires 5 independent queries
 * (employee+loans, overtimes, appreciations, latePenalty→attendances+settings,
 * attendanceSummary→schedules+holidays+deptHolidays+attendances+leaves). When
 * called inside a serial loop over N employees, that's 5×N round-trips even
 * after the previous Promise.all micro-fix.
 *
 * This bulk version hoists all the "fan-out" reads (schedules, holidays,
 * dept holidays, attendances, leaves, overtimes, appreciations, employees,
 * settings) into a SINGLE Promise.all, then computes the estimation in
 * memory. Net result: 9 queries total regardless of N.
 */
// Module-scoped (NOT exported): in a "use server" file every `export async`
// becomes a network endpoint. This helper is an internal building block for
// generateBulkPayroll and must never be callable directly by a client —
// the previous version was reachable as a live server action and would
// return salary/loan/attendance data for any employee ID list with no
// permission check. Public callers go through the `getBulkPayrollEstimations`
// wrapper below, which enforces requirePermission("view_payroll").
async function computeBulkPayrollEstimations(
  employeeIds: number[],
  startDateStr: string,
  endDateStr: string,
): Promise<Map<number, BulkPayrollEstimation>> {
  const result = new Map<number, BulkPayrollEstimation>();
  if (employeeIds.length === 0) return result;

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);

  // Fan-out: fetch EVERYTHING the per-employee estimator needs, once.
  const [
    settings,
    workSchedules,
    holidays,
    departmentHolidays,
    employees,
    overtimes,
    appreciations,
    attendances,
    leaves,
  ] = await Promise.all([
    getSystemSettings(),
    prisma.workSchedule.findMany({
      where: { isActive: true },
      select: {
        workDays: true,
        employees: { select: { id: true } },
        departments: { select: { id: true } },
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
    prisma.departmentHoliday.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true, departmentId: true },
    }),
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        baseSalary: true,
        maritalStatus: true,
        departmentId: true,
        employeeLoans: { where: { status: "active" } },
      },
    }),
    prisma.overtimeRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "approved",
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.appreciation.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.attendance.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { employeeId: true, date: true, checkIn: true, lateMinutes: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "approved",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  // Index per-employee slices in O(N)
  const overtimeMap = new Map<number, typeof overtimes>();
  for (const ot of overtimes) {
    const arr = overtimeMap.get(ot.employeeId) ?? [];
    arr.push(ot);
    overtimeMap.set(ot.employeeId, arr);
  }
  const appreciationMap = new Map<number, typeof appreciations>();
  for (const ap of appreciations) {
    const arr = appreciationMap.get(ap.employeeId) ?? [];
    arr.push(ap);
    appreciationMap.set(ap.employeeId, arr);
  }
  const attendanceMap = new Map<number, typeof attendances>();
  for (const attendance of attendances) {
    const arr = attendanceMap.get(attendance.employeeId) ?? [];
    arr.push(attendance);
    attendanceMap.set(attendance.employeeId, arr);
  }
  const leaveMap = new Map<number, typeof leaves>();
  for (const leave of leaves) {
    const arr = leaveMap.get(leave.employeeId) ?? [];
    arr.push(leave);
    leaveMap.set(leave.employeeId, arr);
  }
  const rawPerMinute = Number(settings.latePenaltyPerMinute);
  const penaltyPerMinute = Number.isFinite(rawPerMinute) && rawPerMinute > 0 ? rawPerMinute : 0;
  const rawMax = Number(settings.maxLatePenaltyMinutes);
  const maxMinutes = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const evalEnd = rangeEnd < today ? rangeEnd : today;
  const publicHolidaySet = new Set(holidays.map((holiday) => dateKey(holiday.date)));
  const departmentHolidaySet = new Map<number, Set<string>>();
  for (const holiday of departmentHolidays) {
    const dates = departmentHolidaySet.get(holiday.departmentId) ?? new Set<string>();
    dates.add(dateKey(holiday.date));
    departmentHolidaySet.set(holiday.departmentId, dates);
  }

  for (const employee of employees) {
    // 1. Base salary + loan deduction (capped at remaining balance).
    const baseSalary = Number(employee.baseSalary);
    const loanDeduction = employee.employeeLoans.reduce(
      (sum, loan) =>
        sum +
        safeAdd(
          0,
          Math.min(
            Number(loan.monthlyInstallment),
            Number(loan.remainingAmount),
          ),
          0,
        ),
      0,
    );

    // 2. Overtime total.
    const empOvertimes = overtimeMap.get(employee.id) ?? [];
    const overtimeTotal = empOvertimes.reduce(
      (sum, ot) => safeAdd(sum, ot.calculatedValue ?? 0, 0),
      0,
    );

    // 3. Appreciation total.
    const empAppreciations = appreciationMap.get(employee.id) ?? [];
    const appreciationTotal = empAppreciations.reduce(
      (sum, ap) => safeAdd(sum, ap.amount ?? 0, 0),
      0,
    );

    // 4. Late penalty from the minutes recorded at check-in.
    const employeeAttendances = attendanceMap.get(employee.id) ?? [];
    let lateMinutes = 0;
    let lateDeduction = 0;
    for (const attendance of employeeAttendances) {
      let minutes = Number(attendance.lateMinutes ?? 0);
      if (minutes <= 0) continue;
      if (maxMinutes != null) minutes = Math.min(minutes, maxMinutes);
      lateMinutes += minutes;
      lateDeduction += minutes * penaltyPerMinute;
    }

    // 5. Attendance summary, using the same employee/department/global schedule precedence.
    const employeeSchedule = workSchedules.find((schedule) =>
      schedule.employees.some((assigned) => assigned.id === employee.id),
    );
    const departmentSchedule = workSchedules.find(
      (schedule) =>
        schedule.employees.length === 0 &&
        employee.departmentId != null &&
        schedule.departments.some((assigned) => assigned.id === employee.departmentId),
    );
    const globalSchedule = workSchedules.find(
      (schedule) => schedule.employees.length === 0 && schedule.departments.length === 0,
    );
    const schedule = employeeSchedule ?? departmentSchedule ?? globalSchedule;
    const workingWeekdays = new Set(
      (schedule?.workDays ?? "")
        .split(",")
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    );
    if (workingWeekdays.size === 0) {
      for (const day of [1, 2, 3, 4, 5]) workingWeekdays.add(day);
    }
    const presentSet = new Set(
      employeeAttendances
        .filter((attendance) => attendance.checkIn != null)
        .map((attendance) => dateKey(attendance.date)),
    );
    const leaveSet = new Set<string>();
    for (const leave of leaveMap.get(employee.id) ?? []) {
      const from = new Date(Math.max(new Date(leave.startDate).setHours(0, 0, 0, 0), rangeStart.getTime()));
      const to = new Date(Math.min(new Date(leave.endDate).setHours(0, 0, 0, 0), rangeEnd.getTime()));
      for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
        leaveSet.add(dateKey(day));
      }
    }
    const employeeDepartmentHolidays = employee.departmentId == null
      ? new Set<string>()
      : departmentHolidaySet.get(employee.departmentId) ?? new Set<string>();
    let totalWorkingDays = 0;
    let workingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;
    let absentDays = 0;
    for (let day = new Date(rangeStart); day <= rangeEnd; day.setDate(day.getDate() + 1)) {
      if (!workingWeekdays.has(day.getDay())) continue;
      const key = dateKey(day);
      if (publicHolidaySet.has(key) || employeeDepartmentHolidays.has(key)) {
        if (day <= evalEnd) holidayDays++;
        continue;
      }
      totalWorkingDays++;
      if (day > evalEnd) continue;
      workingDays++;
      if (presentSet.has(key)) presentDays++;
      else if (leaveSet.has(key)) leaveDays++;
      else absentDays++;
    }
    const dailyRate = totalWorkingDays > 0 ? baseSalary / totalWorkingDays : 0;
    const absentDeduction = Math.round(absentDays * dailyRate);

    // 6. Statutory deductions.
    const grossSalary = safeSum(
      [baseSalary, overtimeTotal, appreciationTotal],
      0,
    );
    const bpjs = computeBpjsEmployee(baseSalary);
    const pph21 = computePph21Monthly(
      grossSalary,
      employee.maritalStatus,
      bpjs.total,
    );

    result.set(employee.id, {
      baseSalary,
      overtimeTotal,
      appreciationTotal,
      loanDeduction,
      lateDeduction,
      lateMinutes,
      workingDays,
      presentDays,
      leaveDays,
      holidayDays,
      absentDays,
      dailyRate,
      absentDeduction,
      grossSalary,
      bpjsHealthEmployee: bpjs.health,
      bpjsEmploymentEmployee: bpjs.employment,
      pph21,
    });
  }

  return result;
}

export async function getBulkPayrollEstimations(
  employeeIds: number[],
  startDateStr: string,
  endDateStr: string,
): Promise<Map<number, BulkPayrollEstimation>> {
  const sessionUser = await requirePermission("view_payroll");
  if (!Array.isArray(employeeIds) || employeeIds.length > 500 || employeeIds.some(
    (id) => !Number.isSafeInteger(id) || id <= 0,
  )) {
    throw new Error("Daftar karyawan tidak valid");
  }
  assertPayrollDateRange(startDateStr, endDateStr);

  const requestedIds = Array.from(new Set(employeeIds));
  if (requestedIds.length === 0) return new Map();
  const scope = await getHrScope({
    id: String(sessionUser.id),
    roles: Array.isArray(sessionUser.roles) ? [...sessionUser.roles] : [],
  });
  const accessibleEmployees = await prisma.employee.findMany({
    where: {
      id: { in: requestedIds },
      ...(scope.kind === "all" ? {} : { AND: [hrEmployeeScopeWhere(scope)] }),
    },
    select: { id: true },
  });
  if (accessibleEmployees.length !== requestedIds.length) {
    throw new Error("Anda tidak memiliki akses ke data karyawan yang diminta");
  }
  return computeBulkPayrollEstimations(requestedIds, startDateStr, endDateStr);
}

export async function generateBulkPayroll(
  period: string,
  startDateStr: string,
  endDateStr: string,
) {
  try {
    const user = await requirePermission("create_payroll");

    const employees = await prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });

    // Batch: fetch all existing payrolls for this period in one query (eliminates N+1)
    const existingPayrolls = await prisma.payroll.findMany({
      where: { period, employeeId: { in: employees.map((e) => e.id) } },
      select: { employeeId: true },
    });
    const existingSet = new Set(existingPayrolls.map((p) => p.employeeId));
    const targetIds = employees
      .filter((e) => !existingSet.has(e.id))
      .map((e) => e.id);

    // Bulk fan-out: instead of calling getPayrollEstimation once per employee
    // (5 round-trips × N employees = 5×N), hoist every read into a single
    // Promise.all via computeBulkPayrollEstimations → constant 9 queries.
    const estimations = await computeBulkPayrollEstimations(
      targetIds,
      startDateStr,
      endDateStr,
    );

    // Hoist document number generation to eliminate the N+1 serial calls (N sequence bumps).
    const docNumbers = await generateDocumentNumberBatch(
      "PAYROLL",
      targetIds.length,
    );

    // Build all payroll rows in memory, then createMany + skipDuplicates in
    // ONE round-trip. The previous serial loop did N prisma.payroll.create
    // calls; P2002 duplicates are still skipped (they were caught in the
    // catch block of the old loop too).
    const rows: {
      documentNo: string;
      employeeId: number;
      period: string;
      startDate: Date;
      endDate: Date;
      baseSalary: number;
      allowances: number;
      deductions: number;
      overtimeTotal: number;
      appreciationTotal: number;
      loanDeduction: number;
      lateDeduction: number;
      lateMinutes: number;
      workingDays: number;
      presentDays: number;
      absentDays: number;
      absentDeduction: number;
      grossSalary: number;
      bpjsHealthEmployee: number;
      bpjsEmploymentEmployee: number;
      pph21: number;
      netSalary: number;
      totalAmount: number;
      status: string;
      createdBy: number;
    }[] = [];
    for (let i = 0; i < targetIds.length; i++) {
      const empId = targetIds[i];
      const est = estimations.get(empId);
      if (!est) continue;
      const documentNo = docNumbers[i];

      const statutory =
        (est.bpjsHealthEmployee ?? 0) +
        (est.bpjsEmploymentEmployee ?? 0) +
        (est.pph21 ?? 0);
      // Allowances/deductions are manual per-payslip fields (not part of auto-estimation);
      // they default to 0 and can be edited before approval. Formula mirrors processPayroll.
      const allowances = 0;
      const deductions = 0;
      const gross = safeSum(
        [
          est.baseSalary ?? 0,
          allowances,
          est.overtimeTotal ?? 0,
          est.appreciationTotal ?? 0,
        ],
        0,
      );
      const deds = safeSum(
        [
          deductions,
          est.loanDeduction ?? 0,
          est.lateDeduction ?? 0,
          est.absentDeduction ?? 0,
          statutory,
        ],
        0,
      );
      const netSalary = safeSubtract(gross, deds, 0);

      rows.push({
        documentNo,
        employeeId: empId,
        period,
        startDate: new Date(startDateStr),
        endDate: new Date(endDateStr),
        baseSalary: est.baseSalary ?? 0,
        allowances,
        deductions,
        overtimeTotal: est.overtimeTotal ?? 0,
        appreciationTotal: est.appreciationTotal ?? 0,
        loanDeduction: est.loanDeduction ?? 0,
        lateDeduction: est.lateDeduction,
        lateMinutes: est.lateMinutes,
        workingDays: est.workingDays ?? 0,
        presentDays: est.presentDays ?? 0,
        absentDays: est.absentDays ?? 0,
        absentDeduction: est.absentDeduction ?? 0,
        grossSalary: est.grossSalary ?? 0,
        bpjsHealthEmployee: est.bpjsHealthEmployee ?? 0,
        bpjsEmploymentEmployee: est.bpjsEmploymentEmployee ?? 0,
        pph21: est.pph21 ?? 0,
        netSalary: netSalary,
        totalAmount: netSalary,
        status: "draft",
        createdBy: Number(user.id),
      });
    }

    const count = rows.length;
    if (count > 0) {
      // createMany collapses N inserts into 1. skipDuplicates handles the
      // (employeeId, period) and (documentNo) unique-constraint races that
      // the previous loop caught per-row with a P2002 try/catch.
      await prisma.payroll.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }

    await logActivity(
      "generate",
      "Payroll",
      0,
      `Generate massal penggajian periode ${period} (${count} karyawan)`,
    );
    revalidatePath("/sdm/penggajian");
    return { success: true, count };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[generateBulkPayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function processPayroll(formData: FormData) {
  try {
    const user = await requirePermission("create_payroll");

    // Migrated to parseFormData(payrollSchema) — the previous hand-parsed path
    // (safeId/period as string/new Date(raw)/safeNumber) bypassed schema
    // validation: blank periods and dates crashed new Date() into Invalid Date,
    // non-numeric amounts became NaN, and the period/startDate/endDate required
    // guards were not enforced. Server still re-checks employeeId below because
    // payrollSchema accepts generateBulkPayroll's empty-employeeId case too.
    const parsed = parseFormData(payrollSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("PAYROLL");
    const employeeId = v.employeeId ?? null;
    const period = v.period;
    const startDate = new Date(v.startDate);
    const endDate = new Date(v.endDate);

    // Guard: employeeId is required — without it, payroll has no linkage
    if (!employeeId) {
      return { success: false, error: "Karyawan wajib dipilih" };
    }

    // Idempotency: prevent duplicate payroll for same employee+period.
    if (employeeId && period) {
      const exists = await prisma.payroll.findFirst({
        where: { employeeId, period },
        select: { id: true },
      });
      if (exists) {
        throw new Error(
          `Penggajian untuk karyawan ini pada periode ${period} sudah ada.`,
        );
      }
    }

    // Auto-calculate late penalty
    let lateDeduction = v.lateDeduction ?? 0;
    let lateMinutes = v.lateMinutes ?? 0;

    if (employeeId && lateDeduction === 0) {
      const latePenalty = await calculateLatePenalty(
        employeeId,
        startDate,
        endDate,
      );
      lateDeduction = latePenalty.totalPenalty;
      lateMinutes = latePenalty.totalLateMinutes;
    }

    // Attendance summary (working days + bolos deduction; holidays excluded)
    let workingDays = v.workingDays ?? 0;
    let presentDays = v.presentDays ?? 0;
    let absentDays = v.absentDays ?? 0;
    let absentDeduction = v.absentDeduction ?? 0;
    if (employeeId && absentDeduction === 0 && workingDays === 0) {
      const att = await calculateAttendanceSummary(
        employeeId,
        startDate,
        endDate,
      );
      workingDays = att.workingDays;
      presentDays = att.presentDays;
      absentDays = att.absentDays;
      absentDeduction = att.absentDeduction;
    }

    const baseSalary = v.baseSalary ?? 0;
    const allowances = v.allowances ?? 0;
    const deductions = v.deductions ?? 0;
    const overtimeTotal = v.overtimeTotal ?? 0;
    const appreciationTotal = v.appreciationTotal ?? 0;
    const loanDeduction = v.loanDeduction ?? 0;

    // Statutory: BPJS (employee) + PPh21, computed server-side from base salary.
    const empForTax = employeeId
      ? await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { maritalStatus: true },
        })
      : null;
    const grossSalary = safeSum(
      [baseSalary, allowances, overtimeTotal, appreciationTotal],
      0,
    );
    const bpjs = computeBpjsEmployee(baseSalary);
    const pph21 = computePph21Monthly(
      grossSalary,
      empForTax?.maritalStatus,
      bpjs.total,
    );
    const statutory = safeAdd(bpjs.total, pph21, 0);

    const deductionsSum = safeSum(
      [deductions, loanDeduction, lateDeduction, absentDeduction, statutory],
      0,
    );
    const netSalary = safeSubtract(grossSalary, deductionsSum, 0);
    // totalAmount must mirror the server-computed netSalary — never trust a
    // client-supplied total. Accepting formData "totalAmount" let the stored
    // figure (shown on payslips/reports/list-totals) diverge from the actual net
    // pay and from the GL posting, which posts netSalary + statutory (see
    // postPayrollJournal in accounting.hook.ts).
    const totalAmount = netSalary;
    const paymentDateRaw = v.paymentDate ?? null;

    const payroll = await prisma.$transaction(async (tx) => {
      const created = await tx.payroll.create({
        data: {
        documentNo,
        employeeId,
        period,
        startDate,
        endDate,
        baseSalary,
        allowances,
        deductions,
        overtimeTotal,
        appreciationTotal,
        loanDeduction,
        lateDeduction,
        lateMinutes,
        workingDays,
        presentDays,
        absentDays,
        absentDeduction,
        grossSalary,
        bpjsHealthEmployee: bpjs.health,
        bpjsEmploymentEmployee: bpjs.employment,
        pph21,
        netSalary,
        totalAmount,
        paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
        status: "draft",
        createdBy: Number(user.id),
        },
      });
      await requestApprovalIfConfigured(
        "Payroll",
        created.id,
        Number(user.id),
        tx,
      );
      return created;
    });

    await logActivity("process", "Payroll", payroll.id, "Memproses penggajian");
    revalidatePath("/sdm/penggajian");
    return { success: true, id: payroll.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    // Concurrent insert won the race against the app-level idempotency check
    // (TOCTOU): the DB unique constraint (employeeId, period) rejected the
    // duplicate. Surface the same friendly message as the pre-check.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: "Penggajian untuk karyawan ini pada periode tersebut sudah ada.",
      };
    }
    console.error("[processPayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePayroll(id: number, formData: FormData) {
  try {
    await requirePermission("edit_payroll");

    // Only draft payroll can be edited
    const existing = await prisma.payroll.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "draft") {
      throw new Error("Hanya penggajian status draft yang dapat diubah");
    }

    // Migrated to parseFormData(payrollSchema) — the previous hand-parsed path
    // (safeId/period as string/new Date(raw)/safeNumber) bypassed schema
    // validation: blank periods and dates became Invalid Date, non-numeric
    // amounts became NaN, and the period/startDate/endDate required guards
    // were not enforced. Mirrors processPayroll for validation parity.
    const parsed = parseFormData(payrollSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId ?? null;
    const startDate = new Date(v.startDate);
    const endDate = new Date(v.endDate);

    // Auto-calculate late penalty if not manually provided
    let lateDeduction = v.lateDeduction ?? 0;
    let lateMinutes = v.lateMinutes ?? 0;

    // recalcLate is a formData-only signal; payrollSchema doesn't include it
    // (it's a client hint, not a stored field).
    const recalcLate = v.recalcLate === true;
    if (employeeId && (lateDeduction === 0 || recalcLate)) {
      const latePenalty = await calculateLatePenalty(
        employeeId,
        startDate,
        endDate,
      );
      lateDeduction = latePenalty.totalPenalty;
      lateMinutes = latePenalty.totalLateMinutes;
    }

    // Attendance summary (working days + bolos deduction; holidays excluded)
    let workingDays = v.workingDays ?? 0;
    let presentDays = v.presentDays ?? 0;
    let absentDays = v.absentDays ?? 0;
    let absentDeduction = v.absentDeduction ?? 0;
    if (
      employeeId &&
      (recalcLate || (absentDeduction === 0 && workingDays === 0))
    ) {
      const att = await calculateAttendanceSummary(
        employeeId,
        startDate,
        endDate,
      );
      workingDays = att.workingDays;
      presentDays = att.presentDays;
      absentDays = att.absentDays;
      absentDeduction = att.absentDeduction;
    }

    const baseSalary = v.baseSalary ?? 0;
    const allowances = v.allowances ?? 0;
    const deductions = v.deductions ?? 0;
    const overtimeTotal = v.overtimeTotal ?? 0;
    const appreciationTotal = v.appreciationTotal ?? 0;
    const loanDeduction = v.loanDeduction ?? 0;

    // Statutory: BPJS (employee) + PPh21, computed server-side.
    const empForTaxUpd = employeeId
      ? await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { maritalStatus: true },
        })
      : null;
    const grossSalary = safeSum(
      [baseSalary, allowances, overtimeTotal, appreciationTotal],
      0,
    );
    const bpjs = computeBpjsEmployee(baseSalary);
    const pph21 = computePph21Monthly(
      grossSalary,
      empForTaxUpd?.maritalStatus,
      bpjs.total,
    );
    const statutory = safeAdd(bpjs.total, pph21, 0);

    // Recalculate net_salary auto
    const deductionsSum = safeSum(
      [deductions, loanDeduction, lateDeduction, absentDeduction, statutory],
      0,
    );
    const netSalary = safeSubtract(grossSalary, deductionsSum, 0);
    // totalAmount must mirror the server-computed netSalary — never trust a
    // client-supplied total. Accepting formData "totalAmount" let the stored
    // figure (shown on payslips/reports/list-totals) diverge from the actual net
    // pay and from the GL posting, which posts netSalary + statutory (see
    // postPayrollJournal in accounting.hook.ts).
    const totalAmount = netSalary;
    const paymentDateRaw = v.paymentDate ?? null;

    const payroll = await prisma.payroll.update({
      where: { id },
      data: {
        employeeId,
        costCenterId: v.costCenterId ?? null,
        period: v.period,
        startDate,
        endDate,
        baseSalary,
        allowances,
        deductions,
        overtimeTotal,
        appreciationTotal,
        loanDeduction,
        lateDeduction,
        lateMinutes,
        workingDays,
        presentDays,
        absentDays,
        absentDeduction,
        grossSalary,
        bpjsHealthEmployee: bpjs.health,
        bpjsEmploymentEmployee: bpjs.employment,
        pph21,
        netSalary,
        totalAmount,
        paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
      },
    });

    await logActivity(
      "update",
      "Payroll",
      payroll.id,
      "Memperbarui penggajian",
    );
    revalidatePath("/sdm/penggajian");
    return { success: true, id: payroll.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function approvePayroll(payrollId: number) {
  try {
    const user = await requirePermission("process_payroll");
    await assertApproved("Payroll", payrollId);

    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
    });

    if (payroll.status !== "draft") {
      throw new Error("Payroll hanya bisa di-approve dari status draft");
    }

    const claim = await prisma.payroll.updateMany({
      where: { id: payrollId, status: "draft" },
      data: { status: "approved", approvedBy: Number(user.id) },
    });
    if (claim.count === 0) {
      throw new Error("Penggajian sudah diproses atau status tidak valid");
    }

    await logActivity("approve", "Payroll", payrollId, "Menyetujui penggajian");
    revalidatePath("/sdm/penggajian");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approvePayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function markPayrollPaid(payrollId: number) {
  try {
    await requirePermission("process_payroll");

    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
    });

    // Approval workflow gate: if a Payroll workflow is configured, it must
    // be fully approved before marking as paid.
    await assertApproved("Payroll", payrollId);

    if (payroll.status !== "approved") {
      throw new Error(
        "Payroll hanya bisa ditandai dibayar dari status approved",
      );
    }

    await prisma.$transaction(async (tx) => {
      // Atomic conditional claim: only the request that flips status away from
      // "approved" wins. Without this, two concurrent "bayar gaji" clicks could
      // both pass the status guard above and each run loan amortization, double
      // -deducting the employee's loans for the same payroll (mirrors the
      // completeWorkOrder race fix). The conditional updateMany serializes it.
      const claim = await tx.payroll.updateMany({
        where: { id: payrollId, status: "approved" },
        data: { status: "paid", paymentDate: new Date() },
      });
      if (claim.count === 0) {
        throw new Error("Penggajian sudah dibayar atau status tidak valid");
      }

      // Amortize active employee loans using the amount actually withheld this
      // payroll (payroll.loanDeduction). Distribute oldest-first, capping each loan
      // by its installment and remaining balance, and stop once the withheld budget
      // is exhausted — previously every active loan was reduced by its full
      // installment regardless of how much was actually deducted (over-amortization).
      if (payroll.employeeId && Number(payroll.loanDeduction) > 0) {
        const activeLoans = await tx.employeeLoan.findMany({
          where: { employeeId: payroll.employeeId, status: "active" },
          orderBy: { loanDate: "asc" },
        });
        let budget = Number(payroll.loanDeduction);
        const updates: Promise<unknown>[] = [];
        for (const loan of activeLoans) {
          if (budget <= 0) break;
          const installment = Number(loan.monthlyInstallment);
          const remaining = Number(loan.remainingAmount);
          if (remaining <= 0) continue;
          const applied = Math.min(installment, remaining, budget);
          if (applied <= 0) continue;
          const newRemaining = safeSubtract(remaining, applied, 0);
          budget = safeSubtract(budget, applied, 0);
          updates.push(
            tx.employeeLoan.update({
              where: { id: loan.id },
              data: {
                remainingAmount: newRemaining,
                status: newRemaining <= 0 ? "paid_off" : "active",
              },
            }),
          );
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }

      // Post the salary-expense journal INSIDE the same transaction. Previously this
      // ran after commit: if posting failed (closed period, misconfigured account)
      // the payroll was already "paid" and loans amortized, but no journal existed —
      // and because the conditional claim above requires status "approved", a retry
      // could never re-claim, leaving the books permanently unbalanced. Running it in
      // the tx means a failed post rolls back the status flip and loan amortization,
      // so the action can simply be retried.
      await onPayrollPaid(payrollId, undefined, tx);
    });

    await logActivity(
      "mark",
      "Payroll",
      payrollId,
      "Menandai penggajian sebagai dibayar",
    );
    revalidatePath("/sdm/penggajian");
    revalidatePath(`/sdm/penggajian/${payrollId}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[markPayrollPaid]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== EMPLOYEE LOAN ACTIONS ====================

export async function createEmployeeLoan(formData: FormData) {
  try {
    const user = await requirePermission("create_loans");

    const parsed = parseFormData(employeeLoanSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId;

    const scope = await getHrScope(user);
    if (scope.kind === "self" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya diperbolehkan membuat pinjaman untuk diri sendiri");
    } else if (scope.kind === "department") {
      const targetEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { departmentId: true }
      });
      if (!targetEmployee || targetEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan membuat pinjaman untuk karyawan se-departemen");
      }
    }

    const totalAmount = v.totalAmount;

    // Create the loan row in pending status.
    // Wrap in tx to keep database constraints, but do not post the GL disbursement journal yet.
    // The journal is only posted after the loan is approved (via the approval workflow or bypass).
    const loan = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeLoan.create({
        data: {
          employeeId: v.employeeId,
          loanDate: new Date(v.loanDate),
          totalAmount,
          monthlyInstallment: v.monthlyInstallment,
          remainingAmount: totalAmount,
          status: "pending",
          notes: v.notes ?? null,
          createdBy: Number(user.id),
        },
      });
      await requestApprovalIfConfigured(
        "EmployeeLoan",
        created.id,
        Number(user.id),
        tx,
      );
      return created;
    });

    await logActivity(
      "create",
      "EmployeeLoan",
      loan.id,
      "Membuat pinjaman karyawan",
    );
    revalidatePath("/sdm/pinjaman");
    return { success: true, id: loan.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createEmployeeLoan]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== TIMESHEET ACTIONS ====================

export async function createTimesheet(formData: FormData) {
  try {
    const user = await requirePermission("create_timesheets");
    const scope = await getHrScope(user);

    const parsed = parseFormData(timesheetSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;
    await assertHrEmployeeAccess(scope, v.employeeId);

    const timesheet = await prisma.timesheet.create({
      data: {
        employeeId: v.employeeId,
        projectId: v.projectId,
        taskId: v.taskId ?? null,
        date: new Date(v.date),
        startTime: v.startTime ?? null,
        endTime: v.endTime ?? null,
        hours: v.hours,
        description: v.description ?? null,
      },
    });

    await logActivity(
      "create",
      "Timesheet",
      timesheet.id,
      "Membuat lembar waktu",
    );
    revalidatePath("/sdm/lembar-waktu");
    return { success: true, id: timesheet.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createTimesheet]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}



// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  try {
    const user = await requirePermission("delete_leave_requests");
    const scope = await getHrScope(user);

    // Guard: cannot delete approved leave — it bypasses the approval workflow
    const deleted = await prisma.$transaction(async (tx) => {
      // Approval actions lock approval rows before their source document.
      // Keep the same lock order to avoid deadlocks during concurrent delete/approve.
      await tx.$queryRaw`SELECT id FROM approvals WHERE reference_type = ${"LeaveRequest"} AND reference_id = ${id} ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id} FOR UPDATE`;
      const leave = await tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        select: { status: true, employeeId: true },
      });
      await assertHrEmployeeAccess(scope, leave.employeeId);
      if (leave.status === "approved") return false;

      await tx.leaveRequest.delete({ where: { id } });
      await tx.approval.deleteMany({
        where: { referenceType: "LeaveRequest", referenceId: id },
      });
      return true;
    });
    if (!deleted) {
      return {
        success: false,
        error:
          "Tidak bisa menghapus cuti yang sudah disetujui. Tolak terlebih dahulu.",
      };
    }

    await logActivity("delete", "LeaveRequest", id, "Menghapus pengajuan cuti");
    revalidatePath("/sdm/cuti");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteLeaveRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Annual-leave balance for a single employee (used by the leave form to show
 * the live remaining quota before submission). Returns null entitlement info
 * when the employee can't be resolved. Year defaults to the current calendar
 * year; pass a year to inspect a different period.
 */
export async function getEmployeeLeaveBalance(
  employeeId: number,
  year?: number,
) {
  try {
    const user = await requirePermission("view_leave_requests");
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return { success: false as const, error: "Karyawan tidak valid" };
    }
    if (year !== undefined && (!Number.isSafeInteger(year) || year < 1900 || year > 2200)) {
      return { success: false as const, error: "Tahun tidak valid" };
    }
    const scope = await getHrScope({
      id: String(user.id),
      roles: Array.isArray(user.roles) ? [...user.roles] : [],
    });
    await assertHrEmployeeAccess(scope, employeeId);
    const quota = await getLeaveQuota(employeeId, { year });
    return { success: true as const, quota };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getEmployeeLeaveBalance]", getErrorMessage(e) || e);
    return {
      success: false as const,
      error: getErrorMessage(e, "Terjadi kesalahan"),
    };
  }
}

/**
 * Annual-leave balance for active employees inside the caller's HR scope
 * (used by the leave-balance dashboard). One getLeaveQuota call per employee — fine for typical SME
 * headcounts; revisit with a batched query if the roster grows large.
 */
export async function getAllLeaveBalances(year?: number) {
  try {
    const user = await requirePermission("view_leave_requests");
    const targetYear = year ?? new Date().getFullYear();
    if (!Number.isSafeInteger(targetYear) || targetYear < 1900 || targetYear > 2200) {
      return { success: false as const, error: "Tahun tidak valid", balances: [] };
    }
    const scope = await getHrScope({
      id: String(user.id),
      roles: Array.isArray(user.roles) ? [...user.roles] : [],
    });

    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...hrEmployeeScopeWhere(scope),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        employeeNo: true,
        joinDate: true,
        department: { select: { name: true } },
      },
    });

    const balances = await Promise.all(
      employees.map(async (emp) => {
        const quota = await getLeaveQuota(emp.id, { year: targetYear });
        return {
          employeeId: emp.id,
          name: emp.name,
          employeeNo: emp.employeeNo,
          department: emp.department?.name ?? null,
          joinDate: emp.joinDate.toISOString().split("T")[0],
          entitled: quota.entitled,
          used: quota.used,
          remaining: quota.remaining,
          eligible: quota.eligible,
          tenureMonths: quota.tenureMonths,
        };
      }),
    );

    return { success: true as const, year: targetYear, balances };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getAllLeaveBalances]", getErrorMessage(e) || e);
    return {
      success: false as const,
      error: getErrorMessage(e, "Terjadi kesalahan"),
    };
  }
}

export async function deleteOvertimeRequest(id: number) {
  try {
    const user = await requirePermission("delete_overtime_requests");
    const scope = await getHrScope(user);

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approvals WHERE reference_type = ${"OvertimeRequest"} AND reference_id = ${id} ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM overtime_requests WHERE id = ${id} FOR UPDATE`;
      const overtime = await tx.overtimeRequest.findUniqueOrThrow({
        where: { id },
        select: { employeeId: true, status: true },
      });
      await assertHrEmployeeAccess(scope, overtime.employeeId);
      if (overtime.status === "approved") return false;

      await tx.overtimeRequest.delete({ where: { id } });
      await tx.approval.deleteMany({
        where: { referenceType: "OvertimeRequest", referenceId: id },
      });
      return true;
    });
    if (!deleted) {
      return {
        success: false,
        error: "Lembur yang sudah disetujui tidak dapat dihapus karena dapat memengaruhi penggajian.",
      };
    }

    await logActivity(
      "delete",
      "OvertimeRequest",
      id,
      "Menghapus pengajuan lembur",
    );
    revalidatePath("/sdm/lembur");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteOvertimeRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteTimesheet(id: number) {
  try {
    const user = await requirePermission("delete_timesheets");
    const scope = await getHrScope(user);
    const timesheet = await prisma.timesheet.findUniqueOrThrow({
      where: { id },
      select: { employeeId: true },
    });
    await assertHrEmployeeAccess(scope, timesheet.employeeId);

    await prisma.timesheet.delete({ where: { id } });

    await logActivity("delete", "Timesheet", id, "Menghapus lembar waktu");
    revalidatePath("/sdm/lembar-waktu");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteTimesheet]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteEmployeeLoan(id: number) {
  try {
    const user = await requirePermission("delete_loans");
    const scope = await getHrScope(user);
    const deleted = await prisma.$transaction(async (tx) => {
      // Match approveStep's approval → source-document lock order.
      await tx.$queryRaw`SELECT id FROM approvals WHERE reference_type = ${"EmployeeLoan"} AND reference_id = ${id} ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM employee_loans WHERE id = ${id} FOR UPDATE`;
      const loan = await tx.employeeLoan.findUniqueOrThrow({
        where: { id },
        select: { employeeId: true, status: true },
      });
      await assertHrEmployeeAccess(scope, loan.employeeId);
      if (loan.status !== "pending" && loan.status !== "rejected") return false;

      // Reverse the disbursement journal + delete the loan atomically. Loans now
      // post a GL journal on creation (onEmployeeLoanDisbursed); deleting without
      // reversing would orphan the journal and overstate Piutang Karyawan.
      await deleteJournalByReferenceTx(tx, "EmployeeLoan", id);
      await tx.employeeLoan.delete({ where: { id } });
      await tx.approval.deleteMany({
        where: { referenceType: "EmployeeLoan", referenceId: id },
      });
      return true;
    });
    if (!deleted) {
      return {
        success: false,
        error: "Pinjaman yang sudah disetujui atau dicairkan tidak dapat dihapus.",
      };
    }

    await logActivity(
      "delete",
      "EmployeeLoan",
      id,
      "Menghapus pinjaman karyawan",
    );
    revalidatePath("/sdm/pinjaman");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteEmployeeLoan]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_leave_requests");

    const scope = await getHrScope(user);

    // Only pending requests can be edited. Approved/rejected leave must not be re-opened.
    const existing = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, employeeId: true },
    });
    if (existing.status !== "pending") {
      throw new Error(
        "Hanya pengajuan cuti berstatus menunggu yang dapat diedit",
      );
    }

    if (scope.kind === "self" && scope.employeeId !== existing.employeeId) {
      throw new Error("Anda hanya diperbolehkan mengedit pengajuan cuti untuk diri sendiri");
    } else if (scope.kind === "department") {
      const existingEmployee = await prisma.employee.findUnique({
        where: { id: existing.employeeId },
        select: { departmentId: true }
      });
      if (!existingEmployee || existingEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengedit pengajuan cuti untuk karyawan se-departemen");
      }
    }

    // Migrated to parseFormData(leaveRequestSchema) — the previous hand-parsed
    // path (requireId/new Date(raw)/raw `as string` cast) bypassed schema
    // validation: blank dates became Invalid Date, employeeId/type could be
    // empty strings, and the existing date-order / overlap guards relied on
    // unvalidated raw inputs. Mirrors createLeaveRequest for validation parity.
    const parsed = parseFormData(leaveRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId;

    if (scope.kind === "self" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya diperbolehkan mengedit pengajuan cuti untuk diri sendiri");
    } else if (scope.kind === "department") {
      const targetEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { departmentId: true }
      });
      if (!targetEmployee || targetEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengedit pengajuan cuti untuk karyawan se-departemen");
      }
    }

    const startDate = new Date(v.startDate);
    const endDate = new Date(v.endDate);

    if (startDate > endDate) {
      throw new Error("Tanggal mulai tidak boleh melebihi tanggal selesai");
    }

    // Overlap check + quota gate + update run in one $transaction (mirrors
    // createLeaveRequest). Lock and re-read this request so a concurrent
    // approval cannot race the pending-only guard; then lock the target
    // employee to serialize overlap/quota checks with other requests.
    // The quota check excludes THIS request's id so its existing days are
    // not double-counted against the balance when editing.
    const leave = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id} FOR UPDATE`;
      const current = await tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== "pending") {
        throw new Error("Hanya pengajuan cuti berstatus menunggu yang dapat diedit");
      }

      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;

      const overlap = await tx.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: ["pending", "approved"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          id: { not: id },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new Error(
          "Terdapat pengajuan cuti lain yang bentrok di tanggal yang sama. Hapus atau tolak yang lama terlebih dahulu.",
        );
      }

      if (QUOTA_LEAVE_TYPES.has(v.type)) {
        const quotaYear = startDate.getFullYear();
        const quota = await getLeaveQuota(employeeId, {
          year: quotaYear,
          excludeLeaveId: id,
          db: tx,
        });
        if (!quota.eligible) {
          throw new Error(
            "Cuti tahunan hanya untuk karyawan dengan masa kerja minimal 1 tahun.",
          );
        }
        const requestedDays = await countLeaveWorkingDays(
          employeeId,
          startDate,
          endDate,
          tx,
        );
        if (requestedDays === 0) {
          throw new Error(
            "Rentang cuti tidak mengandung hari kerja (semua tanggal jatuh pada akhir pekan / hari libur).",
          );
        }
        if (quota.used + requestedDays > quota.entitled) {
          throw new Error(
            `Sisa jatah cuti tahunan ${quota.remaining} hari tidak cukup untuk ${requestedDays} hari yang diajukan ` +
              `(jatah ${quota.entitled} hari/tahun ${quotaYear}, sudah terpakai ${quota.used} hari).`,
          );
        }
      }

      return await tx.leaveRequest.update({
        where: { id },
        data: {
          employeeId,
          type: v.type,
          startDate,
          endDate,
          reason: v.reason ?? null,
        },
      });
    });

    await logActivity(
      "update",
      "LeaveRequest",
      leave.id,
      "Memperbarui pengajuan cuti",
    );
    revalidatePath("/sdm/cuti");
    return { success: true, id: leave.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateLeaveRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateOvertimeRequest(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_overtime_requests");
    const scope = await getHrScope(user);

    // Integrity guard: an approved/rejected overtime has a calculatedValue that
    // feeds payroll and an audit trail (approvedBy/approvedAt/rejectionReason).
    // Allowing edits would silently revert status to "pending" (see data block
    // below), let hours/date/employee be changed after approval, and reset
    // approval metadata without re-approval. Mirrors updateLeaveRequest's
    // pending-only guard.
    const existing = await prisma.overtimeRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, employeeId: true },
    });
    await assertHrEmployeeAccess(scope, existing.employeeId);
    if (existing.status !== "pending") {
      throw new Error(
        "Hanya pengajuan lembur berstatus menunggu yang dapat diedit",
      );
    }

    // Migrated to parseFormData(overtimeRequestSchema) — the previous hand-parsed
    // path (requireId/requireNumber/new Date(raw)) bypassed schema validation:
    // a blank date became Invalid Date, hours could be 0 or negative, and the
    // employeeId / projectId / hours / date / reason guards were not enforced.
    // Mirrors createOvertimeRequest for validation parity.
    const parsed = parseFormData(overtimeRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;
    await assertHrEmployeeAccess(scope, v.employeeId);

    const overtime = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM overtime_requests WHERE id = ${id} FOR UPDATE`;
      const current = await tx.overtimeRequest.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== "pending") {
        throw new Error("Hanya pengajuan lembur berstatus menunggu yang dapat diedit");
      }

      const changed = await tx.overtimeRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          employeeId: v.employeeId,
          projectId: v.projectId ?? null,
          date: new Date(v.date),
          hours: v.hours,
          totalHours: v.totalHours ?? null,
          mealHours: v.mealHours ?? null,
          billableHours: v.billableHours ?? null,
          reason: v.reason ?? null,
        },
      });
      if (changed.count === 0) {
        throw new Error("Pengajuan lembur sudah diproses atau status tidak valid");
      }
      return { id };
    });

    await logActivity(
      "update",
      "OvertimeRequest",
      overtime.id,
      "Memperbarui pengajuan lembur",
    );
    revalidatePath("/sdm/lembur");
    return { success: true, id: overtime.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateOvertimeRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateEmployeeLoan(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("create_loans");
    const scope = await getHrScope(user);

    const parsed = parseFormData(employeeLoanSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const totalAmount = v.totalAmount;
    const employeeId = v.employeeId;

    const existing = await prisma.employeeLoan.findUniqueOrThrow({
      where: { id },
      select: { totalAmount: true, remainingAmount: true, status: true, employeeId: true },
    });

    if (existing.status !== "pending") {
      throw new Error("Hanya pinjaman berstatus menunggu yang dapat diedit");
    }

    if (scope.kind === "self" && scope.employeeId !== existing.employeeId) {
      throw new Error("Anda hanya diperbolehkan mengedit pinjaman untuk diri sendiri");
    } else if (scope.kind === "department") {
      const existingEmployee = await prisma.employee.findUnique({
        where: { id: existing.employeeId },
        select: { departmentId: true }
      });
      if (!existingEmployee || existingEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengedit pinjaman untuk karyawan se-departemen");
      }
    }

    if (scope.kind === "self" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya diperbolehkan mengedit pinjaman untuk diri sendiri");
    } else if (scope.kind === "department") {
      const targetEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { departmentId: true }
      });
      if (!targetEmployee || targetEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengedit pinjaman untuk karyawan se-departemen");
      }
    }

    const loan = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employee_loans WHERE id = ${id} FOR UPDATE`;
      const current = await tx.employeeLoan.findUniqueOrThrow({
        where: { id },
        select: { totalAmount: true, remainingAmount: true, status: true },
      });
      if (current.status !== "pending") {
        throw new Error("Hanya pinjaman berstatus menunggu yang dapat diedit");
      }

      const oldTotal = Number(current.totalAmount);
      const oldRemaining = Number(current.remainingAmount);
      const delta = totalAmount - oldTotal;
      // Preserve the amount already repaid when the pending principal changes.
      const newRemaining = delta !== 0 ? Math.max(0, oldRemaining + delta) : oldRemaining;
      const changed = await tx.employeeLoan.updateMany({
        where: { id, status: "pending" },
        data: {
          employeeId: v.employeeId,
          loanDate: new Date(v.loanDate),
          totalAmount,
          monthlyInstallment: v.monthlyInstallment,
          remainingAmount: newRemaining,
          notes: v.notes ?? null,
        },
      });
      if (changed.count === 0) {
        throw new Error("Pinjaman sudah diproses atau status tidak valid");
      }
      return { id };
    });

    await logActivity(
      "update",
      "EmployeeLoan",
      loan.id,
      "Memperbarui pinjaman karyawan",
    );
    revalidatePath("/sdm/pinjaman");
    return { success: true, id: loan.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateEmployeeLoan]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateTimesheet(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("create_timesheets");
    const scope = await getHrScope(user);
    const existing = await prisma.timesheet.findUniqueOrThrow({
      where: { id },
      select: { employeeId: true },
    });
    await assertHrEmployeeAccess(scope, existing.employeeId);

    // Validation parity with createTimesheet: route the same Zod schema so the
    // edit path cannot be used to write values the create-guard rejects (e.g.
    // negative/zero hours, blank employees, 1000+ char descriptions). Without
    // this, a draft timesheet could be edited to hours = -5 and corrupt project
    // costing / billing. See: hrm-update-timesheet-negative regression test.
    const parsed = parseFormData(timesheetSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;
    await assertHrEmployeeAccess(scope, v.employeeId);

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data: {
        employeeId: v.employeeId,
        projectId: v.projectId,
        taskId: v.taskId ?? null,
        date: new Date(v.date),
        startTime: v.startTime ?? null,
        endTime: v.endTime ?? null,
        hours: v.hours,
        description: v.description ?? null,
      },
    });

    await logActivity(
      "update",
      "Timesheet",
      timesheet.id,
      "Memperbarui lembar waktu",
    );
    revalidatePath("/sdm/lembar-waktu");
    return { success: true, id: timesheet.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateTimesheet]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


// ==================== APPRECIATION ACTIONS ====================

export async function createAppreciation(formData: FormData) {
  try {
    await requirePermission("create_appreciations");

    const parsed = parseFormData(appreciationSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const appreciation = await prisma.appreciation.create({
      data: {
        employeeId: v.employeeId,
        date: new Date(v.date),
        type: v.type,
        amount: v.amount ?? 0,
        notes: v.notes ?? null,
      },
    });

    await logActivity(
      "create",
      "Appreciation",
      appreciation.id,
      "Membuat apresiasi",
    );
    revalidatePath("/sdm/apresiasi");
    return { success: true, id: appreciation.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAppreciation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAppreciation(formData: FormData) {
  try {
    await requirePermission("create_appreciations");

    // Validation parity with createAppreciation: route through Zod schema so
    // the edit path enforces required employee/date, non-negative amount, and
    // string-length caps — previously it read raw formData with no guards.
    const parsed = parseFormData(appreciationSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const id = v.id ?? requireId(formData.get("id"), "id");

    const appreciation = await prisma.appreciation.update({
      where: { id },
      data: {
        employeeId: v.employeeId,
        date: new Date(v.date),
        type: v.type,
        amount: v.amount ?? 0,
        notes: v.notes ?? null,
      },
    });

    await logActivity(
      "update",
      "Appreciation",
      appreciation.id,
      "Memperbarui apresiasi",
    );
    revalidatePath("/sdm/apresiasi");
    return { success: true, id: appreciation.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAppreciation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAppreciation(id: number) {
  try {
    await requirePermission("delete_appreciations");

    await prisma.appreciation.delete({ where: { id } });

    await logActivity("delete", "Appreciation", id, "Menghapus apresiasi");
    revalidatePath("/sdm/apresiasi");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAppreciation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
