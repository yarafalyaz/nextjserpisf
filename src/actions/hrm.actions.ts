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
  attendanceSchema,
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  workScheduleSchema,
  holidaySchema,
  departmentHolidaySchema,
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
import { syncNationalHolidays as syncNationalHolidaysService } from "@/lib/services/holiday-sync.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { onPayrollPaid } from "@/lib/hooks/accounting.hook";
import { getSystemSettings } from "@/lib/utils/settings";

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

async function resolveWorkSchedule(
  employeeId: number | null | undefined,
  departmentId: number | null | undefined,
  dayOfWeek: number,
) {
  const schedules = await prisma.workSchedule.findMany({
    where: { isActive: true },
    include: {
      employees: { select: { id: true } },
      departments: { select: { id: true } },
    },
  });
  const onDay = schedules.filter((s) =>
    s.workDays
      .split(",")
      .map((d) => Number(d.trim()))
      .includes(dayOfWeek),
  );
  return (
    onDay.find(
      (s) => employeeId != null && s.employees.some((e) => e.id === employeeId),
    ) ??
    onDay.find(
      (s) =>
        s.employees.length === 0 &&
        departmentId != null &&
        s.departments.some((d) => d.id === departmentId),
    ) ??
    onDay.find((s) => s.employees.length === 0 && s.departments.length === 0) ??
    null
  );
}

// ==================== ATTENDANCE ACTIONS ====================

export async function checkIn(
  employeeId: number,
  latitude?: number,
  longitude?: number,
) {
  await requirePermission("create_attendance");

  try {
    const now = new Date();
    const wibNow = getWibNow(now);
    const today = getWibDateOnly(now);

    // Check if already checked in today
    const existing = await prisma.attendance.findFirst({
      where: { employeeId, date: today },
    });
    if (existing) {
      throw new Error("Sudah check-in hari ini");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });
    if (!employee) throw new Error("Karyawan tidak ditemukan");

    // Hari libur (Minggu / libur nasional / libur departemen) → kerja dicatat
    // sebagai lembur dan otomatis jadi pengajuan lembur saat check-out.
    const dayOfWeek = wibNow.getUTCDay();
    const holiday = await prisma.holiday.findFirst({ where: { date: today } });
    const deptHoliday = await prisma.departmentHoliday.findFirst({
      where: { departmentId: employee.departmentId ?? undefined, date: today },
    });
    const isOvertimeDay = dayOfWeek === 0 || !!holiday || !!deptHoliday;

    // Guard: approved leave check
    const approvedLeave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: "approved",
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });
    if (approvedLeave) {
      throw new Error("Anda sedang dalam masa cuti. Tidak dapat check-in.");
    }

    // Atomic create — if two requests race past the findFirst above, the second
    // hits the @@unique([employeeId, date]) constraint and gets P2002; translate
    // it to the same friendly message so both callers get a clean error.

    const schedule = await resolveWorkSchedule(
      employeeId,
      employee.departmentId,
      dayOfWeek,
    );
    const startTime = schedule?.startTime ?? "08:00";
    const tolerance = schedule?.lateToleranceMinutes ?? 0;
    const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes();
    const startMinutes = toMinutes(startTime);
    const deadlineMinutes = startMinutes + tolerance;
    const isLate = !isOvertimeDay && nowMinutes > deadlineMinutes;
    const lateMinutes = isLate ? nowMinutes - deadlineMinutes : 0;

    const attendance = await prisma.attendance.create({
      data: {
        employeeId,
        date: today,
        checkIn: now,
        status: isOvertimeDay ? "overtime" : isLate ? "late" : "present",
        lateMinutes,
        checkInLatitude: latitude ?? null,
        checkInLongitude: longitude ?? null,
      },
    });

    await logActivity(
      "checkin",
      "Attendance",
      attendance.id,
      "Check-in absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true, id: attendance.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    // Atomic create race: if two requests slip past the findFirst above, the
    // second hits @@unique([employeeId, date]) → P2002. Surface the same friendly
    // message as the pre-check, but as a structured error (not a throw) so the
    // caller gets a consistent { success, error } shape.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "Sudah check-in hari ini" };
    }
    console.error("[checkIn]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function checkOut(
  employeeId: number,
  latitude?: number,
  longitude?: number,
) {
  try {
    await requirePermission("edit_attendance");

    const now = new Date();
    const wibNow = getWibNow(now);

    // Find the most recent open attendance for this employee regardless of date
    // (handles overnight shifts that cross midnight).
    const attendance = await prisma.attendance.findFirst({
      where: { employeeId, checkOut: null },
      orderBy: { date: "desc" },
    });
    if (!attendance) {
      throw new Error("Belum check-in atau sudah check-out");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });
    const dayOfWeek = wibNow.getUTCDay();
    const schedule = await resolveWorkSchedule(
      employeeId,
      employee?.departmentId,
      dayOfWeek,
    );
    const endTime = schedule?.endTime ?? "17:00";
    const endMinutes = toMinutes(endTime);
    const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes();
    const isOvertimeDay = attendance.status === "overtime";
    const isHalfDay = !isOvertimeDay && nowMinutes < endMinutes;

    // Jam kerja di hari libur → otomatis jadi pengajuan lembur (menunggu persetujuan).
    let overtimeMinutes: number | null = null;
    let overtimeHours = 0;
    if (isOvertimeDay && attendance.checkIn) {
      const grossMinutes = Math.max(
        0,
        Math.round((now.getTime() - attendance.checkIn.getTime()) / 60000),
      );
      // Potong jam istirahat (ISOMA) yang beririsan dengan jam kerja.
      const settings = await getSystemSettings();
      const inWib = getWibNow(attendance.checkIn);
      const inMin = inWib.getUTCHours() * 60 + inWib.getUTCMinutes();
      const overlap = breakOverlapMinutes(
        inMin,
        nowMinutes,
        settings.restBreakStart,
        settings.restBreakEnd,
      );
      overtimeMinutes = Math.max(0, grossMinutes - overlap);
      overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
    }

    // Atomically claim the check-out: only the request that flips checkOut from
    // null wins. Serializes concurrent double check-outs so the overtime request
    // below is created at most once (mirrors selfCheckOut).
    const claim = await prisma.attendance.updateMany({
      where: { id: attendance.id, checkOut: null },
      data: {
        checkOut: now,
        checkOutLatitude: latitude ?? null,
        checkOutLongitude: longitude ?? null,
        overtimeMinutes: overtimeMinutes ?? attendance.overtimeMinutes,
        status: isHalfDay ? "half_day" : attendance.status,
      },
    });
    if (claim.count === 0) {
      throw new Error("Sudah check-out");
    }

    // Only the winner of the claim reaches here → overtime created exactly once.
    if (isOvertimeDay && overtimeHours > 0) {
      await prisma.overtimeRequest.create({
        data: {
          employeeId,
          date: attendance.date,
          hours: overtimeHours,
          totalHours: overtimeHours,
          reason: "Otomatis dari absensi hari libur",
          status: "pending",
        },
      });
    }

    await logActivity(
      "checkout",
      "Attendance",
      attendance.id,
      "Check-out absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[checkOut]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createAttendance(formData: FormData) {
  try {
    await requirePermission("create_attendance");

    const parsed = parseFormData(attendanceSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const attendance = await prisma.attendance.create({
      data: {
        employeeId: v.employeeId,
        date: new Date(v.date),
        checkIn: v.checkIn ? new Date(v.checkIn) : null,
        checkOut: v.checkOut ? new Date(v.checkOut) : null,
        status: v.status,
        checkInLatitude: v.checkInLatitude ?? null,
        checkInLongitude: v.checkInLongitude ?? null,
        checkOutLatitude: v.checkOutLatitude ?? null,
        checkOutLongitude: v.checkOutLongitude ?? null,
        overtimeMinutes: v.overtimeMinutes ?? null,
        overtimeApproved: v.overtimeApproved ?? false,
      },
    });

    await logActivity("create", "Attendance", attendance.id, "Membuat absensi");
    revalidatePath("/sdm/absensi");
    return { success: true, id: attendance.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAttendance]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAttendance(id: number, formData: FormData) {
  try {
    await requirePermission("edit_attendance");

    // Validation parity with createAttendance: route through the same Zod schema
    // so blank employeeId, empty date, malformed coordinates, or an arbitrary
    // status string are rejected on the edit path, not just on create. The
    // previous hand-parsed formData left these holes open.
    const parsed = parseFormData(attendanceSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const attendance = await prisma.attendance.update({
      where: { id },
      data: {
        employeeId: v.employeeId,
        date: new Date(v.date),
        checkIn: v.checkIn ? new Date(v.checkIn) : null,
        checkOut: v.checkOut ? new Date(v.checkOut) : null,
        status: v.status,
        checkInLatitude: v.checkInLatitude ?? null,
        checkInLongitude: v.checkInLongitude ?? null,
        checkOutLatitude: v.checkOutLatitude ?? null,
        checkOutLongitude: v.checkOutLongitude ?? null,
        overtimeMinutes: v.overtimeMinutes ?? null,
        overtimeApproved: v.overtimeApproved ?? false,
      },
    });

    await logActivity(
      "update",
      "Attendance",
      attendance.id,
      "Memperbarui absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true, id: attendance.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAttendance]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== LEAVE REQUEST ACTIONS ====================

export async function createLeaveRequest(formData: FormData) {
  try {
    await requirePermission("create_leave_requests");

    const parsed = parseFormData(leaveRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId;
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
    // the check (TOCTOU) and create duplicate pending leaves — the schedule
    // becomes ambiguous when one is approved and the other is blocked.
    const leave = await prisma.$transaction(async (tx) => {
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

      return await tx.leaveRequest.create({
        data: {
          employeeId,
          type: v.type,
          startDate,
          endDate,
          reason: v.reason ?? null,
          status: "pending",
        },
      });
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

    const leave = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: leaveId },
    });

    if (leave.status !== "pending") {
      throw new Error(
        "Leave request hanya bisa di-approve dari status pending",
      );
    }

    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: "approved", approvedBy: Number(user.id) },
    });

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

    const leave = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: leaveId },
      select: { status: true },
    });
    if (leave.status !== "pending") {
      throw new Error(
        "Hanya pengajuan cuti berstatus menunggu yang dapat ditolak",
      );
    }

    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: "rejected",
        approvedBy: Number(user.id),
        rejectionReason: reason,
      },
    });

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
    await requirePermission("create_overtime_requests");

    const parsed = parseFormData(overtimeRequestSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const overtime = await prisma.overtimeRequest.create({
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

    await prisma.overtimeRequest.update({
      where: { id: overtimeId },
      data: {
        status: "approved",
        approvedBy: Number(user.id),
        calculatedValue,
      },
    });

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

async function computePayrollEstimation(
  employeeId: number,
  startDateStr: string,
  endDateStr: string,
  sessionUser: PayrollSessionUser,
): Promise<PayrollEstimationResult> {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  // IDOR guard — scoped user sessions (non-admin) can only view their own
  // payroll estimation. Super-admin and HR admin retain full access for
  // organisational reporting purposes.
  const isAdmin =
    sessionUser.roles.includes("super_admin") ||
    sessionUser.roles.includes("hr_admin");
  if (!isAdmin) {
    const employee = await prisma.employee.findFirst({
      where: { userId: Number(sessionUser.id) },
      select: { id: true },
    });
    if (!employee || employee.id !== Number(employeeId)) {
      throw new Error("Anda hanya bisa melihat estimasi gaji Anda sendiri");
    }
  }

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
    return await computePayrollEstimation(
      employeeId,
      startDateStr,
      endDateStr,
      sessionUser,
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
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const evalEnd = rangeEnd < today ? rangeEnd : today;

  // Fan-out: fetch EVERYTHING the per-employee estimator needs, once.
  // Replaces 5×N round-trips with 9.
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
      select: {
        employeeId: true,
        date: true,
        checkIn: true,
        lateMinutes: true,
      },
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

  const rawPerMinute = Number(settings.latePenaltyPerMinute);
  const penaltyPerMinute =
    Number.isFinite(rawPerMinute) && rawPerMinute > 0 ? rawPerMinute : 0;
  const rawMax = Number(settings.maxLatePenaltyMinutes);
  const maxMinutes = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;

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
  for (const at of attendances) {
    const arr = attendanceMap.get(at.employeeId) ?? [];
    arr.push(at);
    attendanceMap.set(at.employeeId, arr);
  }
  const leaveMap = new Map<number, typeof leaves>();
  for (const lv of leaves) {
    const arr = leaveMap.get(lv.employeeId) ?? [];
    arr.push(lv);
    leaveMap.set(lv.employeeId, arr);
  }

  const publicHolidaySet = new Set(
    holidays.map((h) => dateKey(new Date(h.date))),
  );
  const deptHolidaySet = new Map<number, Set<string>>();
  for (const dh of departmentHolidays) {
    if (dh.departmentId == null) continue;
    const set = deptHolidaySet.get(dh.departmentId) ?? new Set<string>();
    set.add(dateKey(new Date(dh.date)));
    deptHolidaySet.set(dh.departmentId, set);
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

    // 4. Late penalty (mirrors calculateLatePenalty, in-memory).
    const empAttendances = attendanceMap.get(employee.id) ?? [];
    let totalLateMinutes = 0;
    let totalPenalty = 0;
    for (const attendance of empAttendances) {
      let lateMinutes = Number(attendance.lateMinutes ?? 0);
      if (lateMinutes <= 0) continue;
      if (maxMinutes !== null && lateMinutes > maxMinutes)
        lateMinutes = maxMinutes;
      totalLateMinutes += lateMinutes;
      totalPenalty += lateMinutes * penaltyPerMinute;
    }

    // 5. Attendance summary (mirrors calculateAttendanceSummary, in-memory).
    const employeeSchedule = workSchedules.find((s) =>
      s.employees.some((e) => e.id === employee.id),
    );
    const deptSchedule = workSchedules.find(
      (s) =>
        s.employees.length === 0 &&
        employee.departmentId != null &&
        s.departments.some((d) => d.id === employee.departmentId),
    );
    const globalSchedule = workSchedules.find(
      (s) => s.employees.length === 0 && s.departments.length === 0,
    );
    const relevantSchedule = employeeSchedule ?? deptSchedule ?? globalSchedule;
    const workingWeekdays = new Set(
      (relevantSchedule?.workDays || "")
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d !== "")
        .map((d) => Number(d))
        .filter((n) => !Number.isNaN(n)),
    );

    let totalWorkingDays = 0;
    let workingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;
    let absentDays = 0;
    let dailyRate = 0;
    let absentDeduction = 0;

    if (workingWeekdays.size > 0) {
      const presentSet = new Set(
        empAttendances
          .filter((a) => a.checkIn != null)
          .map((a) => dateKey(new Date(a.date))),
      );
      const empLeaves = leaveMap.get(employee.id) ?? [];
      const leaveSet = new Set<string>();
      for (const lv of empLeaves) {
        const s = new Date(lv.startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(lv.endDate);
        e.setHours(0, 0, 0, 0);
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          leaveSet.add(dateKey(d));
        }
      }
      const empDeptHolidays =
        employee.departmentId != null
          ? (deptHolidaySet.get(employee.departmentId) ?? new Set<string>())
          : new Set<string>();

      for (
        let d = new Date(rangeStart);
        d <= rangeEnd;
        d.setDate(d.getDate() + 1)
      ) {
        if (!workingWeekdays.has(d.getDay())) continue;
        const key = dateKey(d);
        if (publicHolidaySet.has(key) || empDeptHolidays.has(key)) {
          if (d <= evalEnd) holidayDays++;
          continue;
        }
        totalWorkingDays++;
        if (d > evalEnd) continue;
        workingDays++;
        if (presentSet.has(key)) presentDays++;
        else if (leaveSet.has(key)) leaveDays++;
        else absentDays++;
      }
      dailyRate = totalWorkingDays > 0 ? baseSalary / totalWorkingDays : 0;
      absentDeduction = Math.round(absentDays * dailyRate);
    }

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
      lateDeduction: totalPenalty,
      lateMinutes: totalLateMinutes,
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
  await requirePermission("view_payroll");
  return computeBulkPayrollEstimations(employeeIds, startDateStr, endDateStr);
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

    const payroll = await prisma.payroll.create({
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

    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
    });

    if (payroll.status !== "draft") {
      throw new Error("Payroll hanya bisa di-approve dari status draft");
    }

    await prisma.payroll.update({
      where: { id: payrollId },
      data: { status: "approved", approvedBy: Number(user.id) },
    });

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
    await requirePermission("create_loans");

    const parsed = parseFormData(employeeLoanSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const totalAmount = v.totalAmount;

    const loan = await prisma.employeeLoan.create({
      data: {
        employeeId: v.employeeId,
        loanDate: new Date(v.loanDate),
        totalAmount,
        monthlyInstallment: v.monthlyInstallment,
        remainingAmount: totalAmount,
        status: "active",
        notes: v.notes ?? null,
      },
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
    await requirePermission("create_timesheets");

    const parsed = parseFormData(timesheetSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

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

// ==================== WORK SCHEDULE ACTIONS ====================

export async function createWorkSchedule(formData: FormData) {
  try {
    await requirePermission("create_work_schedules");

    const parsed = parseFormData(workScheduleSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const name = v.name;
    const days = formData.getAll("days") as string[];
    const startTime = v.startTime;
    const endTime = v.endTime;
    const departmentIds = (formData.getAll("departmentId") as string[])
      .map((d) => safeNumber(d))
      .filter((n): n is number => n != null);
    const employeeIds = (formData.getAll("employeeId") as string[])
      .map((d) => safeNumber(d))
      .filter((n): n is number => n != null);
    const lateToleranceMinutes = v.lateToleranceMinutes ?? 0;
    const isActive = v.isActive ?? false;

    await prisma.workSchedule.create({
      data: {
        name,
        workDays: days.join(","),
        startTime,
        endTime,
        lateToleranceMinutes,
        isActive,
        departments:
          departmentIds.length > 0
            ? { connect: departmentIds.map((id) => ({ id })) }
            : undefined,
        employees:
          employeeIds.length > 0
            ? { connect: employeeIds.map((id) => ({ id })) }
            : undefined,
      },
    });

    await logActivity("create", "WorkSchedule", 0, "Membuat jadwal kerja");
    revalidatePath("/sdm/jadwal-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createWorkSchedule]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== HOLIDAY ACTIONS ====================

export async function createHoliday(formData: FormData) {
  try {
    await requirePermission("create_holidays");

    const parsed = parseFormData(holidaySchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const holiday = await prisma.holiday.create({
      data: {
        name: v.name,
        date: new Date(v.date),
        description: v.description ?? null,
        isNationalHoliday: v.isNationalHoliday ?? true,
      },
    });

    await logActivity("create", "Holiday", holiday.id, "Membuat hari libur");
    revalidatePath("/sdm/hari-libur");
    return { success: true, id: holiday.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createHoliday]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateHoliday(id: number, formData: FormData) {
  try {
    await requirePermission("edit_holidays");

    // Validation parity with createHoliday: route through Zod schema so blank
    // names / missing dates / 500+ char descriptions are rejected on the edit
    // path, not just on create. Without this, the form layer can store
    // unvalidated holiday rows.
    const parsed = parseFormData(holidaySchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    await prisma.holiday.update({
      where: { id },
      data: {
        name: v.name,
        date: new Date(v.date),
        description: v.description ?? null,
        isNationalHoliday: v.isNationalHoliday ?? true,
      },
    });

    await logActivity("update", "Holiday", id, "Memperbarui hari libur");
    revalidatePath("/sdm/hari-libur");
    return { success: true, id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateHoliday]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  try {
    await requirePermission("delete_leave_requests");

    // Guard: cannot delete approved leave — it bypasses the approval workflow
    const leave = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (leave.status === "approved") {
      return {
        success: false,
        error:
          "Tidak bisa menghapus cuti yang sudah disetujui. Tolak terlebih dahulu.",
      };
    }

    await prisma.leaveRequest.delete({ where: { id } });

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
    await requirePermission("view_leave_requests");
    if (!employeeId || Number.isNaN(employeeId)) {
      return { success: false as const, error: "Karyawan tidak valid" };
    }
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
 * Annual-leave balance for every active employee (used by the leave-balance
 * dashboard). One getLeaveQuota call per employee — fine for typical SME
 * headcounts; revisit with a batched query if the roster grows large.
 */
export async function getAllLeaveBalances(year?: number) {
  try {
    await requirePermission("view_leave_requests");
    const targetYear = year ?? new Date().getFullYear();

    const employees = await prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
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
    await requirePermission("delete_overtime_requests");

    await prisma.overtimeRequest.delete({ where: { id } });

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
    await requirePermission("delete_timesheets");

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
    await requirePermission("delete_loans");

    await prisma.employeeLoan.delete({ where: { id } });

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

export async function deleteWorkSchedule(id: number) {
  try {
    await requirePermission("delete_work_schedules");

    await prisma.workSchedule.delete({ where: { id } });

    await logActivity("delete", "WorkSchedule", id, "Menghapus jadwal kerja");
    revalidatePath("/sdm/jadwal-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteWorkSchedule]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteHoliday(id: number) {
  try {
    await requirePermission("delete_holidays");

    await prisma.holiday.delete({ where: { id } });

    await logActivity("delete", "Holiday", id, "Menghapus hari libur");
    revalidatePath("/sdm/hari-libur");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteHoliday]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Sync Indonesian national holidays for a given year from a public calendar API.
 * Idempotent — safe to run repeatedly.
 */
export async function syncNationalHolidays(year?: number) {
  try {
    await requirePermission("create_holidays");
    const targetYear = year && year > 2000 ? year : new Date().getFullYear();
    const result = await syncNationalHolidaysService(targetYear);
    await logActivity(
      "sync",
      "Holiday",
      0,
      `Sinkronisasi libur nasional tahun ${targetYear}`,
    );
    revalidatePath("/sdm/hari-libur");
    return { success: true, ...result };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[syncNationalHolidays]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal sinkronisasi libur nasional"),
    };
  }
}

export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_leave_requests");

    // Only pending requests can be edited. Approved/rejected leave must not be re-opened.
    const existing = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (existing.status !== "pending") {
      throw new Error(
        "Hanya pengajuan cuti berstatus menunggu yang dapat diedit",
      );
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
    const startDate = new Date(v.startDate);
    const endDate = new Date(v.endDate);

    if (startDate > endDate) {
      throw new Error("Tanggal mulai tidak boleh melebihi tanggal selesai");
    }

    // Overlap check + quota gate + update run in one $transaction (mirrors
    // createLeaveRequest) so the reads backing the guards and the write are
    // atomic. The quota check excludes THIS request's id so its own existing
    // days are not double-counted against the balance when editing.
    const leave = await prisma.$transaction(async (tx) => {
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
    await requirePermission("edit_overtime_requests");

    // Integrity guard: an approved/rejected overtime has a calculatedValue that
    // feeds payroll and an audit trail (approvedBy/approvedAt/rejectionReason).
    // Allowing edits would silently revert status to "pending" (see data block
    // below), let hours/date/employee be changed after approval, and reset
    // approval metadata without re-approval. Mirrors updateLeaveRequest's
    // pending-only guard.
    const existing = await prisma.overtimeRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
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

    const overtime = await prisma.overtimeRequest.update({
      where: { id },
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
    await requirePermission("create_loans");

    // Migrated to parseFormData(employeeLoanSchema) — the previous hand-parsed
    // path (requireNumber / new Date(raw) / requireId) bypassed schema
    // validation: negative amounts could reach the DB, blank loanDates crashed
    // new Date() into Invalid Date, and the loanDate / totalAmount / installment
    // required guards were not enforced. Mirrors createEmployeeLoan for
    // validation parity.
    const parsed = parseFormData(employeeLoanSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const totalAmount = v.totalAmount;

    // Only adjust remainingAmount if totalAmount was actually changed. This prevents
    // wiping amortization progress when editing other fields (notes, installment).
    // Status is NOT accepted from client — it's managed only by markPayrollPaid.
    const existing = await prisma.employeeLoan.findUniqueOrThrow({
      where: { id },
      select: { totalAmount: true, remainingAmount: true, status: true },
    });
    // Integrity guard: a paid_off loan is a completed financial record (all
    // installments already deducted from payroll runs). Allowing edits would
    // silently mutate totalAmount/remainingAmount/instalment without restarting
    // the amortization cycle, and could resurrect amortization on a settled loan
    // by shifting remainingAmount back above 0 while keeping status='paid_off'
    // (markPayrollPaid only touches 'active' loans, so the resurrected balance
    // would never be deducted). Mirrors updateLeaveRequest / updateOvertimeRequest
    // (both reject edits on non-pending statuses).
    if (existing.status !== "active") {
      throw new Error("Hanya pinjaman berstatus aktif yang dapat diedit");
    }
    const oldTotal = Number(existing.totalAmount);
    const oldRemaining = Number(existing.remainingAmount);
    const delta = totalAmount - oldTotal;
    // If totalAmount changed, shift remaining by the same delta (can't go below 0).
    const newRemaining =
      delta !== 0 ? Math.max(0, oldRemaining + delta) : oldRemaining;

    const loan = await prisma.employeeLoan.update({
      where: { id },
      data: {
        employeeId: v.employeeId,
        loanDate: new Date(v.loanDate),
        totalAmount,
        monthlyInstallment: v.monthlyInstallment,
        remainingAmount: newRemaining,
        // Status stays unchanged (managed by markPayrollPaid / system only).
        notes: v.notes ?? null,
      },
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
    await requirePermission("create_timesheets");

    // Validation parity with createTimesheet: route the same Zod schema so the
    // edit path cannot be used to write values the create-guard rejects (e.g.
    // negative/zero hours, blank employees, 1000+ char descriptions). Without
    // this, a draft timesheet could be edited to hours = -5 and corrupt project
    // costing / billing. See: hrm-update-timesheet-negative regression test.
    const parsed = parseFormData(timesheetSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

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

export async function updateWorkSchedule(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("create_work_schedules");

    // Validation parity with createWorkSchedule: route through Zod schema.
    // The edit path bypassed this, allowing blank names or malformed times
    // that crashed downstream payroll scheduling and formatting logic.
    const parsed = parseFormData(workScheduleSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const name = v.name;
    const days = formData.getAll("days") as string[];
    const startTime = v.startTime;
    const endTime = v.endTime;
    const departmentIds = (formData.getAll("departmentId") as string[])
      .map((d) => safeNumber(d))
      .filter((n): n is number => n != null);
    const employeeIds = (formData.getAll("employeeId") as string[])
      .map((d) => safeNumber(d))
      .filter((n): n is number => n != null);
    const lateToleranceMinutes = v.lateToleranceMinutes ?? 0;
    const isActive = v.isActive ?? false;

    await prisma.workSchedule.update({
      where: { id },
      data: {
        name,
        workDays: days.join(","),
        startTime,
        endTime,
        lateToleranceMinutes,
        isActive,
        departments: { set: departmentIds.map((did) => ({ id: did })) },
        employees: { set: employeeIds.map((eid) => ({ id: eid })) },
      },
    });

    await logActivity("update", "WorkSchedule", id, "Memperbarui jadwal kerja");
    revalidatePath("/sdm/jadwal-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateWorkSchedule]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DEPARTMENT HOLIDAY ACTIONS ====================

export async function createDepartmentHoliday(formData: FormData) {
  try {
    await requirePermission("create_holidays");

    const parsed = parseFormData(departmentHolidaySchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const holiday = await prisma.departmentHoliday.create({
      data: {
        departmentId: v.departmentId,
        name: v.name,
        date: new Date(v.date),
        isRecurring: v.isRecurring ?? false,
      },
    });

    await logActivity(
      "create",
      "DepartmentHoliday",
      holiday.id,
      "Membuat hari libur departemen",
    );
    revalidatePath("/sdm/hari-libur-departemen");
    return { success: true, id: holiday.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createDepartmentHoliday]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateDepartmentHoliday(formData: FormData) {
  try {
    await requirePermission("create_holidays");

    // Validation parity with createDepartmentHoliday: route through Zod schema.
    // The edit path was reading raw formData values with no length / required /
    // type guards, allowing blank names, missing dates, or non-numeric
    // departmentId values to be persisted.
    const parsed = parseFormData(departmentHolidaySchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const id = v.id ?? requireId(formData.get("id"), "id");

    const holiday = await prisma.departmentHoliday.update({
      where: { id },
      data: {
        departmentId: v.departmentId,
        name: v.name,
        date: new Date(v.date),
        isRecurring: v.isRecurring ?? false,
      },
    });

    await logActivity(
      "update",
      "DepartmentHoliday",
      holiday.id,
      "Memperbarui hari libur departemen",
    );
    revalidatePath("/sdm/hari-libur-departemen");
    return { success: true, id: holiday.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateDepartmentHoliday]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteDepartmentHoliday(id: number) {
  try {
    await requirePermission("delete_holidays");

    await prisma.departmentHoliday.delete({ where: { id } });

    await logActivity(
      "delete",
      "DepartmentHoliday",
      id,
      "Menghapus hari libur departemen",
    );
    revalidatePath("/sdm/hari-libur-departemen");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteDepartmentHoliday]", getErrorMessage(e) || e);
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
