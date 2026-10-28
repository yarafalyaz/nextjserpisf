"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { safeAdd, safeRound, safeSubtract, safeSum } from "@/lib/utils/math";
import {
  computeBpjsEmployee,
  computePph21FinalPeriod,
  computePph21Monthly,
  computePph21Ter,
  getStatutoryParams,
  getTerBrackets,
  payrollStatutoryGateError,
  resolveTerPeriod,
  statusCodeDependents,
  terCategoryFor,
  type StatutoryParams,
  type TerBracket,
} from "@/lib/services/payroll-statutory.service";
import { prisma } from "@/lib/db/prisma";
import {
  approvePkwtCompensationEvent,
  buildPkwtPayrollLineData,
  createPkwtCompensationEvent,
  markPkwtEventPaid,
  runPkwtMonthlyAccrual,
} from "@/lib/services/pkwt-compensation.service";
import { applyDueSalaryAdjustments } from "@/lib/services/salary-adjustment.service";
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import {
  generateDocumentNumber,
  generateDocumentNumberBatch,
} from "@/lib/utils/document-number";
import { revalidatePath } from "next/cache";
import { requireId } from "@/lib/utils/safe-parse";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { nextSlug } from "@/lib/utils/slug-db";
import { parseFormData } from "@/lib/validations/parse-form";
import { dateOnly } from "@/lib/validations/finance.schemas";
import {
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  appreciationSchema,
  payrollSchema,
  holidaySchema,
  departmentHolidaySchema,
  workScheduleSchema,
  attendanceSchema,
  attendanceCorrectionSchema,
  statutoryRuleSchema,
} from "@/lib/validations/hrm.schemas";
import {
  computeLateMinutes,
  computeOvertimeMinutes,
  wibDateToUtcMidnight,
  wibMinutesOfDay,
  wibTimeToUtcInstant,
} from "@/lib/utils/attendance-time";
import { calculateLatePenalty } from "@/lib/services/late-penalty.service";
import { calculateAttendanceSummary } from "@/lib/services/attendance-summary.service";
import {
  getLeaveQuota,
  countLeaveWorkingDays,
  QUOTA_LEAVE_TYPES,
  SPECIAL_LEAVE_DAY_CAPS,
  resolveDayKind,
} from "@/lib/services/leave-quota.service";
import {
  assertOvertimeWithinWorkdayLimits,
  computeOvertimePay,
  type OvertimeDayKind,
} from "@/lib/services/overtime-pay.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { onPayrollPaid, deleteJournalByReferenceTx, reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook";
import { getSystemSettings } from "@/lib/utils/settings";
import { assertHrEmployeeAccess, getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope";
import type { HrScope } from "@/lib/auth/hr-scope";
import { evaluatePayrollEmploymentGate } from "@/lib/reports/employee-lifecycle";
import {
  assertPayrollPeriodMatchesEndDate,
  classifyPayrollRunPopulation,
  countPayrollRunSkips,
  findPayrollRangeConflict,
  isPayrollFrequency,
  type PayrollFrequency,
  type PayrollRunSkip,
} from "@/lib/reports/payroll-frequency";
import {
  allocateBpjsForPeriod,
  buildBpjsAggregateSnapshot,
  capLoanDeductionForFrequency,
  evaluateDeductionCeiling,
  hasActiveLoanWithoutWeeklyInstallment,
  readBpjsAggregateSnapshot,
  sumLoanDeductionForFrequency,
  type BpjsAggregateSnapshot,
  type BpjsPeriodSlip,
} from "@/lib/reports/payroll-weekly";
import { loadEmployeeLifecycleAttention } from "@/lib/reports/employee-lifecycle-data";
import { loadLeaveBalanceReport } from "@/lib/reports/leave-balance-data";
import { buildLeaveBalanceCsv } from "@/lib/reports/leave-balance";
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service";
import {
  ATTENDANCE_CORRECTION_CONFLICT_MESSAGE,
  ATTENDANCE_CORRECTION_FINAL_PAYROLL_MESSAGE,
  ATTENDANCE_CORRECTION_WINDOW_MESSAGE,
  attendanceCorrectionHasConflict,
  isWithinAttendanceCorrectionWindow,
} from "@/lib/reports/attendance-correction";
import { endOfUtcDayExclusive } from "@/lib/utils/date-only";
import { closedWorkOrderError, timesheetContextError } from "@/lib/services/timesheet-context";

function timesheetWriteData(v: {
  employeeId: number;
  projectId?: number | null;
  workOrderId?: number | null;
  taskId?: number | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  hours: number;
  description?: string | null;
}) {
  return {
    employeeId: v.employeeId,
    projectId: v.projectId ?? null,
    workOrderId: v.workOrderId ?? null,
    taskId: v.taskId ?? null,
    date: wibDateToUtcMidnight(v.date),
    startTime: v.startTime ?? null,
    endTime: v.endTime ?? null,
    hours: v.hours,
    description: v.description ?? null,
  };
}

function appreciationWriteData(v: {
  employeeId: number;
  date: string;
  type: string;
  amount?: number | null;
  notes?: string | null;
}) {
  return {
    employeeId: v.employeeId,
    date: wibDateToUtcMidnight(v.date),
    type: v.type,
    amount: v.amount ?? 0,
    notes: v.notes ?? null,
  };
}

// ==================== F-2026-10-21-027 PAYROLL COMPONENTS ====================
// Mode pajak aman "all-taxable-v1": isTaxable tersimpan sebagai snapshot,
// belum mengubah basis PPh21 — semua earning tetap kena pajak seperti
// pra-fitur sampai vonis basis pajak (BR-027-07) turun.

type PayrollComponentLineData = {
  componentId: number | null;
  componentNameSnapshot: string;
  kindSnapshot: string;
  recurrenceSnapshot: string;
  isTaxableSnapshot: boolean;
  source: string;
  assignmentId: number | null;
  accountIdSnapshot: number | null;
  amount: number;
};

type PayrollAssignmentRow = {
  id: number;
  componentId: number;
  defaultAmount: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  component: {
    name: string;
    kind: string;
    recurrence: string;
    isTaxable: boolean;
    accountId: number | null;
  };
};

function summarizePayrollComponentLines(
  lines: readonly { kindSnapshot: string; amount: unknown }[],
): { allowances: number; deductions: number; earningTotal: number; deductionTotal: number } {
  let allowances = 0;
  let deductions = 0;
  for (const line of lines) {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Nominal baris komponen gaji tidak valid");
    }
    if (line.kindSnapshot === "earning") allowances = safeAdd(allowances, amount, 0);
    else if (line.kindSnapshot === "deduction") deductions = safeAdd(deductions, amount, 0);
    else throw new Error("Jenis baris komponen gaji tidak valid");
  }
  return { allowances, deductions, earningTotal: allowances, deductionTotal: deductions };
}

function buildPayrollComponentLinesFromAssignments(
  assignments: readonly PayrollAssignmentRow[],
  endDate: Date,
): PayrollComponentLineData[] {
  const seen = new Set<number>();
  const lines: PayrollComponentLineData[] = [];
  const sorted = [...assignments].sort((a, b) => a.componentId - b.componentId);
  for (const a of sorted) {
    if (a.effectiveFrom > endDate) continue;
    if (a.effectiveTo != null && a.effectiveTo < endDate) continue;
    const amount = Number(a.defaultAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Nominal penugasan komponen gaji tidak valid");
    }
    if (amount === 0) continue;
    if (seen.has(a.componentId)) {
      throw new Error("Penugasan komponen gaji ganda untuk komponen yang sama");
    }
    seen.add(a.componentId);
    lines.push({
      componentId: a.componentId,
      componentNameSnapshot: a.component.name,
      kindSnapshot: a.component.kind,
      recurrenceSnapshot: a.component.recurrence,
      isTaxableSnapshot: a.component.isTaxable,
      source: "fixed_assignment",
      assignmentId: a.id,
      accountIdSnapshot: a.component.accountId ?? null,
      amount,
    });
  }
  return lines;
}

function payrollComponentsSnapshotValue(
  lines: readonly { kindSnapshot: string; amount: unknown }[],
  grossSalary: number,
): Record<string, unknown> {
  const s = summarizePayrollComponentLines(lines);
  return {
    mode: "all-taxable-v1",
    taxableGross: grossSalary,
    nonTaxableEarningTotal: 0,
    earningTotal: s.earningTotal,
    deductionTotal: s.deductionTotal,
    lineCount: lines.length,
  };
}

async function loadEffectivePayrollAssignments(
  db: Pick<typeof prisma, "employeePayrollComponent">,
  employeeIds: number[],
  endDate: Date,
): Promise<Map<number, PayrollAssignmentRow[]>> {
  const map = new Map<number, PayrollAssignmentRow[]>();
  if (employeeIds.length === 0) return map;
  const rows = await db.employeePayrollComponent.findMany({
    where: {
      employeeId: { in: employeeIds },
      isActive: true,
      effectiveFrom: { lte: endDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: endDate } }],
      component: { isActive: true, recurrence: "fixed" },
    },
    include: {
      component: {
        select: { name: true, kind: true, recurrence: true, isTaxable: true, accountId: true },
      },
    },
    orderBy: { componentId: "asc" },
  });
  for (const row of rows as (PayrollAssignmentRow & { employeeId: number })[]) {
    const arr = map.get(row.employeeId) ?? [];
    arr.push(row);
    map.set(row.employeeId, arr);
  }
  return map;
}

async function requirePayrollComponentAdmin(
  permission: "create_employees" | "edit_employees",
): Promise<{ id: unknown; roles?: string[] }> {
  const user = await requirePermission(permission);
  const scope = await getHrScope({
    id: String((user as { id: unknown }).id),
    roles: Array.isArray((user as { roles?: unknown }).roles)
      ? [...((user as { roles: string[] }).roles)]
      : [],
  });
  if (scope.kind !== "all") {
    throw new Error("Komponen gaji hanya boleh dikelola oleh pengguna dengan cakupan semua karyawan");
  }
  return user as { id: unknown; roles?: string[] };
}

function parseComponentForm(formData: FormData): {
  name: string;
  kind: string;
  recurrence: string;
  isTaxable: boolean;
  accountId: number | null;
} {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const recurrence = String(formData.get("recurrence") ?? "").trim();
  if (!name) throw new Error("Nama komponen gaji wajib diisi");
  if (kind !== "earning" && kind !== "deduction") {
    throw new Error("Jenis komponen gaji harus earning atau deduction");
  }
  if (recurrence !== "fixed" && recurrence !== "variable") {
    throw new Error("Sifat komponen gaji harus fixed atau variable");
  }
  const rawAccount = String(formData.get("accountId") ?? "").trim();
  const accountId = rawAccount === "" ? null : Number(rawAccount);
  if (accountId != null && (!Number.isSafeInteger(accountId) || accountId <= 0)) {
    throw new Error("Akun komponen gaji tidak valid");
  }
  return {
    name,
    kind,
    recurrence,
    isTaxable: kind === "earning" && formData.get("isTaxable") === "true",
    accountId,
  };
}

async function assertActiveComponentNameAvailable(normalizedName: string, excludeId?: number): Promise<void> {
  const dup = await prisma.payrollComponent.findFirst({
    where: {
      normalizedName,
      isActive: true,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (dup) throw new Error("Nama komponen gaji aktif sudah digunakan");
}

export async function createPayrollComponent(formData: FormData) {
  try {
    const user = await requirePermission("create_employees"); await requirePayrollComponentAdmin("create_employees");
    const v = parseComponentForm(formData);
    const normalizedName = v.name.toLowerCase();
    await assertActiveComponentNameAvailable(normalizedName);
    if (v.accountId != null) {
      const account = await prisma.account.findUnique({ where: { id: v.accountId }, select: { id: true } });
      if (!account) throw new Error("Akun komponen gaji tidak ditemukan");
    }
    const created = await prisma.payrollComponent.create({
      data: { ...v, normalizedName, createdBy: Number(user.id), updatedBy: Number(user.id) },
    });
    revalidatePath("/sdm/penggajian");
    return { success: true, id: created.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPayrollComponent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePayrollComponent(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_employees"); await requirePayrollComponentAdmin("edit_employees");
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Komponen gaji tidak valid");
    const existing = await prisma.payrollComponent.findUnique({ where: { id } });
    if (!existing) throw new Error("Komponen gaji tidak ditemukan");
    const v = parseComponentForm(formData);
    const normalizedName = v.name.toLowerCase();
    const rawActive = formData.get("isActive");
    const isActive = rawActive == null ? existing.isActive : rawActive === "true";
    if (isActive) await assertActiveComponentNameAvailable(normalizedName, id);
    if (v.accountId != null) {
      const account = await prisma.account.findUnique({ where: { id: v.accountId }, select: { id: true } });
      if (!account) throw new Error("Akun komponen gaji tidak ditemukan");
    }
    const updated = await prisma.payrollComponent.update({
      where: { id },
      data: { ...v, normalizedName, isActive, updatedBy: Number(user.id) },
    });
    revalidatePath("/sdm/penggajian");
    return { success: true, id: updated.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePayrollComponent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function assignEmployeePayrollComponent(formData: FormData) {
  try {
    const user = await requirePermission("create_employees"); await requirePayrollComponentAdmin("create_employees");
    const employeeId = Number(formData.get("employeeId"));
    const componentId = Number(formData.get("componentId"));
    const defaultAmount = parseMoneyAmount(formData.get("defaultAmount")) ?? Number.NaN;
    const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "").trim();
    const effectiveToRaw = String(formData.get("effectiveTo") ?? "").trim();
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid");
    if (!Number.isSafeInteger(componentId) || componentId <= 0) throw new Error("Komponen gaji tidak valid");
    if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
      throw new Error("Nominal penugasan komponen gaji tidak boleh negatif");
    }
    if (!effectiveFromRaw) throw new Error("Tanggal mulai penugasan wajib diisi");
    const effectiveFrom = wibDateToUtcMidnight(effectiveFromRaw);
    const effectiveTo = effectiveToRaw ? wibDateToUtcMidnight(effectiveToRaw) : null;
    if (effectiveTo != null && effectiveTo < effectiveFrom) {
      throw new Error("Tanggal selesai penugasan tidak boleh sebelum tanggal mulai");
    }
    const [employee, component] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
      prisma.payrollComponent.findUnique({ where: { id: componentId } }),
    ]);
    if (!employee) throw new Error("Karyawan tidak ditemukan");
    if (!component) throw new Error("Komponen gaji tidak ditemukan");
    if (!component.isActive) throw new Error("Komponen gaji nonaktif tidak boleh ditugaskan");
    if (component.recurrence !== "fixed") {
      throw new Error("Hanya komponen gaji tetap yang boleh ditugaskan");
    }
    const newEnd = effectiveTo ?? new Date("9999-12-31T00:00:00.000Z");
    const overlap = await prisma.employeePayrollComponent.findFirst({
      where: {
        employeeId,
        componentId,
        isActive: true,
        effectiveFrom: { lte: newEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      select: { id: true },
    });
    if (overlap) throw new Error("Penugasan komponen gaji tumpang tindih untuk karyawan ini");
    const created = await prisma.employeePayrollComponent.create({
      data: {
        employeeId, componentId, defaultAmount, effectiveFrom, effectiveTo,
        createdBy: Number(user.id), updatedBy: Number(user.id),
      },
    });
    revalidatePath("/sdm/penggajian");
    return { success: true, id: created.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[assignEmployeePayrollComponent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateEmployeePayrollComponent(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_employees"); await requirePayrollComponentAdmin("edit_employees");
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Penugasan komponen gaji tidak valid");
    const existing = await prisma.employeePayrollComponent.findUnique({ where: { id } });
    if (!existing) throw new Error("Penugasan komponen gaji tidak ditemukan");
    const defaultAmount = formData.get("defaultAmount") == null
      ? Number(existing.defaultAmount)
      : (parseMoneyAmount(formData.get("defaultAmount")) ?? Number.NaN);
    if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
      throw new Error("Nominal penugasan komponen gaji tidak boleh negatif");
    }
    const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "").trim();
    const effectiveToRaw = String(formData.get("effectiveTo") ?? "").trim();
    const effectiveFrom = effectiveFromRaw ? wibDateToUtcMidnight(effectiveFromRaw) : existing.effectiveFrom;
    const effectiveTo = formData.get("effectiveTo") == null
      ? existing.effectiveTo
      : effectiveToRaw ? wibDateToUtcMidnight(effectiveToRaw) : null;
    if (effectiveTo != null && effectiveTo < effectiveFrom) {
      throw new Error("Tanggal selesai penugasan tidak boleh sebelum tanggal mulai");
    }
    const rawActive = formData.get("isActive");
    const isActive = rawActive == null ? existing.isActive : rawActive === "true";
    if (isActive) {
      const newEnd = effectiveTo ?? new Date("9999-12-31T00:00:00.000Z");
      const overlap = await prisma.employeePayrollComponent.findFirst({
        where: {
          id: { not: id },
          employeeId: existing.employeeId,
          componentId: existing.componentId,
          isActive: true,
          effectiveFrom: { lte: newEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        select: { id: true },
      });
      if (overlap) throw new Error("Penugasan komponen gaji tumpang tindih untuk karyawan ini");
    }
    const updated = await prisma.employeePayrollComponent.update({
      where: { id },
      data: { defaultAmount, effectiveFrom, effectiveTo, isActive, updatedBy: Number(user.id) },
    });
    revalidatePath("/sdm/penggajian");
    return { success: true, id: updated.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateEmployeePayrollComponent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function setPayrollComponentActive(id: number, isActive: boolean) {
  try {
    const user = await requirePermission("edit_employees"); await requirePayrollComponentAdmin("edit_employees");
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Komponen gaji tidak valid");
    const existing = await prisma.payrollComponent.findUnique({ where: { id } });
    if (!existing) throw new Error("Komponen gaji tidak ditemukan");
    if (isActive) await assertActiveComponentNameAvailable(existing.normalizedName, id);
    const updated = await prisma.payrollComponent.update({
      where: { id },
      data: { isActive, updatedBy: Number(user.id) },
    });
    revalidatePath("/sdm/penggajian");
    return { success: true, id: updated.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[setPayrollComponentActive]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function getPayrollComponents() {
  try {
    await requirePermission("create_employees"); await requirePayrollComponentAdmin("create_employees");
    const rows = await prisma.payrollComponent.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, kind: true, recurrence: true,
        isTaxable: true, accountId: true, isActive: true,
      },
    });
    return { success: true, data: rows };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getPayrollComponents]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function getEmployeePayrollComponents(employeeId: number) {
  try {
    await requirePermission("create_employees"); await requirePayrollComponentAdmin("create_employees");
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid");
    const rows = await prisma.employeePayrollComponent.findMany({
      where: { employeeId },
      orderBy: { componentId: "asc" },
      select: {
        id: true, employeeId: true, componentId: true, defaultAmount: true,
        effectiveFrom: true, effectiveTo: true, isActive: true,
        component: { select: { name: true, kind: true, recurrence: true, isTaxable: true, isActive: true } },
      },
    });
    return { success: true, data: rows.map((r) => ({ ...r, defaultAmount: Number(r.defaultAmount) })) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getEmployeePayrollComponents]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function getPayrollComponentLines(payrollId: number) {
  try {
    const user = await requirePermission("view_payroll");
    if (!Number.isSafeInteger(payrollId) || payrollId <= 0) throw new Error("Slip gaji tidak valid");
    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
      select: { id: true, employeeId: true },
    });
    if (payroll.employeeId != null) {
      const scope = await getHrScope({
        id: String((user as { id: unknown }).id),
        roles: Array.isArray((user as { roles?: unknown }).roles)
          ? [...((user as { roles: string[] }).roles)]
          : [],
      });
      await assertHrEmployeeAccess(scope, payroll.employeeId);
    }
    const rows = await prisma.payrollComponentLine.findMany({
      where: { payrollId },
      orderBy: { componentId: "asc" },
      select: {
        id: true, payrollId: true, componentId: true, componentNameSnapshot: true,
        kindSnapshot: true, recurrenceSnapshot: true, isTaxableSnapshot: true,
        source: true, assignmentId: true, accountIdSnapshot: true, amount: true,
      },
    });
    return { success: true, data: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getPayrollComponentLines]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

async function recalcDraftPayrollFromLines(payrollId: number): Promise<void> {
  const payroll = await prisma.payroll.findUniqueOrThrow({ where: { id: payrollId } });
  if (payroll.status !== "draft") {
    throw new Error("Baris komponen gaji hanya dapat diubah pada slip draft");
  }
  const lines = await prisma.payrollComponentLine.findMany({
    where: { payrollId },
    orderBy: { componentId: "asc" },
  });
  const summary = summarizePayrollComponentLines(lines);
  // TASK-018 (3): hitung ulang dari baris komponen mempertahankan kelas
  // final slip — slip final-resign tidak boleh turun ke TER bulanan.
  const recalcSnapshot = payroll.statutorySnapshot as { pph21Ter?: { periodKind?: string } } | null;
  const w = await buildPayrollWrite({
    employeeId: payroll.employeeId,
    period: payroll.period,
    excludePayrollId: payroll.id,
    resignationFinal: recalcSnapshot?.pph21Ter?.periodKind === "final-resignation",
    endDate: payroll.endDate,
    fallbackLabel: "update slip",
    componentLines: lines,
    v: {
      baseSalary: Number(payroll.baseSalary),
      allowances: summary.allowances,
      deductions: summary.deductions,
      overtimeTotal: Number(payroll.overtimeTotal),
      appreciationTotal: Number(payroll.appreciationTotal),
      loanDeduction: Number(payroll.loanDeduction),
      paymentDate: payroll.paymentDate
        ? payroll.paymentDate.toISOString().slice(0, 10)
        : null,
      lateDeduction: Number(payroll.lateDeduction),
      lateMinutes: payroll.lateMinutes,
      workingDays: payroll.workingDays,
      presentDays: payroll.presentDays,
      absentDays: payroll.absentDays,
      absentDeduction: Number(payroll.absentDeduction),
    },
  });
  await prisma.payroll.update({ where: { id: payrollId }, data: { ...w } });
}

async function assertDraftPayrollLineAccess(payrollId: number): Promise<void> {
  const user = await requirePermission("edit_payroll");
  const payroll = await prisma.payroll.findUniqueOrThrow({ where: { id: payrollId } });
  if (payroll.status !== "draft") {
    throw new Error("Baris komponen gaji hanya dapat diubah pada slip draft");
  }
  if (payroll.employeeId != null) {
    const scope = await getHrScope({
      id: String((user as { id: unknown }).id),
      roles: Array.isArray((user as { roles?: unknown }).roles)
        ? [...((user as { roles: string[] }).roles)]
        : [],
    });
    await assertHrEmployeeAccess(scope, payroll.employeeId);
  }
}

export async function addPayrollComponentLine(payrollId: number, formData: FormData) {
  try {
    if (!Number.isSafeInteger(payrollId) || payrollId <= 0) throw new Error("Slip gaji tidak valid");
    await requirePermission("edit_payroll"); await assertDraftPayrollLineAccess(payrollId);
    const componentId = Number(formData.get("componentId"));
    const amount = parseMoneyAmount(formData.get("amount")) ?? Number.NaN;
    if (!Number.isSafeInteger(componentId) || componentId <= 0) throw new Error("Komponen gaji tidak valid");
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal baris komponen gaji harus lebih dari nol");
    }
    const component = await prisma.payrollComponent.findUnique({ where: { id: componentId } });
    if (!component) throw new Error("Komponen gaji tidak ditemukan");
    if (!component.isActive) throw new Error("Komponen gaji nonaktif tidak boleh ditambahkan");
    const dup = await prisma.payrollComponentLine.findFirst({
      where: { payrollId, componentId },
      select: { id: true },
    });
    if (dup) throw new Error("Komponen gaji yang sama sudah ada pada slip ini");
    const created = await prisma.payrollComponentLine.create({
      data: {
        payrollId,
        componentId,
        componentNameSnapshot: component.name,
        kindSnapshot: component.kind,
        recurrenceSnapshot: component.recurrence,
        isTaxableSnapshot: component.isTaxable,
        source: "manual",
        assignmentId: null,
        accountIdSnapshot: component.accountId ?? null,
        amount,
      },
    });
    await recalcDraftPayrollFromLines(payrollId);
    revalidatePath("/sdm/penggajian");
    return { success: true, id: created.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[addPayrollComponentLine]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePayrollComponentLineAmount(lineId: number, formData: FormData) {
  try {
    if (!Number.isSafeInteger(lineId) || lineId <= 0) throw new Error("Baris komponen gaji tidak valid");
    const line = await prisma.payrollComponentLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Baris komponen gaji tidak ditemukan");
    await requirePermission("edit_payroll"); await assertDraftPayrollLineAccess(line.payrollId);
    const amount = parseMoneyAmount(formData.get("amount")) ?? Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal baris komponen gaji harus lebih dari nol");
    }
    await prisma.payrollComponentLine.update({ where: { id: lineId }, data: { amount } });
    await recalcDraftPayrollFromLines(line.payrollId);
    revalidatePath("/sdm/penggajian");
    return { success: true, id: lineId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePayrollComponentLineAmount]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function removePayrollComponentLine(lineId: number) {
  try {
    if (!Number.isSafeInteger(lineId) || lineId <= 0) throw new Error("Baris komponen gaji tidak valid");
    const line = await prisma.payrollComponentLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Baris komponen gaji tidak ditemukan");
    await requirePermission("edit_payroll"); await assertDraftPayrollLineAccess(line.payrollId);
    await prisma.payrollComponentLine.delete({ where: { id: lineId } });
    await recalcDraftPayrollFromLines(line.payrollId);
    revalidatePath("/sdm/penggajian");
    return { success: true, id: lineId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[removePayrollComponentLine]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// Single payroll write builder shared by create/update slips: loan-deduction
// cap, statutory ruleset gate (reject fallback, AUD-R3-02), BPJS/PPh21 with
// snapshot, net floored at 0 (total mirrors net).
function assertDeductionCeilingOrThrow(o: {
  gross: number;
  cappedLoan: number;
  lateDeduction: number;
  componentDeductions: number;
  fallbackLabel: string;
}): void {
  const breach = evaluateDeductionCeiling({
    wageBase: o.gross,
    loanDeduction: o.cappedLoan,
    lateDeduction: o.lateDeduction,
    componentDeductions: o.componentDeductions,
  });
  if (breach) {
    throw new Error(
      `Total potongan Pasal 63 (cicilan pinjaman + denda + potongan absen + komponen potongan) Rp${breach.totalDeductions.toLocaleString("id-ID")} melebihi plafon 50% upah slip ini Rp${breach.ceiling.toLocaleString("id-ID")} (PP 36/2021 Pasal 65) — ${o.fallbackLabel} ditolak. Sesuaikan perjanjian/potongan, jangan dipangkas diam-diam.`,
    );
  }
}

async function buildPayrollWrite(o: {
  employeeId: number | null;
  period?: string;
  excludePayrollId?: number;
  resignationFinal?: boolean;
  endDate: Date;
  fallbackLabel: "pembuatan slip" | "update slip";
  componentLines?: readonly { kindSnapshot: string; amount: unknown }[];
  v: {
    baseSalary?: number;
    allowances?: number;
    deductions?: number;
    overtimeTotal?: number;
    appreciationTotal?: number;
    loanDeduction?: number;
    paymentDate?: string | null;
    lateDeduction: number;
    lateMinutes: number;
    workingDays: number;
    presentDays: number;
    absentDays: number;
    absentDeduction: number;
  };
}) {
  const { v } = o;
  const period = o.period ?? `${o.endDate.getFullYear()}-${String(o.endDate.getMonth() + 1).padStart(2, "0")}`;
  // Frekuensi dari master karyawan server (bukan client): WEEKLY memakai
  // agregator BPJS se-masa + nominal cicilan mingguan tersimpan.
  const employeeMaster = o.employeeId
    ? await prisma.employee.findUnique({
        where: { id: o.employeeId },
        select: { maritalStatus: true, dependents: true, paymentFrequency: true },
      })
    : null;
  const frequency: PayrollFrequency = employeeMaster?.paymentFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  const cappedLoan = await capLoanDeduction(prisma, o.employeeId, v.loanDeduction ?? 0, frequency);
  const taxProfile = employeeMaster;
  const base = v.baseSalary ?? 0;
  const gross = safeSum([base, v.allowances ?? 0, v.overtimeTotal ?? 0, v.appreciationTotal ?? 0], 0);
  const ruleset = await getStatutoryParams(prisma, o.endDate);
  if (ruleset.fromFallback) {
    throw new Error(
      `Ruleset statutori periode ini belum lengkap/valid — ${o.fallbackLabel} ditolak. Minta accountant melengkapi ruleset, lalu hitung ulang.`,
    );
  }
  assertDeductionCeilingOrThrow({
    gross,
    cappedLoan,
    lateDeduction: v.lateDeduction,
    componentDeductions: v.deductions ?? 0,
    fallbackLabel: o.fallbackLabel,
  });
  // F-103-V agregator BPJS final masa (B1-B6): dipakai SERAGAM semua
  // frekuensi (B4 — tanpa cabang WEEKLY). Slip se-masa lain aktif dibaca
  // per period; campuran slip berpenanda + legacy dalam satu masa =
  // klaim final masa ditolak (B8), bukan dicampur diam-diam.
  const bpjsComputed = await computeBpjsForPeriod({
    employeeId: o.employeeId,
    period,
    currentBase: base,
    ruleset,
    excludePayrollId: o.excludePayrollId,
  });
  const bpjsParts = bpjsComputed.bpjs;
  const bpjsAggregate = bpjsComputed.aggregate;
  // F-026: masa berjalan = TER atas bruto gabungan se-masa; masa terakhir
  // (Des / final-resign) = hitung ulang Pasal 17. Legacy TIDAK lagi dipanggil
  // jalur tulis — dipertahankan hanya reproduksi slip pra-titik-berlaku.
  const pphResult = await computePph21ForPeriod({
    employeeId: o.employeeId,
    period: o.period ?? `${o.endDate.getFullYear()}-${String(o.endDate.getMonth() + 1).padStart(2, "0")}`,
    endDate: o.endDate,
    gross,
    maritalStatus: taxProfile?.maritalStatus,
    dependents: taxProfile?.dependents ?? 0,
    pensionMonthly: bpjsParts.employment,
    ruleset,
    excludePayrollId: o.excludePayrollId,
    resignationFinal: o.resignationFinal ?? false,
    finalReason: o.resignationFinal ? "resign" : null,
  });
  const pph = pphResult.pph21;
  const snapshot = {
    ...buildStatutorySnapshot(ruleset, taxProfile?.maritalStatus, taxProfile?.dependents ?? 0, pphResult.ter),
    ...buildBpjsAggregateSnapshot(bpjsAggregate),
    ...(o.componentLines
      ? { payrollComponents: payrollComponentsSnapshotValue(o.componentLines, gross) }
      : {}),
  };
  const statutoryTotal = safeAdd(bpjsParts.total, pph, 0);
  const withheld = safeSum([v.deductions ?? 0, cappedLoan, v.lateDeduction, v.absentDeduction, statutoryTotal], 0);
  const net = Math.max(0, safeSubtract(gross, withheld, 0));
  return {
    baseSalary: base,
    allowances: v.allowances ?? 0,
    deductions: v.deductions ?? 0,
    overtimeTotal: v.overtimeTotal ?? 0,
    appreciationTotal: v.appreciationTotal ?? 0,
    loanDeduction: cappedLoan,
    lateDeduction: v.lateDeduction,
    lateMinutes: v.lateMinutes,
    workingDays: v.workingDays,
    presentDays: v.presentDays,
    absentDays: v.absentDays,
    absentDeduction: v.absentDeduction,
    grossSalary: gross,
    bpjsHealthEmployee: bpjsParts.health,
    bpjsEmploymentEmployee: bpjsParts.employment,
    pph21: pph,
    statutorySnapshot: snapshot as unknown as PrismaTypes.InputJsonValue,
    netSalary: net,
    totalAmount: net,
    paymentDate: v.paymentDate ? wibDateToUtcMidnight(v.paymentDate) : null,
  };
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
    const startDate = wibDateToUtcMidnight(v.startDate);
    const endDate = wibDateToUtcMidnight(v.endDate);

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

      // Cuti khusus statutori (Pasal 81 & 93 UU 13/2003): batas hari
      // kalender per kejadian, ditegakkan di sini karena gerbang jatah
      // tahunan hanya berlaku untuk tipe "annual".
      const specialCap = SPECIAL_LEAVE_DAY_CAPS[v.type];
      if (specialCap != null) {
        const calendarDays =
          Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
        if (calendarDays > specialCap) {
          throw new Error(
            `Cuti jenis ini maksimal ${specialCap} hari per kejadian (diajukan ${calendarDays} hari).`,
          );
        }
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
        // Kelayakan dinilai per TANGGAL MULAI cuti, bukan hari pengajuan:
        // karyawan yang mengajukan dari sekarang untuk tanggal sesudah
        // ulang tahun masa kerjanya yang ke-1 memang sudah berhak pada
        // saat cuti itu berjalan.
        const quota = await getLeaveQuota(employeeId, {
          year: quotaYear,
          now: startDate,
          db: tx,
        });
        if (!quota.eligible) {
          throw new Error(
            "Cuti tahunan hanya untuk karyawan dengan masa kerja minimal 1 tahun.",
          );
        }
        // Clip the request to the quota year before counting so a leave that
        // straddles Dec→Jan is charged to the start year only for its days IN
        // that year — exactly how getLeaveQuota accounts for `used`. Without the
        // clip the gate charged the WHOLE straddling leave to the start year
        // while the balance dashboard charged only the start-year portion, so a
        // valid year-end request was rejected as over-quota.
        const quotaYearStart = new Date(quotaYear, 0, 1);
        const quotaYearEnd = new Date(quotaYear, 11, 31);
        const requestedDays = await countLeaveWorkingDays(
          employeeId,
          startDate > quotaYearStart ? startDate : quotaYearStart,
          endDate < quotaYearEnd ? endDate : quotaYearEnd,
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
          slug: await nextSlug("leaveRequest", `cuti-${startDate.toISOString().slice(0, 10)}`),
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
      // Batas lembur PP 35/2021 Pasal 26 ayat (1) — gerbang bersama create/
      // update di overtime-pay.service (syarat vonis K2-S1).
      const otDate = wibDateToUtcMidnight(v.date);
      await assertOvertimeWithinWorkdayLimits(tx, (empId, d) => resolveDayKind(empId, d, tx), {
        employeeId: v.employeeId,
        date: otDate,
        hours: v.hours,
      });

      const created = await tx.overtimeRequest.create({
        data: {
          slug: await nextSlug("overtimeRequest", `lembur-${v.date}`),
          employeeId: v.employeeId,
          projectId: v.projectId ?? null,
          date: otDate,
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
    // A document reachable here is either:
    //   • "pending"  — no multi-level workflow configured; this manual approval
    //     is the only gate, so it must compute the value AND flip the status, or
    //   • "approved" — the configured ApprovalWorkflow completed and approveStep
    //     already set status="approved" (see approval.actions.ts). In that case
    //     this call is the ONE that must still compute calculatedValue — the
    //     workflow engine only flips status, it never runs domain side effects.
    // Rejecting anything but "pending" (the previous behaviour) left every
    // workflow-approved overtime with calculatedValue = 0, silently dropping the
    // overtime pay from payroll.
    if (ot.status !== "pending" && ot.status !== "approved") {
      throw new Error(
        "Hanya pengajuan lembur berstatus menunggu (atau sudah lolos persetujuan) yang dapat disetujui",
      );
    }

    // Idempotency: if the value was already computed, do not recompute or
    // overwrite approvedBy (which may have been stamped by the final approver).
    // This makes a double-click / re-entry a harmless no-op instead of a
    // re-rounded value or a clobbered approver.
    if (ot.calculatedValue != null && Number(ot.calculatedValue) > 0) {
      return { success: true };
    }

    // Nilai lembur bertingkat menurut PP 35/2021 jo. Kepmenakertrans
    // 102/2004: upah sejam = gaji/173; hari kerja 1,5x lalu 2x; hari
    // istirahat/libur 2x/3x/4x sesuai pola 5/6 hari kerja. Formula lama
    // (flat 1,1x untuk semua jam, dapat diatur di bawah lantai legal
    // lewat Pengaturan) membayar di bawah minimum undang-undang.
    // Syarat vonis K2-S2 (F-2026-10-25-014-V) sebagaimana dimutakhirkan vonis
    // F-2026-10-25-022-V: dasar upah lembur Pasal 32 PP 35/2021 = Upah pokok
    // (Employee.baseSalary) + seluruh tunjangan tetap terdaftar, yaitu Σ
    // defaultAmount EmployeePayrollComponent aktif (isActive, komponen aktif,
    // kind "earning", recurrence "fixed") yang berjendela efektif pada TANGGAL
    // LEMBUR (ot.date) — bukan tanggal approve. Komponen gaji terpisah memang
    // ada di skema (PayrollComponent + EmployeePayrollComponent); penugasan
    // hanya boleh memuat komponen "fixed", jadi seluruh penugasan aktif adalah
    // tunjangan tetap. Cabang 75% Pasal 32 ayat (4) SENGAJA tidak diterapkan:
    // ia berlaku hanya bila ada tunjangan tidak tetap dan (pokok + tetap)
    // < 75% keseluruhan Upah, dengan dasar 75% x keseluruhan Upah — dan repo
    // tidak menyimpan penugasan tunjangan tidak tetap berjalan, jadi
    // keseluruhan Upah tidak terdefinisi deterministik dari data yang ada.
    // Default yang disahkan vonis: dasar 100% (pokok + tunjangan tetap).
    // Menambah pemicu 75% dari data lain (master variable, baris slip manual)
    // DITOLAK vonis. Bila master tunjangan tidak tetap berjalan kelak ada,
    // dasar ini WAJIB ditinjau ulang oleh vonis Accountant baru.
    // Pola where disalin dari preseden PKWT (pkwt-compensation.service.ts)
    // tanpa mengimpor service itu; filter kind "earning" wajib eksplisit —
    // loadEffectivePayrollAssignments tidak menyaring kind sehingga komponen
    // deduction/fixed akan ikut terhitung bila pemuat itu dipakai apa adanya.
    const fixedAssignments = await prisma.employeePayrollComponent.findMany({
      where: {
        employeeId: ot.employeeId,
        isActive: true,
        effectiveFrom: { lte: ot.date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: ot.date } }],
        component: { isActive: true, recurrence: "fixed", kind: "earning" },
      },
      select: {
        defaultAmount: true,
        component: { select: { name: true } },
      },
    });
    const fixedAllowance = fixedAssignments.reduce(
      (sum, a) => safeRound(sum + Number(a.defaultAmount), 2),
      0,
    );
    const baseSalary = safeRound(
      Number(ot.employee?.baseSalary ?? 0) + fixedAllowance,
      2,
    );
    const hours = Number(ot.hours);
    const dayProfile = await resolveDayKind(ot.employeeId, ot.date);
    const dayKind: OvertimeDayKind = dayProfile.isWorkingDay
      ? "workday"
      : dayProfile.workdaysPerWeek >= 6
        ? "rest_6day"
        : "rest_5day";
    const calculatedValue = computeOvertimePay({
      monthlySalary: baseSalary,
      hours,
      dayKind,
    });

    // Snapshot rincian dasar (F-2026-10-25-024-S, BR-OT-09/BR-OT-11):
    // pokok + HANYA komponen yang benar-benar ikut Σ di atas + total dasar
    // final, dibekukan pada klaim atomik yang sama dengan calculatedValue.
    // Tanpa snapshot ini rincian tidak bisa ditampilkan verbatim — membaca
    // master komponen saat tampil akan menampilkan dasar master kini, bukan
    // dasar saat approve. Baris yang sudah terhitung berhenti di gerbang
    // idempotensi di atas, jadi snapshot ikut beku dan tidak ditulis ulang.
    const overtimeBaseSnapshot = {
      baseSalary: safeRound(Number(ot.employee?.baseSalary ?? 0), 2),
      components: fixedAssignments.map((a) => ({
        name: a.component.name,
        amount: Number(a.defaultAmount),
      })),
      baseTotal: baseSalary,
      overtimeDate: new Date(ot.date).toISOString(),
    };

    const claim = await prisma.overtimeRequest.updateMany({
      where: { id: overtimeId, status: { in: ["pending", "approved"] } },
      data: {
        status: "approved",
        approvedBy: Number(user.id),
        // Cap waktu persetujuan WAJIB distempel di sini. Sebelumnya hanya
        // approvedBy yang ditulis, sehingga kolom approvedAt selalu kosong:
        // halaman detail lembur hanya merender baris "Disetujui Pada" bila kolom
        // itu terisi, jadi pengajuan yang sudah disetujui tampil TANPA tanggal
        // persetujuan dan jejak audit tidak bisa dibuktikan. Pengesahan ulang
        // tidak menimpa cap ini karena perhitungan yang sudah ada berhenti lebih
        // awal (idempotensi di atas).
        approvedAt: new Date(),
        calculatedValue,
        overtimeBaseSnapshot,
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
  statutorySnapshot: Record<string, unknown>;
}

function assertPayrollDateRange(startDateStr: string, endDateStr: string): void {
  // `new Date("2026-02-30")` rolls over silently to Mar 2 instead of failing,
  // so route the raw strings through the strict calendar `dateOnly` (the same
  // gate the payroll document dates use) before any parsing happens.
  const start = dateOnly.safeParse(startDateStr);
  const end = dateOnly.safeParse(endDateStr);
  if (!start.success || !end.success) {
    throw new Error("Rentang tanggal penggajian tidak valid");
  }
  const startDate = new Date(start.data);
  const endDate = new Date(end.data);
  const rangeMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs < 0) {
    throw new Error("Rentang tanggal penggajian tidak valid");
  }
  if (rangeMs > 90 * 24 * 60 * 60 * 1000) {
    throw new Error("Rentang tanggal penggajian maksimal 90 hari");
  }
}

/**
 * Cap a client-supplied loan instalment to the employee's real outstanding
 * loan balance. Mirrors computePayrollEstimation's cap (Σ min(installment,
 * remaining)) so the deduction written to payroll can never exceed what
 * onPayrollPaid can actually relieve — otherwise the full amount is credited to
 * Piutang Karyawan while the loans are only reduced by their remaining balance,
 * driving the receivable negative.
 */
async function capLoanDeduction(
  db: typeof prisma,
  employeeId: number | null,
  requested: number,
  frequency: PayrollFrequency = "MONTHLY",
): Promise<number> {
  if (!employeeId || requested <= 0) return Math.max(0, requested || 0);
  const loans = await db.employeeLoan.findMany({
    where: { employeeId, status: "active" },
    select: { monthlyInstallment: true, weeklyInstallment: true, remainingAmount: true },
  });
  return capLoanDeductionForFrequency(
    loans.map((loan) => ({
      monthlyInstallment: Number(loan.monthlyInstallment) || 0,
      weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
      remainingAmount: Number(loan.remainingAmount) || 0,
    })),
    frequency,
    requested,
  );
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
          dependents: true,
          paymentFrequency: true,
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
          date: { gte: startDate, lt: endOfUtcDayExclusive(endDate) },
        },
      }),
      // 3. Appreciation
      prisma.appreciation.findMany({
        where: {
          employeeId,
          date: { gte: startDate, lt: endOfUtcDayExclusive(endDate) },
        },
      }),
      // 4. Late Deduction
      calculateLatePenalty(employeeId, startDate, endDate),
      // 5. Attendance summary (working days, absent/bolos deduction, holidays excluded)
      calculateAttendanceSummary(employeeId, startDate, endDate),
    ]);

  if (!employee) throw new Error("Karyawan tidak ditemukan");

  const baseSalary = Number(employee.baseSalary);
  // F-105-V: nominal per frekuensi karyawan dari SATU helper — WEEKLY
  // hanya weeklyInstallment tersimpan; tanpa nominal = 0 di preview ini
  // (gerbang tulis/run menahan karyawan itu alasan pinjaman).
  const frequency: PayrollFrequency = employee.paymentFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  const loanDeduction = sumLoanDeductionForFrequency(
    employee.employeeLoans.map((loan) => ({
      monthlyInstallment: Number(loan.monthlyInstallment),
      weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
      remainingAmount: Number(loan.remainingAmount),
    })),
    frequency,
  ) ?? 0;

  const overtimeTotal = overtimes.reduce(
    (sum, ot) => safeAdd(sum, ot.calculatedValue ?? 0, 0),
    0,
  );

  const appreciationTotal = appreciations.reduce(
    (sum, ap) => safeAdd(sum, ap.amount ?? 0, 0),
    0,
  );

  // 6. Statutory: BPJS (employee portion) + PPh21 — P1-6: params berperiode
  // dari ruleset (acuan akhir periode), bukan konstanta kode.
  const grossSalary = safeSum(
    [baseSalary, overtimeTotal, appreciationTotal],
    0,
  );
  const statutoryParams = await getStatutoryParams(prisma, new Date(endDateStr));
  // Estimasi = PREVIEW non-final (R3-02): tabel TER tersedia → TER atas bruto
  // masa ini; belum tersedia → legacy berlabel LEGACY_PRE_TER di snapshot.
  // Yang fail-closed = tulis-final (bulk/single/update) + approve.
  // F-103-V: preview memakai agregator se-masa yang sama (basis Σ slip
  // aktif period endDate + slip berjalan); penanda ikut snapshot preview.
  const estPeriod = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}`;
  const bpjsComputed = await computeBpjsForPeriod({
    employeeId,
    period: estPeriod,
    currentBase: baseSalary,
    ruleset: statutoryParams,
  });
  const bpjs = bpjsComputed.bpjs;
  // Plafon Pasal 65 TIDAK menolak preview (vonis butir 6: gerbang slip =
  // generate/finalisasi tulis) — pelampauan tampil di snapshot preview.
  // Basis sama dengan gerbang tulis: upah pembayaran (grossSalary).
  const ceilingFinding = evaluateDeductionCeiling({
    wageBase: grossSalary,
    loanDeduction,
    lateDeduction: latePenalty.totalPenalty,
    componentDeductions: 0,
  });
  const estCategory = terCategoryFor(employee.maritalStatus, employee.dependents ?? 0);
  const estBrackets = await getTerBrackets(prisma as never, estCategory, new Date(endDateStr));
  const estTer = estBrackets ? computePph21Ter(grossSalary, estBrackets) : null;
  const pph21 = estTer
    ? estTer.pph21
    : computePph21Monthly(
        grossSalary,
        employee.maritalStatus,
        bpjs.total,
        employee.dependents ?? 0,
        statutoryParams,
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
    absentDeduction: attendance.absentDeduction,
    dailyRate: attendance.dailyRate,
    grossSalary,
    bpjsHealthEmployee: bpjs.health,
    bpjsEmploymentEmployee: bpjs.employment,
    pph21,
    statutorySnapshot: {
      ...buildStatutorySnapshot(
      statutoryParams,
      employee.maritalStatus,
      employee.dependents ?? 0,
      buildTerSnapshot({
        maritalStatus: employee.maritalStatus,
        dependents: employee.dependents ?? 0,
        ter: estTer ? { bracket: estTer.bracket, ratePct: estTer.ratePct } : null,
        final: null,
        periodKind: "preview",
        monthsInStint: null,
      }),
      ),
      ...buildBpjsAggregateSnapshot(bpjsComputed.aggregate),
      ...(ceilingFinding ? { deductionCeilingFinding: ceilingFinding } : {}),
    },
  };
}

export interface TerSnapshotInfo {
  method: "TER" | "LEGACY_PRE_TER"
  category: TerBracket["category"] | null
  maritalStatusRaw: string | null
  dependentsClamped: number
  statusCodeDependents: number | null
  statusDependentsMismatch: boolean
  rateMilliPercent: number | null
  ratePct: number | null
  bracketLowerBound: number | null
  bracketUpperBound: number | null
  bracketEffectiveFrom: string | null
  bracketSource: string | null
  periodKind: string
  monthsInStint: number | null
  priorEmployerIncomeIncluded: boolean | null
  annualTax: number | null
  overWithheld: number | null
  overWithheldReturned: boolean | null
  overWithheldReturnedAt: string | null
  underWithheldExcess: number | null
  finalReason: string | null
}

function buildTerSnapshot(o: {
  maritalStatus: string | null | undefined
  dependents: number
  ter: { bracket: TerBracket; ratePct: number } | null
  final: { annualTax: number; overWithheld: number; underWithheldExcess: number } | null
  periodKind: string
  monthsInStint: number | null
  finalReason?: string | null
}): TerSnapshotInfo {
  const dep = Math.min(3, Math.max(0, Math.floor(o.dependents)))
  const codeDep = statusCodeDependents(o.maritalStatus)
  return {
    method: o.ter || o.final ? "TER" : "LEGACY_PRE_TER",
    category: o.ter ? o.ter.bracket.category : o.final ? terCategoryFor(o.maritalStatus, dep) : null,
    maritalStatusRaw: o.maritalStatus ?? null,
    dependentsClamped: dep,
    statusCodeDependents: codeDep,
    statusDependentsMismatch: codeDep != null && codeDep !== dep,
    rateMilliPercent: o.ter ? o.ter.bracket.rateMilliPercent : null,
    ratePct: o.ter ? o.ter.ratePct : null,
    bracketLowerBound: o.ter ? o.ter.bracket.lowerBound : null,
    bracketUpperBound: o.ter ? o.ter.bracket.upperBound : null,
    bracketEffectiveFrom: o.ter ? o.ter.bracket.effectiveFrom : null,
    bracketSource: o.ter ? o.ter.bracket.source : null,
    periodKind: o.periodKind,
    monthsInStint: o.monthsInStint,
    priorEmployerIncomeIncluded: o.final ? false : null,
    annualTax: o.final ? o.final.annualTax : null,
    overWithheld: o.final ? o.final.overWithheld : null,
    overWithheldReturned: o.final ? false : null,
    overWithheldReturnedAt: null,
    underWithheldExcess: o.final ? o.final.underWithheldExcess : null,
    finalReason: o.finalReason ?? null,
  }
}

/** Status slip yang ikut agregasi tahunan F-026 (vonis §4: terbit/final —
 * draft/batal TIDAK ikut). */
const FINAL_PAYROLL_STATUSES = ["approved", "paid"]

function periodYearMonth(period: string, fallback: Date): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})/.exec(period)
  if (m) return { year: Number(m[1]), month: Number(m[2]) }
  return { year: fallback.getFullYear(), month: fallback.getMonth() + 1 }
}

interface Pph21PeriodComputation {
  pph21: number
  ter: TerSnapshotInfo
}

/**
 * F-2026-10-21-026: PPh21 satu masa pajak dari bruto GABUNGAN masa itu.
 * - Masa selain terakhir: bruto gabungan × TER (tanpa pengurang).
 * - Slip kedua dst se-masa (T7): target gabungan − PPh21 slip se-masa lain
 *   yang sudah ada (semua status selain batal; unik employee+period+type
 *   membuat pasangan REGULAR+THR menjadi dua baris periode sama).
 * - Masa terakhir (Des / final-resign eksplisit): hitung ulang Pasal 17
 *   tahunan atas Σ bruto final tahun berjalan + slip berjalan, kurangi
 *   Σ terpotong final masa sebelumnya; lebih potong → snapshot, bukan negatif.
 * Tabel TER kosong/tidak lengkap → throw (fail-closed, tanpa fallback legacy).
 */
/**
 * F-2026-10-23-103-V agregator BPJS final masa (B1-B6 + gerbang B8):
 * target masa dari basis Σ baseSalary slip aktif se-masa (ceiling SEKALI),
 * slip berjalan = max(0, target − Σ terpotong slip se-masa lain aktif).
 * Slip se-masa lain tanpa penanda agregat = masa campuran -> ditolak
 * berisik (B8); tanpa karyawan -> basis slip berjalan saja (preview).
 */
async function computeBpjsForPeriod(o: {
  employeeId: number | null;
  period: string;
  currentBase: number;
  ruleset: StatutoryParams;
  excludePayrollId?: number;
}): Promise<{ bpjs: ReturnType<typeof computeBpjsEmployee>; aggregate: BpjsAggregateSnapshot }> {
  let others: BpjsPeriodSlip[] = [];
  if (o.employeeId) {
    const rows = await prisma.payroll.findMany({
      where: { employeeId: o.employeeId, period: o.period },
      select: {
        id: true, baseSalary: true, bpjsHealthEmployee: true,
        bpjsEmploymentEmployee: true, status: true, statutorySnapshot: true,
      },
    });
    others = rows
      .filter((r) => !(o.excludePayrollId && r.id === o.excludePayrollId))
      .filter((r) => r.status !== "cancelled" && r.status !== "canceled")
      .map((r) => ({
        baseSalary: Number(r.baseSalary),
        bpjsHealthEmployee: Number(r.bpjsHealthEmployee),
        bpjsEmploymentEmployee: Number(r.bpjsEmploymentEmployee),
        status: r.status,
        statutorySnapshot: r.statutorySnapshot,
      }));
    if (others.some((s) => readBpjsAggregateSnapshot(s.statutorySnapshot) == null)) {
      throw new Error(
        "Masa ini masih memuat slip BPJS per-slip (legacy tanpa penanda agregat) — klaim final BPJS masa ditolak sampai slip legacy dihitung ulang/diganti (vonis BOT 4 F-103-V B6/B8).",
      );
    }
  }
  return allocateBpjsForPeriod({ currentBase: o.currentBase, otherActiveSlips: others, ruleset: o.ruleset });
}

async function computePph21ForPeriod(o: {
  employeeId: number | null
  period: string
  endDate: Date
  gross: number
  maritalStatus: string | null | undefined
  dependents: number
  pensionMonthly: number // JHT+JP karyawan slip berjalan (pengurang §4)
  ruleset: StatutoryParams
  excludePayrollId?: number
  resignationFinal?: boolean
  finalReason?: string | null
}): Promise<Pph21PeriodComputation> {
  const { year, month } = periodYearMonth(o.period, o.endDate)
  let joinDate: Date | null = null
  if (o.employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: o.employeeId },
      select: { joinDate: true },
    })
    joinDate = emp?.joinDate ?? null
  }
  const resolution = resolveTerPeriod({
    periodYear: year,
    periodMonth: month,
    joinDate,
    resignationFinal: o.resignationFinal ?? false,
  })
  const category = terCategoryFor(o.maritalStatus, o.dependents)
  const isFinal = resolution.kind !== "monthly"

  // Slip se-tahun karyawan (untuk agregasi masa terakhir + selisih se-masa).
  let yearSlips: { id: number; period: string; type: string; status: string; grossSalary: unknown; pph21: unknown; bpjsEmploymentEmployee: unknown; statutorySnapshot: unknown }[] = []
  if (o.employeeId) {
    const all = await prisma.payroll.findMany({
      where: { employeeId: o.employeeId },
      select: {
        id: true, period: true, type: true, status: true, grossSalary: true,
        pph21: true, bpjsEmploymentEmployee: true, statutorySnapshot: true,
      },
    })
    yearSlips = all.filter((r) => {
      if (o.excludePayrollId && r.id === o.excludePayrollId) return false
      if (r.status === "cancelled" || r.status === "canceled") return false
      return periodYearMonth(r.period, o.endDate).year === year
    })
  }
  const samePeriod = yearSlips.filter((r) => r.period === o.period)

  if (isFinal) {
    const priorFinals = yearSlips.filter(
      (r) => r.status !== "draft" && (r.statutorySnapshot as { pph21Ter?: { periodKind?: string } } | null)?.pph21Ter?.periodKind?.startsWith("final"),
    )
    if (priorFinals.length > 0) {
      throw new Error("Masa pajak terakhir tahun ini sudah terbit — hitung ulang kedua ditolak (F-026).")
    }
    const finalRows = yearSlips.filter((r) => FINAL_PAYROLL_STATUSES.includes(r.status))
    const grossYear = finalRows.reduce((sum, r) => sum + Number(r.grossSalary), 0) + o.gross
    const pensionYear = finalRows.reduce((sum, r) => sum + Number(r.bpjsEmploymentEmployee), 0) + o.pensionMonthly
    const priorWithheld = finalRows
      .filter((r) => r.period !== o.period)
      .reduce((sum, r) => sum + Number(r.pph21), 0)
      + samePeriod.filter((r) => FINAL_PAYROLL_STATUSES.includes(r.status)).reduce((sum, r) => sum + Number(r.pph21), 0)
    const fin = computePph21FinalPeriod({
      grossYear,
      pensionDeductionYear: pensionYear,
      maritalStatus: o.maritalStatus,
      dependents: o.dependents,
      monthsInStint: resolution.monthsInStint,
      priorWithheld,
      finalPeriodGross: o.gross,
      p: o.ruleset,
    })
    return {
      pph21: fin.pph21,
      ter: buildTerSnapshot({
        maritalStatus: o.maritalStatus, dependents: o.dependents, ter: null,
        final: fin, periodKind: resolution.kind, monthsInStint: resolution.monthsInStint,
        finalReason: o.finalReason ?? (resolution.kind === "final-december" ? "december" : null),
      }),
    }
  }

  const brackets = await getTerBrackets(prisma as never, category, o.endDate)
  if (!brackets) {
    throw new Error(
      "Tabel TER PP 58/2023 belum terisi lengkap untuk periode ini — hitung final ditolak. Minta accountant melengkapi tabel TER, lalu hitung ulang.",
    )
  }
  const combinedGross = samePeriod.reduce((sum, r) => sum + Number(r.grossSalary), 0) + o.gross
  const combined = computePph21Ter(combinedGross, brackets)
  const alreadyWithheld = samePeriod.reduce((sum, r) => sum + Number(r.pph21), 0)
  const pph21 = Math.max(0, combined.pph21 - alreadyWithheld)
  return {
    pph21,
    ter: buildTerSnapshot({
      maritalStatus: o.maritalStatus, dependents: o.dependents,
      ter: { bracket: combined.bracket, ratePct: combined.ratePct },
      final: null, periodKind: resolution.kind, monthsInStint: resolution.monthsInStint,
    }),
  }
}

/**
 * P1-6: snapshot parameter statutori yang dipakai satu slip — disimpan di
 * `payrolls.statutory_snapshot` agar hitungan historis reproduksibel walau
 * ruleset berubah. `fromFallback: true` = tabel kosong → angka 2024 kode.
 */
function buildStatutorySnapshot(
  params: StatutoryParams,
  maritalStatus: string | null | undefined,
  dependents: number,
  pph21Ter?: TerSnapshotInfo,
): Record<string, unknown> {
  return {
    asOf: params.asOf,
    fromFallback: params.fromFallback,
    maritalStatus: maritalStatus ?? null,
    dependents,
    ...(pph21Ter ? { pph21Ter } : {}),
    params: {
      bpjsHealthEmployeeRate: params.bpjsHealthEmployeeRate,
      bpjsHealthCeiling: params.bpjsHealthCeiling,
      bpjsJhtEmployeeRate: params.bpjsJhtEmployeeRate,
      bpjsJpEmployeeRate: params.bpjsJpEmployeeRate,
      bpjsJpCeiling: params.bpjsJpCeiling,
      ptkpSingle: params.ptkpSingle,
      ptkpMarriedExtra: params.ptkpMarriedExtra,
      ptkpDependentExtra: params.ptkpDependentExtra,
      occupationalCostRate: params.occupationalCostRate,
      occupationalCostCeilingYear: params.occupationalCostCeilingYear,
    },
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
  allowances: number;
  deductions: number;
  componentLines: PayrollComponentLineData[];
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
  statutorySnapshot: Record<string, unknown>;
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
    componentAssignmentsByEmployee,
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
        dependents: true,
        departmentId: true,
        paymentFrequency: true,
        employeeLoans: { where: { status: "active" } },
      },
    }),
    prisma.overtimeRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "approved",
        date: { gte: startDate, lt: endOfUtcDayExclusive(endDate) },
      },
    }),
    prisma.appreciation.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: { gte: startDate, lt: endOfUtcDayExclusive(endDate) },
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
    loadEffectivePayrollAssignments(prisma, employeeIds, rangeEnd),
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
  // P1-6: satu params untuk seluruh batch (satu periode) — mesin SAMA dengan single.
  const bulkStatutoryParams = await getStatutoryParams(prisma, rangeEnd);
  // F-026: tabel TER per kategori dipakai batch ini (fail-closed di pemakaian).
  const bulkTerByCategory = new Map<string, TerBracket[] | null>();
  for (const cat of ["A", "B", "C"] as const) {
    bulkTerByCategory.set(cat, await getTerBrackets(prisma as never, cat, rangeEnd));
  }
  const bulkPeriod = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, "0")}`;
  // AUD-R3-02: bulk sama — tolak fallback di sumber.
  if (bulkStatutoryParams.fromFallback) {
    throw new Error(
      "Ruleset statutori periode ini belum lengkap/valid — hitung massal ditolak. " +
        "Minta accountant melengkapi ruleset, lalu hitung ulang.",
    );
  }
  const departmentHolidaySet = new Map<number, Set<string>>();
  for (const holiday of departmentHolidays) {
    const dates = departmentHolidaySet.get(holiday.departmentId) ?? new Set<string>();
    dates.add(dateKey(holiday.date));
    departmentHolidaySet.set(holiday.departmentId, dates);
  }

  // F-103-V: slip aktif se-masa populasi batch (untuk agregator BPJS) —
  // satu query per run, bukan per karyawan. Slip batal dikeluarkan (B1).
  const bulkPeriodSlips = employeeIds.length === 0
    ? []
    : await prisma.payroll.findMany({
        where: { employeeId: { in: employeeIds }, period: bulkPeriod },
        select: {
          employeeId: true, baseSalary: true, bpjsHealthEmployee: true,
          bpjsEmploymentEmployee: true, status: true, statutorySnapshot: true,
          grossSalary: true, pph21: true,
        },
      });
  const bulkSlipsByEmployee = new Map<number, BpjsPeriodSlip[]>();
  for (const row of bulkPeriodSlips) {
    if (row.employeeId == null || row.status === "cancelled" || row.status === "canceled") continue;
    const arr = bulkSlipsByEmployee.get(row.employeeId) ?? [];
    arr.push({
      baseSalary: Number(row.baseSalary),
      bpjsHealthEmployee: Number(row.bpjsHealthEmployee),
      bpjsEmploymentEmployee: Number(row.bpjsEmploymentEmployee),
      status: row.status,
      statutorySnapshot: row.statutorySnapshot,
    });
    bulkSlipsByEmployee.set(row.employeeId, arr);
  }
  // TASK-018 (1): agregat TER se-masa per karyawan (bruto + PPh21 slip aktif
  // se-period lain) — pasangan data agregator BPJS di atas. Tanpa ini slip
  // WEEKLY hasil bulk dihitung per-slip dan bracket TER ter-reset tiap minggu.
  const bulkTerByEmployee = new Map<number, { gross: number; pph21: number }>();
  for (const row of bulkPeriodSlips) {
    if (row.employeeId == null || row.status === "cancelled" || row.status === "canceled") continue;
    const acc = bulkTerByEmployee.get(row.employeeId) ?? { gross: 0, pph21: 0 };
    acc.gross += Number(row.grossSalary) || 0;
    acc.pph21 += Number(row.pph21) || 0;
    bulkTerByEmployee.set(row.employeeId, acc);
  }

  for (const employee of employees) {
    // 1. Base salary + loan deduction (capped at remaining balance).
    const baseSalary = Number(employee.baseSalary);
    // F-105-V: nominal per frekuensi karyawan (helper bersama).
    const loanDeduction = sumLoanDeductionForFrequency(
      employee.employeeLoans.map((loan) => ({
        monthlyInstallment: Number(loan.monthlyInstallment),
        weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
        remainingAmount: Number(loan.remainingAmount),
      })),
      employee.paymentFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY",
    ) ?? 0;

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

    // 6. Statutory deductions (mesin sama dengan single).
    const componentLines = buildPayrollComponentLinesFromAssignments(
      componentAssignmentsByEmployee.get(employee.id) ?? [],
      rangeEnd,
    );
    const componentSummary = summarizePayrollComponentLines(componentLines);
    const grossSalary = safeSum(
      [baseSalary, componentSummary.allowances, overtimeTotal, appreciationTotal],
      0,
    );
    // F-103-V agregator se-masa (basis Σ slip aktif period ini + berjalan).
    const bulkOthers = bulkSlipsByEmployee.get(employee.id) ?? [];
    if (bulkOthers.some((slip) => readBpjsAggregateSnapshot(slip.statutorySnapshot) == null)) {
      throw new Error(
        "Masa ini masih memuat slip BPJS per-slip (legacy tanpa penanda agregat) — klaim final BPJS masa ditolak sampai slip legacy dihitung ulang/diganti (vonis BOT 4 F-103-V B6/B8).",
      );
    }
    const bpjsAllocated = allocateBpjsForPeriod({
      currentBase: baseSalary,
      otherActiveSlips: bulkOthers,
      ruleset: bulkStatutoryParams,
    });
    const bpjs = bpjsAllocated.bpjs;

    // F-026 jalur tulis massal + TASK-018 (1): TER atas bruto GABUNGAN
    // se-masa (bruto slip aktif se-period lain + slip berjalan), selisih
    // terhadap PPh21 yang sudah terpotong se-masa — persis
    // computePph21ForPeriod jalur single. Menghitung per-slip mereset
    // bracket tiap minggu (4 x Rp2,6jt = 0 vs gabungan Rp260rb). Snapshot
    // Desember ditandai pending-final: hitung ulang masa terakhir per
    // karyawan terjadi di jalur single/update (buildPayrollWrite).
    const bulkCategory = terCategoryFor(employee.maritalStatus, employee.dependents ?? 0);
    const bulkBrackets = bulkTerByCategory.get(bulkCategory);
    if (!bulkBrackets) {
      throw new Error(
        "Tabel TER PP 58/2023 belum terisi lengkap untuk periode ini — hitung massal ditolak. " +
          "Minta accountant melengkapi tabel TER, lalu hitung ulang.",
      );
    }
    const bulkSamePeriod = bulkTerByEmployee.get(employee.id) ?? { gross: 0, pph21: 0 };
    const bulkTer = computePph21Ter(bulkSamePeriod.gross + grossSalary, bulkBrackets);
    const pph21 = Math.max(0, bulkTer.pph21 - bulkSamePeriod.pph21);

    result.set(employee.id, {
      baseSalary,
      allowances: componentSummary.allowances,
      deductions: componentSummary.deductions,
      componentLines,
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
      statutorySnapshot: {
        ...buildStatutorySnapshot(
          bulkStatutoryParams,
          employee.maritalStatus,
          employee.dependents ?? 0,
          buildTerSnapshot({
            maritalStatus: employee.maritalStatus,
            dependents: employee.dependents ?? 0,
            ter: { bracket: bulkTer.bracket, ratePct: bulkTer.ratePct },
            final: null,
            periodKind: bulkPeriod.endsWith("-12") ? "bulk-december-pending-final" : "monthly",
            monthsInStint: null,
          }),
        ),
        payrollComponents: payrollComponentsSnapshotValue(componentLines, grossSalary),
        ...buildBpjsAggregateSnapshot(bpjsAllocated.aggregate),
      },
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

/**
 * F-2026-10-22-076-S (BR-PF-03, Q-PF-3 diputus BOT 3): slip aktif
 * (status selain cancelled/canceled) karyawan yang rentangnya beririsan
 * rentang baru, atau null. Query dibatasi jendela kasar ±90 hari
 * (assertPayrollDateRange membatasi rentang tulis <= 90 hari); keputusan
 * irisan final oleh builder murni findPayrollRangeConflict.
 */
async function findActivePayrollRangeConflict(
  db: typeof prisma,
  employeeId: number,
  startDate: Date,
  endDate: Date,
  excludePayrollId?: number,
) {
  const windowStart = new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  const slips = await db.payroll.findMany({
    where: {
      employeeId,
      status: { notIn: ["cancelled", "canceled"] },
      startDate: { lte: endDate },
      endDate: { gte: windowStart },
      ...(excludePayrollId ? { id: { not: excludePayrollId } } : {}),
    },
    select: { startDate: true, endDate: true, status: true, documentNo: true },
  });
  return findPayrollRangeConflict(slips, startDate, endDate);
}

/**
 * BR-HRS-08 / F-2026-10-28-128-S (AC-HRS-4..6): jalur TULIS penggajian wajib
 * memakai cakupan HR yang SAMA dengan jalur BACA. Sebelum perubahan ini
 * processPayroll/updatePayroll/approvePayroll/markPayrollPaid hanya memeriksa
 * izin `*_payroll`, sehingga peran ber-cakupan (self/department/team) bisa
 * menulis, menyetujui, dan membayar slip karyawan di luar cakupannya —
 * asimetri yang sama kelasnya dengan kebocoran baca.
 *
 * Slip tanpa karyawan (`employeeId` null) tidak bisa dibuktikan milik siapa
 * pun, jadi untuk scope non-`all` ia DITOLAK fail-closed. Peran kind `all`
 * (super_admin/admin/finance/ga) nol perubahan perilaku.
 */
async function assertPayrollInHrScope(
  scope: HrScope,
  employeeId: number | null,
): Promise<void> {
  if (scope.kind === "all") return
  if (employeeId == null) {
    throw new Error("Anda tidak memiliki akses ke slip penggajian tanpa karyawan ini")
  }
  await assertHrEmployeeAccess(scope, employeeId)
}

export async function generateBulkPayroll(
  period: string,
  startDateStr: string,
  endDateStr: string,
  paymentFrequency: string = "MONTHLY",
) {
  try {
    const user = await requirePermission("create_payroll");
    // Reject fictitious calendar dates before any rows are built: the bulk
    // estimator/guard only checks range length, and `new Date("2026-02-30")`
    // would otherwise persist the rolled-over date (Mar 2) on every slip.
    assertPayrollDateRange(startDateStr, endDateStr);
    // F-076-S: frekuensi run wajib kosakata master existing; period wajib
    // "YYYY-MM" bulan endDate (V-PF2-1/V-PF2-5 BOT 4 — karangan "YYYY-MM-Wn"
    // ditolak tulis, AC-PF2-5).
    if (!isPayrollFrequency(paymentFrequency)) {
      throw new Error("Frekuensi run penggajian tidak valid — gunakan MONTHLY atau WEEKLY.");
    }
    assertPayrollPeriodMatchesEndDate(period, new Date(endDateStr));

    // BR-HRS-08 (AC-HRS-2): populasi run massal mengikuti cakupan HR pemanggil.
    // Peran ber-cakupan hanya menerbitkan slip karyawan yang boleh dilihatnya;
    // tanpa saringan ini slip seluruh organisasi lahir dari satu klik.
    const bulkScope = await getHrScope(user);
    const bulkScopeActiveWhere =
      bulkScope.kind === "all" ? {} : { AND: [hrEmployeeScopeWhere(bulkScope)] };
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...bulkScopeActiveWhere,
      },
      select: {
        id: true,
        employmentEndedAt: true,
        paymentFrequency: true,
        employeeLoans: {
          where: { status: "active", remainingAmount: { gt: 0 } },
          select: { id: true, weeklyInstallment: true, remainingAmount: true },
        },
      },
    });
    // BR-HRS-04 (AC-HRS-3): karyawan aktif di luar cakupan dilaporkan sebagai
    // hitungan "terlewati karena cakupan", bukan disaring diam-diam. Hanya
    // hitung ID (tanpa nama/nominal, BR-HRS-07); kind all tidak menambah
    // query (count cakupan = 0).
    const outOfScopeIds: number[] =
      bulkScope.kind === "all"
        ? []
        : (
            await prisma.employee.findMany({
              where: {
                isActive: true,
                deletedAt: null,
                NOT: bulkScopeActiveWhere,
              },
              select: { id: true },
            })
          ).map((e) => e.id);

    // F-085-S gerbang BR-EMP-06 (Q-EMP-3): karyawan berhenti tidak boleh
    // menerima slip reguler massal. Periode seluruhnya sesudah berhenti
    // atau memotong tanpa jalur final -> dikeluarkan dari populasi massal
    // (slip final dibuat lewat jalur single processPayroll). Tercatat log.
    const periodStart = new Date(startDateStr);
    const periodEnd = new Date(endDateStr);
    const gatedOut: number[] = [];
    const employmentEligible = employees.filter((e) => {
      const gate = evaluatePayrollEmploymentGate({
        employmentEndedAt: e.employmentEndedAt,
        periodStart,
        periodEnd,
        isFinalSlip: false,
      });
      if (!gate.allowed) gatedOut.push(e.id);
      return gate.allowed;
    });
    if (gatedOut.length > 0) {
      console.warn(
        `[generateBulkPayroll] ${gatedOut.length} karyawan berhenti dikeluarkan dari generate massal periode ${period}: ${gatedOut.join(",")}`,
      );
    }

    // Kenaikan gaji terjadwal yang jatuh tempo sampai akhir periode
    // diterapkan ke master sebelum nominal slip dibaca/dibangun.
    for (const e of employmentEligible) {
      await applyDueSalaryAdjustments(e.id, periodEnd);
    }

    // F-076-S BR-PF-02 + turunan (F-103-V/F-105-V): populasi run =
    // karyawan sefrekuensi; frekuensi lain terlewati-terhitung. WEEKLY
    // kini lolos via agregator BPJS se-masa; sisa gerbang hanya pinjaman
    // aktif tanpa nominal mingguan tersimpan -> "pinjaman" (F-105-V
    // butir 3), TANPA slip dan tanpa nominal di hasil (AC-PF-4/5).
    const classified = classifyPayrollRunPopulation(
      employmentEligible.map((e) => ({
        id: e.id,
        paymentFrequency: e.paymentFrequency ?? "MONTHLY",
        hasActiveLoanWithoutWeeklyInstallment: hasActiveLoanWithoutWeeklyInstallment(
          (e.employeeLoans ?? []).map((loan) => ({
            weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
            remainingAmount: Number(loan.remainingAmount),
          })),
        ),
      })),
      paymentFrequency,
    );
    const runSkips: PayrollRunSkip[] = [
      ...outOfScopeIds.map((employeeId) => ({
        employeeId,
        reason: "cakupan" as const,
        conflictDocumentNo: null,
      })),
      ...gatedOut.map((employeeId) => ({
        employeeId,
        reason: "berhenti" as const,
        conflictDocumentNo: null,
      })),
      ...classified.skips,
    ];
    const eligibleEmployees = employmentEligible.filter((e) =>
      classified.targetIds.includes(e.id),
    );

    // Kenaikan gaji terjadwal yang jatuh tempo sampai akhir periode
    // diterapkan ke master sebelum nominal slip dibaca/dibangun.
    for (const e of eligibleEmployees) {
      await applyDueSalaryAdjustments(e.id, periodEnd);
    }

    // Batch: slip aktif populasi pada jendela rentang run (semua periode —
    // penjaga irisan BR-PF-03 menggantikan kunci period lama; slip minggu
    // ke-2 dalam bulan sama kini LOLOS, yang beririsan ditolak per karyawan
    // menyebut documentNo penabrak, karyawan lain tetap terbit AC-PF-3).
    const rangeStart = new Date(startDateStr);
    const rangeEnd = new Date(endDateStr);
    const existingPayrolls = eligibleEmployees.length === 0
      ? []
      : await prisma.payroll.findMany({
          where: {
            employeeId: { in: eligibleEmployees.map((e) => e.id) },
            status: { notIn: ["cancelled", "canceled"] },
            startDate: { lte: rangeEnd },
            endDate: { gte: new Date(rangeStart.getTime() - 90 * 24 * 60 * 60 * 1000) },
          },
          select: { employeeId: true, startDate: true, endDate: true, status: true, documentNo: true },
        });
    const slipsByEmployee = new Map<number, typeof existingPayrolls>();
    for (const slip of existingPayrolls) {
      if (slip.employeeId == null) continue;
      const arr = slipsByEmployee.get(slip.employeeId) ?? [];
      arr.push(slip);
      slipsByEmployee.set(slip.employeeId, arr);
    }
    const targetIds: number[] = [];
    for (const employee of eligibleEmployees) {
      const conflict = findPayrollRangeConflict(
        slipsByEmployee.get(employee.id) ?? [],
        rangeStart,
        rangeEnd,
      );
      if (conflict) {
        runSkips.push({
          employeeId: employee.id,
          reason: "irisan",
          conflictDocumentNo: conflict.documentNo,
        });
      } else {
        targetIds.push(employee.id);
      }
    }

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
      slug: string | null;
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
      statutorySnapshot: PrismaTypes.InputJsonValue;
      netSalary: number;
      totalAmount: number;
      status: string;
      createdBy: number;
    }[] = [];
    for (let i = 0; i < targetIds.length; i++) {
      const empId = targetIds[i];
      const est = estimations.get(empId);
      if (!est) continue;
      // Plafon Pasal 65 run massal (F-105-V butir 6, ditegakkan ulang
      // vonis F-2026-10-25-023-V §5): basis = upah pembayaran slip ini
      // (grossSalary estimasi: pokok + tunjangan + lembur + apresiasi),
      // BUKAN baseSalary saja; komponen potongan diskresioner ikut ember
      // Pasal 63. Karyawan pelanggar terlewati-terhitung, bukan
      // menggagalkan seluruh run / dipangkas diam-diam.
      if (
        evaluateDeductionCeiling({
          wageBase: est.grossSalary ?? 0,
          loanDeduction: est.loanDeduction ?? 0,
          lateDeduction: est.lateDeduction ?? 0,
          // TASK-018 (4): plafon bulk wajib memasukkan potongan komponen
          // slip ini — sebelumnya 0 sehingga plafon terlampaui senyap.
          componentDeductions: est.deductions ?? 0,
        })
      ) {
        runSkips.push({ employeeId: empId, reason: "plafonPotongan", conflictDocumentNo: null });
        continue;
      }
      const documentNo = docNumbers[i];

      const statutory =
        (est.bpjsHealthEmployee ?? 0) +
        (est.bpjsEmploymentEmployee ?? 0) +
        (est.pph21 ?? 0);
      // Komponen terstruktur: agregat server dari baris tertarik (0 bila
      // tidak ada penugasan — identik perilaku pra-fitur).
      const allowances = est.allowances ?? 0;
      const deductions = est.deductions ?? 0;
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
      // Net pay is never negative: deductions (notably a full-period absence
      // deduction ≈ base salary, plus statutory) can exceed gross. A negative
      // net_salary would let onPayrollPaid credit the bank account a negative
      // amount (the company "receiving" cash from the employee) and corrupt the
      // ledger. Floor at 0.
      const netSalary = Math.max(0, safeSubtract(gross, deds, 0));

      rows.push({
        slug: await nextSlug("payroll", documentNo),
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
        statutorySnapshot: (est.statutorySnapshot ?? {}) as PrismaTypes.InputJsonValue,
        netSalary: netSalary,
        totalAmount: netSalary,
        status: "draft",
        createdBy: Number(user.id),
      });
    }

    // F-076-S audit t_a92d0da1: cek irisan + createMany WAJIB satu transaksi
    // dengan kunci baris karyawan populasi target (FOR UPDATE, urutan id
    // menaik anti-deadlock — pola processPayroll/updatePayroll). Tanpa ini
    // dua run konkuren rentang beririsan tak identik sama-sama lolos baca
    // luar lalu sama-sama createMany (kunci DB hanya menolak rentang persis
    // sama); slip yang masuk sesudah baca luar kini terlewat "irisan" lewat
    // cek ulang di dalam transaksi, karyawan lain tetap terbit. Nomor
    // dokumen urutan yang terbuang untuk karyawan kalah race diterima
    // (celah nomor, bukan dobel bayar). Komponen dibaca ulang dari baris
    // yang benar-benar terbit di transaksi yang sama.
    const published = rows.length === 0
      ? { count: 0, created: [] as { id: number; employeeId: number | null }[] }
      : await prisma.$transaction(async (tx) => {
          const lockIds = [...new Set(rows.map((r) => r.employeeId))].sort((a, b) => a - b);
          await tx.$queryRaw`SELECT id FROM employees WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`;
          const freshByEmployee = new Map<number, typeof existingPayrolls>();
          if (lockIds.length > 0) {
            const fresh = await tx.payroll.findMany({
              where: {
                employeeId: { in: lockIds },
                status: { notIn: ["cancelled", "canceled"] },
                startDate: { lte: rangeEnd },
                endDate: { gte: new Date(rangeStart.getTime() - 90 * 24 * 60 * 60 * 1000) },
              },
              select: { employeeId: true, startDate: true, endDate: true, status: true, documentNo: true },
            });
            for (const slip of fresh) {
              if (slip.employeeId == null) continue;
              const arr = freshByEmployee.get(slip.employeeId) ?? [];
              arr.push(slip);
              freshByEmployee.set(slip.employeeId, arr);
            }
          }
          const keptRows: typeof rows = [];
          for (const row of rows) {
            const conflict = findPayrollRangeConflict(
              freshByEmployee.get(row.employeeId) ?? [],
              rangeStart,
              rangeEnd,
            );
            if (conflict) {
              runSkips.push({
                employeeId: row.employeeId,
                reason: "irisan",
                conflictDocumentNo: conflict.documentNo,
              });
            } else {
              keptRows.push(row);
            }
          }
          if (keptRows.length === 0) return { count: 0, created: [] as { id: number; employeeId: number | null }[] };
          await tx.payroll.createMany({ data: keptRows, skipDuplicates: true });
          const withLines = keptRows.filter(
            (r) => (estimations.get(r.employeeId)?.componentLines.length ?? 0) > 0,
          );
          if (withLines.length === 0) return { count: keptRows.length, created: [] as { id: number; employeeId: number | null }[] };
          const created = await tx.payroll.findMany({
            where: {
              employeeId: { in: withLines.map((r) => r.employeeId) },
              startDate: rangeStart,
              endDate: rangeEnd,
              status: "draft",
            },
            select: { id: true, employeeId: true, componentLines: { select: { id: true } } },
          });
          for (const slip of created) {
            if (slip.componentLines.length > 0 || slip.employeeId == null) continue;
            const lines = estimations.get(slip.employeeId)?.componentLines ?? [];
            if (lines.length === 0) continue;
            await tx.payrollComponentLine.createMany({
              data: lines.map((l) => ({ ...l, payrollId: slip.id })),
            });
          }
          return { count: keptRows.length, created };
        });

    const count = published.count;

    const skippedByReason = countPayrollRunSkips(runSkips);
    const skippedTotal = runSkips.length;
    const scopeSkipped = skippedByReason.cakupan;
    await logActivity(
      "generate",
      "Payroll",
      0,
      scopeSkipped > 0
        ? `Generate massal penggajian periode ${period} (${count} karyawan, frekuensi ${paymentFrequency}, terlewati ${skippedTotal} termasuk ${scopeSkipped} di luar cakupan)`
        : `Generate massal penggajian periode ${period} (${count} karyawan, frekuensi ${paymentFrequency}, terlewati ${skippedTotal})`,
    );
    revalidatePath("/sdm/penggajian");
    // AC-PF-5: hasil memuat count terbit + count terlewati per alasan,
    // TANPA nominal gaji siapa pun.
    return { success: true, count, skippedTotal, skippedByReason };
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

    const employeeId = v.employeeId ?? null;
    const period = v.period;
    const startDate = wibDateToUtcMidnight(v.startDate);
    const endDate = wibDateToUtcMidnight(v.endDate);

    // Guard: employeeId is required — without it, payroll has no linkage
    if (!employeeId) {
      return { success: false, error: "Karyawan wajib dipilih" };
    }

    // BR-HRS-08 (AC-HRS-4): tulis slip untuk karyawan di luar cakupan HR = tolak.
    // Ditegakkan SEBELUM nomor dokumen dibangkitkan supaya penolakan tidak
    // membakar nomor urut PAYROLL (lubang penomoran yang tak bisa dijelaskan).
    await assertPayrollInHrScope(await getHrScope(user), employeeId);

    const documentNo = await generateDocumentNumber("PAYROLL");

    // Kenaikan gaji terjadwal yang sudah jatuh tempo diterapkan ke master
    // lebih dulu, supaya slip periode ini membaca gaji yang benar.
    await applyDueSalaryAdjustments(employeeId, endDate);

    // F-085-S gerbang BR-EMP-06 (Q-EMP-3): bukti berhenti dibaca dari master
    // server (employmentEndedAt), BUKAN flag client. Flag resignationFinal
    // hanya sah bila master membuktikan karyawan sudah berhenti; periode
    // seluruhnya sesudah berhenti tanpa flag = tolak keras pesan §6;
    // periode memotong tanpa flag = wajib konfirmasi tercatat
    // (confirmEmploymentEndedCuttingPeriod) atau jalur final.
    const employeeLifecycle = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        employmentEndedAt: true,
        paymentFrequency: true,
        employeeLoans: {
          where: { status: "active", remainingAmount: { gt: 0 } },
          select: { id: true, weeklyInstallment: true, remainingAmount: true },
        },
      },
    });
    // F-076-S + turunan (F-103-V/F-105-V): period wajib "YYYY-MM" bulan
    // endDate; slip WEEKLY kini dihitung agregator BPJS se-masa. Sisa
    // gerbang: pinjaman aktif tanpa nominal mingguan tersimpan.
    assertPayrollPeriodMatchesEndDate(period, endDate);
    if (
      employeeLifecycle?.paymentFrequency === "WEEKLY" &&
      hasActiveLoanWithoutWeeklyInstallment(
        (employeeLifecycle.employeeLoans ?? []).map((loan) => ({
          weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
          remainingAmount: Number(loan.remainingAmount),
        })),
      )
    ) {
      throw new Error(
        "Slip mingguan untuk karyawan ini ditahan: ada pinjaman aktif tanpa cicilan mingguan tertulis tersimpan (vonis BOT 4 F-105-V). Isi nominal mingguan dari perjanjian tertulis dulu. Slip tidak dibuat.",
      );
    }
    const wantsFinal = formData.get("resignationFinal") === "true";
    if (wantsFinal && !employeeLifecycle?.employmentEndedAt) {
      throw new Error(
        "Penanda berhenti bekerja belum bisa dibuktikan dari data berhenti terverifikasi di server. " +
          "Final berhenti ditolak — gunakan workflow berhenti terverifikasi bila sudah tersedia, atau hitung slip ini tanpa penanda final.",
      );
    }
    const employmentGate = evaluatePayrollEmploymentGate({
      employmentEndedAt: employeeLifecycle?.employmentEndedAt ?? null,
      periodStart: startDate,
      periodEnd: endDate,
      isFinalSlip: wantsFinal,
      confirmCuttingPeriod:
        formData.get("confirmEmploymentEndedCuttingPeriod") === "true",
    });
    if (!employmentGate.allowed) {
      throw new Error(employmentGate.message);
    }
    if (
      employeeLifecycle?.employmentEndedAt &&
      !wantsFinal &&
      formData.get("confirmEmploymentEndedCuttingPeriod") === "true"
    ) {
      await logActivity(
        "payroll_cutting_period_confirmed",
        "Employee",
        employeeId,
        `Konfirmasi slip periode memotong tanggal berhenti ${employeeLifecycle.employmentEndedAt.toISOString().slice(0, 10)} periode ${period}`,
      );
    }

    // F-076-S BR-PF-03: duplikat = irisan rentang slip aktif karyawan sama
    // (bukan period sama), dijaga di dalam transaksi buat (lock baris
    // karyawan FOR UPDATE lebih dulu — pola createLeaveRequest) supaya
    // dua pembuatan bersamaan tidak lolos bersama. Kunci DB pelengkap:
    // @@unique([employeeId, startDate, endDate]).
    const rangeConflict = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;
      return findActivePayrollRangeConflict(tx as typeof prisma, employeeId, startDate, endDate);
    });
    if (rangeConflict) {
      throw new Error(
        `Rentang slip ini beririsan dengan slip ${rangeConflict.documentNo} karyawan yang sama. Hapus atau ubah rentang slip penabrak terlebih dahulu.`,
      );
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

    const componentAssignments = await loadEffectivePayrollAssignments(prisma, [employeeId], endDate);
    const componentLines = buildPayrollComponentLinesFromAssignments(
      componentAssignments.get(employeeId) ?? [],
      endDate,
    );
    const componentSummary = summarizePayrollComponentLines(componentLines);
    const w = await buildPayrollWrite({
      employeeId,
      period,
      endDate,
      resignationFinal: wantsFinal,
      fallbackLabel: "pembuatan slip",
      componentLines,
      v: {
        ...v,
        allowances: componentLines.length > 0 ? componentSummary.allowances : (v.allowances ?? 0),
        deductions: componentLines.length > 0 ? componentSummary.deductions : (v.deductions ?? 0),
        lateDeduction, lateMinutes, workingDays, presentDays, absentDays, absentDeduction,
      },
    });

    const payroll = await prisma.$transaction(async (tx) => {
      // Kunci baris karyawan lalu periksa ulang irisan di dalam transaksi
      // yang sama dengan insert (anti TOCTOU terhadap cek di atas).
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;
      const conflictInTx = await findActivePayrollRangeConflict(
        tx as typeof prisma,
        employeeId,
        startDate,
        endDate,
      );
      if (conflictInTx) {
        throw new Error(
          `Rentang slip ini beririsan dengan slip ${conflictInTx.documentNo} karyawan yang sama. Hapus atau ubah rentang slip penabrak terlebih dahulu.`,
        );
      }
      const created = await tx.payroll.create({
        data: {
        slug: await nextSlug("payroll", documentNo),
        documentNo,
        employeeId,
        period,
        startDate,
        endDate,
        ...w,
        status: "draft",
        createdBy: Number(user.id),
        },
      });
      if (componentLines.length > 0) {
        await tx.payrollComponentLine.createMany({
          data: componentLines.map((l) => ({ ...l, payrollId: created.id })),
        });
      }
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
    // Concurrent insert won the race against the app-level range check
    // (TOCTOU): the DB unique constraint (employeeId, startDate, endDate)
    // rejected the duplicate. Surface the same friendly message.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: "Penggajian untuk karyawan ini pada rentang tanggal tersebut sudah ada.",
      };
    }
    console.error("[processPayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePayroll(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_payroll");

    // Only draft payroll can be edited
    const existing = await prisma.payroll.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "draft") {
      throw new Error("Hanya penggajian status draft yang dapat diubah");
    }

    // BR-HRS-08 (AC-HRS-3): baris LAMA wajib di dalam cakupan sebelum diubah.
    const scope = await getHrScope(user);
    await assertPayrollInHrScope(scope, existing.employeeId ?? null);

    // Migrated to parseFormData(payrollSchema) — the previous hand-parsed path
    // (safeId/period as string/new Date(raw)/safeNumber) bypassed schema
    // validation: blank periods and dates became Invalid Date, non-numeric
    // amounts became NaN, and the period/startDate/endDate required guards
    // were not enforced. Mirrors processPayroll for validation parity.
    const parsed = parseFormData(payrollSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    // F-026 MEDIUM (vonis Bot 4) + F-085-S: flag client BUKAN bukti berhenti.
    // Bukti = Employee.employmentEndedAt server. Flag tanpa bukti = tolak;
    // dengan bukti, update slip draft hanya untuk periode tidak sesudah
    // berhenti (gerbang sama seperti create; slip final lewat processPayroll).
    const wantsFinalUpdate = formData.get("resignationFinal") === "true";
    const updateEmployeeId = v.employeeId ?? existing.employeeId ?? null;
    // BR-HRS-08 (AC-HRS-3): pemindahan slip ke karyawan LAIN juga wajib
    // berada di cakupan — kalau tidak, ubah slip = jalan memindahkan data
    // karyawan luar cakupan ke dalam jangkauan baca.
    if (updateEmployeeId !== existing.employeeId) {
      await assertPayrollInHrScope(scope, updateEmployeeId);
    }
    const updateLifecycle = updateEmployeeId
      ? await prisma.employee.findUnique({
          where: { id: updateEmployeeId },
          select: {
            employmentEndedAt: true,
            paymentFrequency: true,
            employeeLoans: {
              where: { status: "active", remainingAmount: { gt: 0 } },
              select: { id: true, weeklyInstallment: true, remainingAmount: true },
            },
          },
        })
      : null;
    // F-076-S: period wajib "YYYY-MM" bulan endDate (V-PF2-1/5); slip
    // karyawan WEEKLY fail-closed sama seperti processPayroll (V-PF2-4(i),
    // V-PF4-1). Slip draft WEEKLY existing dari masa pra-inti tidak bisa
    // dihitung ulang per-slip sebelum agregator BPJS se-masa tersedia.
    assertPayrollPeriodMatchesEndDate(v.period, wibDateToUtcMidnight(v.endDate));
    if (
      updateLifecycle?.paymentFrequency === "WEEKLY" &&
      hasActiveLoanWithoutWeeklyInstallment(
        (updateLifecycle.employeeLoans ?? []).map((loan) => ({
          weeklyInstallment: loan.weeklyInstallment == null ? null : Number(loan.weeklyInstallment),
          remainingAmount: Number(loan.remainingAmount),
        })),
      )
    ) {
      throw new Error(
        "Slip mingguan untuk karyawan ini ditahan: ada pinjaman aktif tanpa cicilan mingguan tertulis tersimpan (vonis BOT 4 F-105-V). Isi nominal mingguan dari perjanjian tertulis dulu. Slip tidak diubah.",
      );
    }
    if (wantsFinalUpdate && !updateLifecycle?.employmentEndedAt) {
      throw new Error(
        "Penanda berhenti bekerja belum bisa dibuktikan dari data berhenti terverifikasi di server. " +
          "Final berhenti ditolak — gunakan workflow berhenti terverifikasi bila sudah tersedia, atau hitung slip ini tanpa penanda final.",
      );
    }
    // TASK-018 (3): kelas final dibaca dari snapshot slip existing — edit
    // slip final-resign (dengan atau tanpa flag client) mempertahankan
    // perlakuan masa terakhir, tidak turun ke TER bulanan biasa.
    const existingSnapshot = existing.statutorySnapshot as { pph21Ter?: { periodKind?: string } } | null;
    const effectiveResignationFinal =
      wantsFinalUpdate || existingSnapshot?.pph21Ter?.periodKind === "final-resignation";
    if (updateEmployeeId) {
      const gate = evaluatePayrollEmploymentGate({
        employmentEndedAt: updateLifecycle?.employmentEndedAt ?? null,
        periodStart: wibDateToUtcMidnight(v.startDate),
        periodEnd: wibDateToUtcMidnight(v.endDate),
        isFinalSlip: effectiveResignationFinal,
        confirmCuttingPeriod:
          formData.get("confirmEmploymentEndedCuttingPeriod") === "true",
      });
      if (!gate.allowed) throw new Error(gate.message);
    }

    const employeeId = v.employeeId ?? null;
    const startDate = wibDateToUtcMidnight(v.startDate);
    const endDate = wibDateToUtcMidnight(v.endDate);

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

    const existingLines = await prisma.payrollComponentLine.findMany({
      where: { payrollId: id },
      orderBy: { componentId: "asc" },
    });
    const lineSummary = summarizePayrollComponentLines(existingLines);
    const w = await buildPayrollWrite({
      employeeId,
      period: v.period,
      excludePayrollId: id,
      resignationFinal: effectiveResignationFinal,
      endDate,
      fallbackLabel: "update slip",
      componentLines: existingLines.length > 0 ? existingLines : undefined,
      v: {
        ...v,
        allowances: existingLines.length > 0 ? lineSummary.allowances : (v.allowances ?? 0),
        deductions: existingLines.length > 0 ? lineSummary.deductions : (v.deductions ?? 0),
        lateDeduction, lateMinutes, workingDays, presentDays, absentDays, absentDeduction,
      },
    });

    const payroll = await prisma.$transaction(async (tx) => {
      // F-076-S BR-PF-03: kunci baris karyawan + periksa irisan (di luar
      // slip ini sendiri) di transaksi sama dengan update — rentang hasil
      // edit tidak boleh menabrak slip aktif lain karyawan sama.
      if (updateEmployeeId) {
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${updateEmployeeId} FOR UPDATE`;
        const conflictInTx = await findActivePayrollRangeConflict(
          tx as typeof prisma,
          updateEmployeeId,
          startDate,
          endDate,
          id,
        );
        if (conflictInTx) {
          throw new Error(
            `Rentang slip ini beririsan dengan slip ${conflictInTx.documentNo} karyawan yang sama. Hapus atau ubah rentang slip penabrak terlebih dahulu.`,
          );
        }
      }
      return tx.payroll.update({
        where: { id },
        data: {
          slug: await nextSlug("payroll", existing.documentNo, { excludeId: id }),
          employeeId,
          costCenterId: v.costCenterId ?? null,
          period: v.period,
          startDate,
          endDate,
          ...w,
        },
      });
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

    // BR-HRS-08 (AC-HRS-5): menyetujui slip = tindakan atas data karyawan;
    // cakupan HR ditegakkan sebelum klaim status.
    await assertPayrollInHrScope(await getHrScope(user), payroll.employeeId ?? null);

    if (payroll.status !== "draft") {
      throw new Error("Payroll hanya bisa di-approve dari status draft");
    }

    // AUD-HRM-01: tolak approve bila slip dihitung dengan fallback 2024.
    // Fallback = tabel kosong/gagal baca = ruleset belum tervalidasi untuk
    // periode ini. Approve = finalisasi angka pajak/BPJS — angka 2024 yang
    // lolos diam-diam adalah kesalahan gaji massal. Snapshot menyimpan
    // fromFallback persis untuk gate ini.
    // TASK-018 (2): gerbang statutori bersama — pemeriksaan yang sama
    // ditegakkan jalur generik (approveStep) dan markPayrollPaid.
    const gateError = payrollStatutoryGateError(payroll.statutorySnapshot);
    if (gateError) throw new Error(gateError);

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
    const user = await requirePermission("process_payroll");

    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
    });

    // BR-HRS-08 (AC-HRS-5): membayar slip di luar cakupan HR = tolak sebelum
    // gerbang workflow/status, supaya nol jurnal & nol amortisasi pinjaman.
    await assertPayrollInHrScope(await getHrScope(user), payroll.employeeId ?? null);

    // Approval workflow gate: if a Payroll workflow is configured, it must
    // be fully approved before marking as paid.
    await assertApproved("Payroll", payrollId);

    if (payroll.status !== "approved") {
      throw new Error(
        "Payroll hanya bisa ditandai dibayar dari status approved",
      );
    }

    // TASK-018 (2): slip yang ter-approve lewat workflow generik tidak
    // melewati gerbang approvePayroll — tegakkan gerbang yang sama di sini
    // sebelum status/paid + jurnal terjadi.
    const paidGateError = payrollStatutoryGateError(payroll.statutorySnapshot);
    if (paidGateError) throw new Error(paidGateError);
    // Vonis F-2026-10-25-023-V §5 (AC-LSV-2): plafon Pasal 65 ditegakkan
    // juga SAAT DIBAYAR atas angka slip tersimpan — slip warisan/draft lama
    // yang lolos sebelum gerbang susun tidak boleh membayar potongan
    // Pasal 63 menembus 50% upah pembayaran ini. Pelanggaran = tolak
    // berisik sebelum klaim status: nol jurnal, nol amortisasi pinjaman,
    // sisa pokok tidak berubah (bukan dipangkas diam-diam, bukan denda).
    const paidCeilingBreach = evaluateDeductionCeiling({
      wageBase: Number(payroll.grossSalary),
      loanDeduction: Number(payroll.loanDeduction),
      lateDeduction: Number(payroll.lateDeduction),
      componentDeductions: Number(payroll.deductions),
    });
    if (paidCeilingBreach) {
      throw new Error(
        `Total potongan Pasal 63 (cicilan pinjaman + denda + komponen potongan) Rp${paidCeilingBreach.totalDeductions.toLocaleString("id-ID")} melebihi plafon 50% upah slip ini Rp${paidCeilingBreach.ceiling.toLocaleString("id-ID")} (PP 36/2021 Pasal 65) — pembayaran ditolak. Hitung ulang slip, jangan dibayar menembus plafon.`,
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
        // TASK-018 (6): amortisasi membaca snapshot slip (budget =
        // payroll.loanDeduction), BUKAN nominal cicilan master yang bisa
        // berubah sesudah slip terbit — jurnal onPayrollPaid mengkredit
        // Piutang sebesar snapshot yang sama, jadi plafon cicilan master
        // berjalan membuat subledger menyimpang dari jurnal (slip Rp500rb
        // vs master Rp300rb menyisakan selisih Rp200rb). Alokasi tertua
        // dulu, tercap sisa utang per pinjaman saja.
        let budget = Number(payroll.loanDeduction);
        const updates: Promise<unknown>[] = [];
        for (const loan of activeLoans) {
          if (budget <= 0) break;
          const remaining = Number(loan.remainingAmount);
          if (remaining <= 0) continue;
          const applied = Math.min(remaining, budget);
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

      // F-2026-10-24-132-V Putusan 5: peristiwa kompensasi PKWT yang barisnya
      // ada di slip ini menjadi paid dalam tx yang sama (satu peristiwa satu
      // baris terbayar; status peristiwa terpisah dari status slip).
      const pkwtLineRows = await tx.payrollComponentLine.findMany({
        where: { payrollId, pkwtEventId: { not: null } },
        select: { pkwtEventId: true },
      });
      for (const row of pkwtLineRows) {
        if (row.pkwtEventId != null) {
          await markPkwtEventPaid(tx, row.pkwtEventId, payrollId);
        }
      }
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

/**
 * HR-BR-005 (F-2026-10-28-133-S P2-P6/BR-HRCR-01..09 + vonis F-2026-10-28-135-V
 * §2a-d): koreksi slip gaji `paid` = dokumen koreksi tertaut, bukan
 * edit/hapus. Slip asal tetap `paid` nilainya tak ditimpa; slip koreksi baru
 * (angka PENUH yang benar, bukan delta) tertaut `correctsPayrollId` dua arah.
 * Urutan atomik SATU transaksi: reversal jurnal asal → kembalikan amortisasi
 * pinjaman → buat slip koreksi dari tanggal terbuka → jurnal koreksi.
 * Periode asal terkunci = tolak (P6); periode koreksi wajib terbuka.
 * Pesan galat menyebut nomor dokumen saja, tanpa nominal gaji (P8/pola 117-S).
 */
export async function correctPaidPayroll(
  payrollId: number,
  formData: FormData,
) {
  try {
    const user = await requirePermission("process_payroll");

    const cleanReason = String(formData.get("reason") ?? "").trim();
    if (!cleanReason) {
      return { success: false, error: "Alasan koreksi wajib diisi." };
    }

    const userId = Number((user as { id: unknown }).id);

    const source = await prisma.payroll.findUniqueOrThrow({ where: { id: payrollId } });
    if (source.status !== "paid") {
      return {
        success: false,
        error: `Slip ${source.documentNo} berstatus '${source.status}' — hanya slip paid yang dapat dikoreksi lewat dokumen koreksi.`,
      };
    }

    await assertPayrollInHrScope(await getHrScope(user), source.employeeId ?? null);

    // BR-HRCR-10: slip sumber kompensasi PKWT yang sudah dibayar/diubah status
    // menahan koreksi; pesan menyebut nomor dokumen penahan.
    const blockingEvent = await prisma.pkwtCompensationEvent.findFirst({
      where: {
        paidPayrollId: payrollId,
        status: { notIn: ["draft"] },
      },
      select: { id: true, status: true },
    });
    if (blockingEvent) {
      return {
        success: false,
        error: `Slip ${source.documentNo} menahan peristiwa kompensasi PKWT #${blockingEvent.id} berstatus '${blockingEvent.status}' — batalkan/ubah peristiwa itu dulu sebelum mengoreksi slip.`,
      };
    }

    // Tanggal koreksi: hari ini WIB (periode berjalan/terbuka, vonis 135-V §2b).
    // Periode asal beku sebagai histori; jurnal lawan memakai assertPeriodOpen
    // tanggal asli pola reversal existing (135-V §2b).
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const correctionDate = new Date(
      Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 0, 0, 0),
    );
    await assertPeriodOpen(correctionDate);

    // Nilai koreksi dibaca dari dokumen sumber SERVER (nonzero = angka penuh
    // yang benar), BUKAN dari field client — client hanya kirim alasan.
    // Baris komponen diklon dari slip asal supaya rekap periode koreksi
    // berdiri sendiri; netto dihitung ulang mesin yang sama.
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.payroll.findUniqueOrThrow({ where: { id: payrollId } });
      if (fresh.status !== "paid") {
        throw new Error(
          `Slip ${fresh.documentNo} berstatus '${fresh.status}' — hanya slip paid yang dapat dikoreksi lewat dokumen koreksi.`,
        );
      }
      const dup = await tx.payroll.findFirst({
        where: { correctsPayrollId: payrollId },
        select: { id: true, documentNo: true },
      });
      if (dup) {
        throw new Error(
          `Slip ${fresh.documentNo} sudah memiliki dokumen koreksi ${dup.documentNo} — koreksi kedua ditolak.`,
        );
      }

      // (1) Jurnal lawan atas jurnal asal (assertPeriodOpen tanggal asli di
      // dalam helper; periode terkunci = throw = rollback nol mutasi).
      await reverseJournalsByReferenceTx(tx, "Payroll", payrollId, cleanReason, userId);

      // (2) Amortisasi pinjaman DIBALIKKAN lewat dokumen (135-V §2a pola T7,
      // bukan update manual): kembalikan remainingAmount sebesar porsi yang
      // dulu diamortisasi slip ini. Distribusi tertua-dulu, dicap sisa utang
      // per pinjaman — cermin alokasi markPayrollPaid (min(sisa,budget)).
      const amortized = Number(fresh.loanDeduction) || 0;
      let restored = 0;
      if (fresh.employeeId != null && amortized > 0) {
        const loans = await tx.employeeLoan.findMany({
          where: { employeeId: fresh.employeeId },
          orderBy: { loanDate: "asc" },
        });
        let budget = amortized;
        for (const loan of loans) {
          if (budget <= 0) break;
          const remaining = Number(loan.remainingAmount) || 0;
          if (remaining <= 0) continue;
          const applied = Math.min(remaining, budget);
          if (applied <= 0) continue;
          const nextRemaining = safeAdd(Number(loan.remainingAmount), applied, 0);
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: {
              remainingAmount: nextRemaining,
              status: nextRemaining <= 0 ? "paid_off" : "active",
            },
          });
          budget = safeSubtract(budget, applied, 0);
          restored = safeAdd(restored, applied, 0);
        }
      }

      // (3) Slip koreksi: angka penuh slip asal, tetapi rentang + periode =
      // periode TERBUKA (135-V §2b), bukan salinan rentang asal — salinan
      // persis selalu P2002 pada uq_payroll_employee_range karena slip asal
      // tetap ada sebagai `paid` (status pemblokir irisan). Acuan periode
      // asal yang eksplisit = tautan `correctsPayrollId` (dua arah) +
      // `correctionReason`; status langsung paid karena koreksi atas
      // pembayaran yang sudah terjadi.
      const correctionPeriod = `${correctionDate.getUTCFullYear()}-${String(correctionDate.getUTCMonth() + 1).padStart(2, "0")}`;
      const correctionStart = new Date(
        Date.UTC(correctionDate.getUTCFullYear(), correctionDate.getUTCMonth(), 1, 0, 0, 0),
      );
      const documentNo = await generateDocumentNumber("PAYROLL");
      const correction = await tx.payroll.create({
        data: {
          slug: await nextSlug("payroll", documentNo),
          documentNo,
          employeeId: fresh.employeeId,
          period: correctionPeriod,
          type: fresh.type,
          startDate: correctionStart,
          endDate: correctionDate,
          baseSalary: fresh.baseSalary,
          allowances: fresh.allowances,
          deductions: fresh.deductions,
          overtimeTotal: fresh.overtimeTotal,
          appreciationTotal: fresh.appreciationTotal,
          loanDeduction: fresh.loanDeduction,
          lateDeduction: fresh.lateDeduction,
          grossSalary: fresh.grossSalary,
          bpjsHealthEmployee: fresh.bpjsHealthEmployee,
          bpjsEmploymentEmployee: fresh.bpjsEmploymentEmployee,
          pph21: fresh.pph21,
          statutorySnapshot: fresh.statutorySnapshot as never,
          lateMinutes: fresh.lateMinutes,
          workingDays: fresh.workingDays,
          presentDays: fresh.presentDays,
          absentDays: fresh.absentDays,
          absentDeduction: fresh.absentDeduction,
          netSalary: fresh.netSalary,
          totalAmount: fresh.totalAmount,
          paymentDate: correctionDate,
          costCenterId: fresh.costCenterId,
          status: "paid",
          approvedBy: userId,
          createdBy: userId,
          correctsPayrollId: payrollId,
          correctionReason: cleanReason,
        },
      });

      const sourceLines = await tx.payrollComponentLine.findMany({
        where: { payrollId },
      });
      if (sourceLines.length > 0) {
        await tx.payrollComponentLine.createMany({
          data: sourceLines.map((l) => ({
            payrollId: correction.id,
            componentId: l.componentId,
            componentNameSnapshot: l.componentNameSnapshot,
            kindSnapshot: l.kindSnapshot,
            recurrenceSnapshot: l.recurrenceSnapshot,
            isTaxableSnapshot: l.isTaxableSnapshot,
            source: l.source,
            assignmentId: l.assignmentId,
            accountIdSnapshot: l.accountIdSnapshot,
            amount: l.amount,
            pkwtEventId: l.pkwtEventId,
            pkwtSettledViaAccrual: l.pkwtSettledViaAccrual,
          })),
        });
      }

      // (4) Jurnal koreksi atas dokumen BARU (referenceId baru, bukan re-post
      // payrollId asal — 135-V §Interaksi T5/B3). Filter REVERSED di
      // onPayrollPaid membuka jalan re-post yang benar; jurnal asal yang kini
      // REVERSED = histori, bukan pemblokir.
      await onPayrollPaid(correction.id, userId, tx as never);

      return { correctionId: correction.id, restored };
    });

    await logActivity(
      "correct",
      "Payroll",
      payrollId,
      `Koreksi slip ${source.documentNo}: ${cleanReason}`,
      {
        correctsPayrollId: payrollId,
        correctionId: result.correctionId,
        reason: cleanReason,
        correctedBy: userId,
      },
    );
    revalidatePath("/sdm/penggajian");
    revalidatePath(`/sdm/penggajian/${payrollId}`);
    return { success: true, id: result.correctionId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    // P2002 berisik tanpa nominal gaji: koreksi memakai rentang periode
    // terbuka; bila slip koreksi lain sudah terbit di rentang itu (balap/
    // rentang bentrok nyata), tolak tanpa menyebut nominal dokumen lawan.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: `Slip nomor ${payrollId} tidak dapat dikoreksi: sudah ada slip pada rentang periode koreksi. Koreksi hanya lewat satu dokumen koreksi.`,
      };
    }
    console.error("[correctPaidPayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== EMPLOYEE LOAN ACTIONS ====================

export async function createEmployeeLoan(formData: FormData) {
  try {
    // F-2026-10-25-018-S Q-LS-1 (Putusan Lead F-2026-10-25-026-L): SATU aksi,
    // DUA pintu izin. Jalur staf/titipan = create_loans (perilaku existing,
    // nol berubah). Jalur mandiri = create_employee_loan_requests — pemegang
    // key ini (tanpa create_loans) HANYA boleh mengajukan untuk employee
    // tertaut dirinya sendiri; scope self di bawah menegakkannya di server.
    // update/deleteEmployeeLoan tetap digerbang create_loans saja.
    const user = await requireAnyPermission([
      "create_loans",
      "create_employee_loan_requests",
    ]);
    const userPerms: string[] = Array.isArray(
      (user as { permissions?: unknown }).permissions,
    )
      ? [...((user as { permissions: string[] }).permissions)]
      : [];
    const userRoles: string[] = Array.isArray(
      (user as { roles?: unknown }).roles,
    )
      ? [...((user as { roles: string[] }).roles)]
      : [];
    // super_admin melewati requireAnyPermission tanpa perlu memegang key
    // mana pun — ia jalur staf, bukan mandiri.
    const isSelfServiceOnly =
      !userRoles.includes("super_admin") &&
      !userPerms.includes("create_loans") &&
      userPerms.includes("create_employee_loan_requests");

    const parsed = parseFormData(employeeLoanSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const employeeId = v.employeeId;

    const scope = await getHrScope(user);
    // Pintu mandiri: walau peran lain memberi scope department/all, key
    // pengajuan saja tidak pernah membuka pengajuan untuk orang lain.
    // Scope `all` tidak membawa employeeId, jadi tautan user→employee
    // diselesaikan langsung di sini (tautan yang sama dengan getHrScope).
    if (isSelfServiceOnly) {
      const ownEmployeeId =
        scope.kind === "all"
          ? (
              await prisma.employee.findFirst({
                where: { userId: Number(user.id) },
                select: { id: true },
              })
            )?.id ?? -1
          : scope.employeeId;
      if (ownEmployeeId !== employeeId) {
        throw new Error("Pengajuan mandiri hanya untuk diri sendiri");
      }
    }
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
          slug: await nextSlug("employeeLoan", `pinjaman-${v.loanDate}`),
          employeeId: v.employeeId,
          loanDate: wibDateToUtcMidnight(v.loanDate),
          totalAmount,
          monthlyInstallment: v.monthlyInstallment,
          weeklyInstallment: v.weeklyInstallment ?? null,
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

/**
 * F-2026-10-21-019: validasi konteks timesheet SEBELUM tulis — XOR tepat satu
 * konteks (helper murni), konteks WO menunjuk WO nyata yang belum
 * selesai/batal, dan taskId hanya menempel pada proyek pemiliknya.
 * Mengembalikan error siap tampil, atau null bila sah.
 */
async function timesheetContextGuard(v: {
  projectId?: number | null;
  workOrderId?: number | null;
  taskId?: number | null;
}): Promise<{ success: false; error: string } | null> {
  const xorError = timesheetContextError(v);
  if (xorError) return { success: false, error: xorError };

  if (v.workOrderId != null) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: v.workOrderId },
      select: { id: true, status: true },
    });
    if (!wo) return { success: false, error: "Perintah kerja tidak ditemukan" };
    const closed = closedWorkOrderError(wo.status, "dicatat");
    if (closed) return { success: false, error: closed };
  }

  if (v.taskId != null) {
    const task = await prisma.task.findUnique({
      where: { id: v.taskId },
      select: { id: true, projectId: true },
    });
    if (!task) return { success: false, error: "Tugas tidak ditemukan" };
    if (task.projectId !== v.projectId) {
      return { success: false, error: "Tugas tidak termasuk dalam proyek ini." };
    }
  }
  return null;
}

export async function createTimesheet(formData: FormData) {
  try {
    const user = await requirePermission("create_timesheets");
    const scope = await getHrScope(user);

    const parsed = parseFormData(timesheetSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;
    await assertHrEmployeeAccess(scope, v.employeeId);

    const contextError = await timesheetContextGuard(v);
    if (contextError) return contextError;

    const timesheet = await prisma.timesheet.create({
      data: {
        slug: await nextSlug("timesheet", `lembar-waktu-${v.date}`),
        ...timesheetWriteData(v),
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
 * Laporan saldo cuti tahunan karyawan dalam scope HR pemanggil
 * (F-2026-10-25-013-S). Agregasi di builder murni
 * `src/lib/reports/leave-balance.ts` lewat loader
 * `leave-balance-data.ts`; angka kuota tetap dari `getLeaveQuota`.
 * Filter departemen hanya menyempitkan scope (AC-LVB-B1); komponen
 * pending terpisah lapis tampil saja (BR-LVB-12); karyawan nonaktif
 * tahun berjalan tampil tertanda (BR-LVB-13).
 */
export async function getAllLeaveBalances(
  year?: number,
  opts?: { departmentId?: number | null },
) {
  try {
    const user = await requirePermission("view_leave_requests");
    const targetYear = year ?? new Date().getFullYear();
    if (!Number.isSafeInteger(targetYear) || targetYear < 1900 || targetYear > 2200) {
      return { success: false as const, error: "Tahun tidak valid", balances: [] };
    }
    if (
      opts?.departmentId != null &&
      (!Number.isSafeInteger(opts.departmentId) || opts.departmentId <= 0)
    ) {
      return { success: false as const, error: "Departemen tidak valid", balances: [] };
    }
    const scope = await getHrScope({
      id: String(user.id),
      roles: Array.isArray(user.roles) ? [...user.roles] : [],
    });

    const report = await loadLeaveBalanceReport(scope, targetYear, {
      departmentId: opts?.departmentId ?? null,
    });

    return {
      success: true as const,
      year: targetYear,
      // Visibilitas kolom identitas mengikuti scope efektif (BR-LVB-14),
      // bukan izin edit/delete — diputus server, UI tinggal membaca.
      scopeKind: scope.kind,
      showIdentityColumns: scope.kind !== "self",
      totals: report.totals,
      balances: report.rows,
    };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getAllLeaveBalances]", getErrorMessage(e) || e);
    return {
      success: false as const,
      error: getErrorMessage(e, "Terjadi kesalahan"),
    };
  }
}

/**
 * Ekspor CSV laporan saldo cuti (F-2026-10-25-013-S BR-LVB-11, AC-LVB-B4):
 * isi persis baris+kolom yang terlihat pemanggil sesudah scope+filter
 * departemen; gerbang izin sama dengan halaman (`view_leave_requests`).
 * Mengembalikan teks CSV + nama berkas bertahun; pengunduhan berkas
 * adalah urusan konsumen (Frontend), server tidak menulis berkas.
 */
export async function exportLeaveBalancesCsv(
  year?: number,
  opts?: { departmentId?: number | null },
) {
  try {
    const user = await requirePermission("view_leave_requests");
    const targetYear = year ?? new Date().getFullYear();
    if (!Number.isSafeInteger(targetYear) || targetYear < 1900 || targetYear > 2200) {
      return { success: false as const, error: "Tahun tidak valid" };
    }
    if (
      opts?.departmentId != null &&
      (!Number.isSafeInteger(opts.departmentId) || opts.departmentId <= 0)
    ) {
      return { success: false as const, error: "Departemen tidak valid" };
    }
    const scope = await getHrScope({
      id: String(user.id),
      roles: Array.isArray(user.roles) ? [...user.roles] : [],
    });
    const report = await loadLeaveBalanceReport(scope, targetYear, {
      departmentId: opts?.departmentId ?? null,
    });
    const { csv, fileName } = buildLeaveBalanceCsv(report);
    return { success: true as const, year: targetYear, csv, fileName };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[exportLeaveBalancesCsv]", getErrorMessage(e) || e);
    return {
      success: false as const,
      error: getErrorMessage(e, "Terjadi kesalahan"),
    };
  }
}

// ==================== KALENDER KERJA (hari libur & jadwal kerja) ====================

/**
 * Hari libur (nasional/perusahaan), hari libur per departemen, dan jadwal kerja.
 *
 * Ketiga tabel ini adalah satu-satunya sumber yang dibaca perhitungan absensi dan
 * sisa cuti (`daily-attendance.service`, `attendance-summary.service`,
 * `leave-quota.service`, `hrm.actions` sendiri), tetapi sebelumnya TIDAK punya
 * jalur tulis sama sekali — hanya skrip seed. Akibatnya absensi dan hari kerja
 * hanya benar pada basis data yang di-seed.
 *
 * Ironi yang perlu dicatat: penghapusan massalnya sudah ada sejak dulu
 * (`bulk.actions.ts` memetakan `holiday`, `departmentHoliday`, dan `workSchedule`
 * ke `delete_holidays`/`delete_work_schedules`) — jadi aplikasi bisa menghapus
 * baris yang tidak bisa dibuat.
 */

/** Id numerik (dari pemanggilan aksi, bukan FormData) yang harus bilangan positif. */
function requirePositiveId(id: number, label: string): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Id ${label} tidak valid`);
  }
  return id;
}

export async function createHoliday(formData: FormData) {
  try {
    await requirePermission("create_holidays");
    const parsed = parseFormData(holidaySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const holiday = await prisma.holiday.create({
      data: {
        name: v.name,
        date: wibDateToUtcMidnight(v.date),
        description: v.description ?? null,
      },
    });

    await logActivity("create", "Holiday", holiday.id, `Menambah hari libur ${v.name}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const, id: holiday.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateHoliday(id: number, formData: FormData) {
  try {
    await requirePermission("edit_holidays");
    const parsed = parseFormData(holidaySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.holiday.update({
      where: { id: requirePositiveId(id, "hari libur") },
      data: {
        name: v.name,
        date: wibDateToUtcMidnight(v.date),
        description: v.description ?? null,
      },
    });

    await logActivity("update", "Holiday", id, `Mengubah hari libur ${v.name}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteHoliday(id: number) {
  try {
    await requirePermission("delete_holidays");
    await prisma.holiday.delete({ where: { id: requirePositiveId(id, "hari libur") } });
    await logActivity("delete", "Holiday", id, `Menghapus hari libur #${id}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createDepartmentHoliday(formData: FormData) {
  try {
    await requirePermission("create_holidays");
    const parsed = parseFormData(departmentHolidaySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const holiday = await prisma.departmentHoliday.create({
      data: {
        departmentId: v.departmentId,
        name: v.name,
        date: wibDateToUtcMidnight(v.date),
      },
    });

    await logActivity(
      "create",
      "DepartmentHoliday",
      holiday.id,
      `Menambah hari libur departemen ${v.name}`,
    );
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const, id: holiday.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createDepartmentHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateDepartmentHoliday(id: number, formData: FormData) {
  try {
    await requirePermission("edit_holidays");
    const parsed = parseFormData(departmentHolidaySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.departmentHoliday.update({
      where: { id: requirePositiveId(id, "hari libur departemen") },
      data: {
        departmentId: v.departmentId,
        name: v.name,
        date: wibDateToUtcMidnight(v.date),
      },
    });

    await logActivity(
      "update",
      "DepartmentHoliday",
      id,
      `Mengubah hari libur departemen ${v.name}`,
    );
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateDepartmentHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteDepartmentHoliday(id: number) {
  try {
    await requirePermission("delete_holidays");
    await prisma.departmentHoliday.delete({
      where: { id: requirePositiveId(id, "hari libur departemen") },
    });
    await logActivity("delete", "DepartmentHoliday", id, `Menghapus hari libur departemen #${id}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteDepartmentHoliday]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createWorkSchedule(formData: FormData) {
  try {
    await requirePermission("create_work_schedules");
    const parsed = parseFormData(workScheduleSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const schedule = await prisma.workSchedule.create({
      data: {
        name: v.name,
        // Bentuk "0-6 dipisah koma" — sama dengan yang diurai layanan absensi.
        workDays: v.workDays,
        startTime: v.startTime,
        endTime: v.endTime,
        isActive: v.isActive ?? true,
      },
    });

    await logActivity("create", "WorkSchedule", schedule.id, `Menambah jadwal kerja ${v.name}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const, id: schedule.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createWorkSchedule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateWorkSchedule(id: number, formData: FormData) {
  try {
    await requirePermission("edit_work_schedules");
    const parsed = parseFormData(workScheduleSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.workSchedule.update({
      where: { id: requirePositiveId(id, "jadwal kerja") },
      data: {
        name: v.name,
        workDays: v.workDays,
        startTime: v.startTime,
        endTime: v.endTime,
        isActive: v.isActive ?? true,
      },
    });

    await logActivity("update", "WorkSchedule", id, `Mengubah jadwal kerja ${v.name}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateWorkSchedule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteWorkSchedule(id: number) {
  try {
    await requirePermission("delete_work_schedules");
    const scheduleId = requirePositiveId(id, "jadwal kerja");
    // M2M penugasan karyawan/departemen ON DELETE CASCADE: hapus tanpa guard
    // mencabut jadwal dari semua yang ditugaskan diam-diam, lalu resolusi
    // absensi jatuh ke jadwal lain/global tanpa peringatan.
    const schedule = await prisma.workSchedule.findUnique({
      where: { id: scheduleId },
      select: { _count: { select: { employees: true, departments: true } } },
    });
    if (!schedule) return { success: false as const, error: "Jadwal kerja tidak ditemukan" };
    const { employees, departments } = schedule._count;
    if (employees > 0 || departments > 0) {
      return {
        success: false as const,
        error: `Jadwal kerja masih ditugaskan ke ${employees} karyawan dan ${departments} departemen. Lepas penugasan terlebih dahulu.`,
      };
    }
    await prisma.workSchedule.delete({ where: { id: scheduleId } });
    await logActivity("delete", "WorkSchedule", id, `Menghapus jadwal kerja #${id}`);
    revalidatePath("/sdm/kalender-kerja");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteWorkSchedule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Jadwal kerja efektif seorang karyawan: milik karyawan sendiri, lalu milik
 * departemennya, lalu jadwal global tanpa penugasan — urutan yang sama dengan
 * `getDailyAttendanceMetrics`. Tanpa jadwal, keterlambatan tidak bisa dihitung,
 * dan itu harus dikatakan — bukan diam-diam dicatat sebagai 0.
 */
async function resolveEffectiveSchedule(
  employeeId: number,
  db: PrismaTypes.TransactionClient | typeof prisma = prisma,
) {
  const select = { startTime: true, endTime: true } as const
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      workSchedules: { where: { isActive: true }, orderBy: { id: "asc" }, take: 1, select },
      department: {
        select: {
          workSchedules: { where: { isActive: true }, orderBy: { id: "asc" }, take: 1, select },
        },
      },
    },
  })
  if (!employee) return null
  return (
    employee.workSchedules[0] ??
    employee.department?.workSchedules[0] ??
    (await db.workSchedule.findFirst({
      where: { isActive: true, employees: { none: {} }, departments: { none: {} } },
      orderBy: { id: "asc" },
      select,
    }))
  )
}

type AttendanceInput = {
  employeeId: number
  date: string
  checkIn?: string
  checkOut?: string
  status: string
  notes?: string
}

/**
 * Menyusun nilai yang DISIMPAN. `lateMinutes` adalah kolom yang dibaca
 * `calculateLatePenalty` dan `getDailyAttendanceMetrics`, jadi perhitungannya
 * memakai satu jalur: `computeLateMinutes` dari `attendance-time`.
 *
 * Status TIDAK ditimpa dari hasil hitungan: pembaca memperlakukan
 * "status late ATAU lateMinutes > 0" sebagai terlambat, sehingga menandai
 * seorang karyawan "present" dengan lateMinutes 60 tetap terbaca terlambat —
 * dan pilihan status milik pengguna tidak diubah diam-diam.
 */
async function buildAttendanceData(
  input: AttendanceInput,
  db: PrismaTypes.TransactionClient | typeof prisma = prisma,
) {
  const schedule = await resolveEffectiveSchedule(input.employeeId, db)
  if (!schedule && input.checkIn) {
    throw new Error(
      "Karyawan ini belum punya jadwal kerja aktif — buat jadwal kerja lebih dulu " +
        "supaya keterlambatan bisa dihitung dari jam masuk.",
    )
  }
  const checkIn = input.checkIn ? wibTimeToUtcInstant(input.date, input.checkIn) : null
  const checkOut = input.checkOut ? wibTimeToUtcInstant(input.date, input.checkOut) : null
  return {
    date: wibDateToUtcMidnight(input.date),
    checkIn,
    checkOut,
    lateMinutes: schedule ? computeLateMinutes(schedule.startTime, checkIn) : 0,
    overtimeMinutes: schedule ? computeOvertimeMinutes(schedule.endTime, checkOut) : 0,
    status: input.status,
    notes: input.notes ?? null,
    overtimeApproved: false,
  }
}

export async function createAttendance(formData: FormData) {
  try {
    const user = await requirePermission("create_attendance");
    const parsed = parseFormData(attendanceSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const scope = await getHrScope(user);
    await assertHrEmployeeAccess(scope, v.employeeId);

    const data = await buildAttendanceData(v);
    const attendance = await prisma.attendance.create({
      data: { employeeId: v.employeeId, ...data },
    });

    await logActivity(
      "create",
      "Attendance",
      attendance.id,
      `Mencatat absensi karyawan #${v.employeeId} tanggal ${v.date} (${v.status}, terlambat ${data.lateMinutes} menit)`,
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const, id: attendance.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    // Batasan unik (karyawan, tanggal): absensi hari yang sama tidak boleh dobel.
    if ((e as { code?: string })?.code === "P2002") {
      return {
        success: false as const,
        error: "Absensi karyawan untuk tanggal itu sudah ada — ubah yang sudah tercatat.",
      };
    }
    console.error("[createAttendance]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAttendance(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_attendance");
    const parsed = parseFormData(attendanceSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;
    const attendanceId = requirePositiveId(id, "absensi");

    const existing = await prisma.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
      select: { employeeId: true },
    });

    const scope = await getHrScope(user);
    await assertHrEmployeeAccess(scope, existing.employeeId);
    // Karyawan baru (bila dipindah) juga harus dalam jangkauan akses.
    if (v.employeeId !== existing.employeeId) {
      await assertHrEmployeeAccess(scope, v.employeeId);
    }

    const data = await buildAttendanceData(v);
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { employeeId: v.employeeId, ...data },
    });

    await logActivity(
      "update",
      "Attendance",
      attendanceId,
      `Mengubah absensi karyawan #${v.employeeId} tanggal ${v.date} (${v.status}, terlambat ${data.lateMinutes} menit)`,
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    if ((e as { code?: string })?.code === "P2002") {
      return {
        success: false as const,
        error: "Karyawan itu sudah punya absensi pada tanggal tersebut.",
      };
    }
    console.error("[updateAttendance]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAttendance(id: number) {
  try {
    await requirePermission("manage_attendance");
    await prisma.attendance.delete({ where: { id: requirePositiveId(id, "absensi") } });
    await logActivity("delete", "Attendance", id, `Menghapus absensi #${id}`);
    revalidatePath("/sdm/absensi");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAttendance]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


// ==================== ATTENDANCE CORRECTION (F-2026-10-25-010-S) ====================
// Putusan Lead Q-AC-1/2/3 2026-10-26 + vonis Accountant F-2026-10-25-013-V:
// pengajuan karyawan TIDAK mengubah rekod Attendance; hanya persetujuan yang
// menulis rekod induk — dalam SATU $transaction memakai semantik
// buildAttendanceData existing (bukan penulis kedua; koordinat rekod berjalan
// tidak ditulis ulang, rekod baru lat/long kosong). Gerbang slip-final tahap 1:
// persetujuan tanggal yang sudah masuk Payroll approved/paid DITAHAN (pengajuan
// tetap pending, pesan "menunggu jalur slip koreksi"), slip final tidak diubah.

/** Employee id user pemanggil untuk penjaga self/self-approve (null = tak tertaut). */
async function callerEmployeeIdForCorrection(userId: string): Promise<number | null> {
  const me = await prisma.employee.findFirst({
    where: { userId: Number(userId) },
    select: { id: true },
  });
  return me?.id ?? null;
}

export async function createAttendanceCorrection(formData: FormData) {
  try {
    const user = await requirePermission("create_attendance_corrections");
    const parsed = parseFormData(attendanceCorrectionSchema, formData);
    if (!parsed.success)
      return { success: false as const, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    // BR-AC-07 + putusan Lead Q-AC-2: pengaju = employeeId login persis
    // untuk SEMUA scope (department/all tidak boleh atas nama orang lain),
    // fail-closed bila akun tak tertaut Employee.
    const me = await callerEmployeeIdForCorrection(user.id);
    if (me == null || me !== v.employeeId) {
      throw new Error("Anda hanya diperbolehkan mengajukan koreksi absensi untuk diri sendiri");
    }

    const date = wibDateToUtcMidnight(v.date);
    if (!isWithinAttendanceCorrectionWindow(date)) {
      throw new Error(ATTENDANCE_CORRECTION_WINDOW_MESSAGE);
    }

    const correction = await prisma.$transaction(async (tx) => {
      // Satu pending per (employeeId, date) (BR-AC-03): kunci baris Employee
      // menserialkan cek + buat untuk karyawan sama (pola createLeaveRequest).
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${v.employeeId} FOR UPDATE`;

      const pending = await tx.attendanceCorrection.findFirst({
        where: { employeeId: v.employeeId, date, status: "pending" },
        select: { id: true },
      });
      if (pending) {
        throw new Error(
          "Masih ada pengajuan koreksi yang menunggu untuk tanggal ini — tunggu diputus atau batalkan dulu.",
        );
      }

      const current = await tx.attendance.findUnique({
        where: { employeeId_date: { employeeId: v.employeeId, date } },
        select: {
          id: true,
          updatedAt: true,
          status: true,
          checkIn: true,
          checkOut: true,
          notes: true,
        },
      });

      return tx.attendanceCorrection.create({
        data: {
          slug: await nextSlug("attendanceCorrection", `koreksi-absensi-${v.date}`),
          employeeId: v.employeeId,
          date,
          proposedStatus: v.status,
          proposedCheckIn: v.checkIn ? wibTimeToUtcInstant(v.date, v.checkIn) : null,
          proposedCheckOut: v.checkOut ? wibTimeToUtcInstant(v.date, v.checkOut) : null,
          proposedNotes: v.notes ?? null,
          reason: v.reason,
          status: "pending",
          snapshotAttendanceId: current?.id ?? null,
          snapshotUpdatedAt: current?.updatedAt ?? null,
          snapshotStatus: current?.status ?? null,
          snapshotCheckIn: current?.checkIn ?? null,
          snapshotCheckOut: current?.checkOut ?? null,
          snapshotNotes: current?.notes ?? null,
        },
      });
    });

    await logActivity(
      "create",
      "AttendanceCorrection",
      correction.id,
      `Mengajukan koreksi absensi tanggal ${v.date}`,
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const, id: correction.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAttendanceCorrection]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

async function loadCorrectionForDecision(id: number) {
  return prisma.attendanceCorrection.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      date: true,
      proposedStatus: true,
      proposedCheckIn: true,
      proposedCheckOut: true,
      proposedNotes: true,
      status: true,
      snapshotAttendanceId: true,
      snapshotUpdatedAt: true,
      snapshotStatus: true,
      snapshotCheckIn: true,
      snapshotCheckOut: true,
      snapshotNotes: true,
    },
  });
}

/** Penyetuju sah: scope department/all atas pengaju + self-approve dilarang. */
async function assertAttendanceCorrectionApprover(
  user: { id: string; roles: string[] },
  correctionEmployeeId: number,
): Promise<number> {
  const scope = await getHrScope(user);
  if (scope.kind === "self") {
    throw new Error("Anda tidak memiliki akses menyetujui koreksi absensi");
  }
  await assertHrEmployeeAccess(scope, correctionEmployeeId);
  const me = await callerEmployeeIdForCorrection(user.id);
  if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan");
  if (me === correctionEmployeeId) {
    throw new Error("Penyetuju tidak boleh menyetujui koreksi absensinya sendiri");
  }
  return me;
}

export async function approveAttendanceCorrection(id: number) {
  try {
    const user = await requirePermission("approve_attendance_corrections");
    const correctionId = requirePositiveId(id, "koreksi absensi");
    const loaded = await loadCorrectionForDecision(correctionId);
    if (!loaded) throw new Error("Pengajuan koreksi absensi tidak ditemukan");
    const approverEmployeeId = await assertAttendanceCorrectionApprover(user, loaded.employeeId);
    if (loaded.status !== "pending") {
      throw new Error("Hanya pengajuan koreksi berstatus menunggu yang dapat disetujui");
    }

    // Tanggal string untuk buildAttendanceData (konvensi WIB = tanggal UTC
    // tengah malam Attendance.date, lihat attendance-time.ts).
    const dateStr = loaded.date.toISOString().slice(0, 10);
    const toTime = (d: Date | null) => {
      if (!d) return undefined;
      const minutes = wibMinutesOfDay(d);
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    };

    await prisma.$transaction(async (tx) => {
      // Klaim atomik pending -> approved lebih dulu: count 0 = sudah diproses.
      // PENTING: klaim ini di dalam transaksi yang sama dengan semua penjaga di
      // bawah — lemparan error sesudah klaim me-rollback flip status, jadi
      // pengajuan TETAP pending pada konflik/gerbang (BR-AC-02).
      const claim = await tx.attendanceCorrection.updateMany({
        where: { id: correctionId, status: "pending" },
        data: {
          status: "approved",
          approvedBy: approverEmployeeId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
      });
      if (claim.count === 0) {
        throw new Error("Pengajuan koreksi absensi sudah diproses atau status tidak valid");
      }

      const current = await tx.attendance.findUnique({
        where: { employeeId_date: { employeeId: loaded.employeeId, date: loaded.date } },
        select: {
          id: true,
          updatedAt: true,
          status: true,
          checkIn: true,
          checkOut: true,
          notes: true,
        },
      });
      // EC-1: rekod berubah sesudah snapshot -> tolak persetujuan kali ini,
      // pengajuan tetap pending (rollback klaim di atas).
      if (attendanceCorrectionHasConflict(loaded, current)) {
        throw new Error(ATTENDANCE_CORRECTION_CONFLICT_MESSAGE);
      }

      // Gerbang slip-final tahap 1 (013-V butir 8): tanggal sudah masuk slip
      // approved/paid -> tahan persetujuan, slip final tidak diubah.
      const finalSlip = await tx.payroll.findFirst({
        where: {
          employeeId: loaded.employeeId,
          status: { in: FINAL_PAYROLL_STATUSES },
          startDate: { lte: loaded.date },
          endDate: { gte: loaded.date },
        },
        select: { id: true },
      });
      if (finalSlip) {
        throw new Error(ATTENDANCE_CORRECTION_FINAL_PAYROLL_MESSAGE);
      }

      const data = await buildAttendanceData(
        {
          employeeId: loaded.employeeId,
          date: dateStr,
          checkIn: toTime(loaded.proposedCheckIn),
          checkOut: toTime(loaded.proposedCheckOut),
          status: loaded.proposedStatus,
          notes: loaded.proposedNotes ?? undefined,
        },
        tx,
      );
      if (current) {
        // Update hanya kolom semantik buildAttendanceData: koordinat rekod
        // berjalan TIDAK ditulis ulang (BR-AC-06).
        await tx.attendance.update({ where: { id: current.id }, data });
      } else {
        await tx.attendance.create({
          data: { employeeId: loaded.employeeId, ...data },
        });
      }
    });

    await logActivity(
      "approve",
      "AttendanceCorrection",
      correctionId,
      "Menyetujui koreksi absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveAttendanceCorrection]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function rejectAttendanceCorrection(id: number, reason: string) {
  try {
    const user = await requirePermission("approve_attendance_corrections");
    const correctionId = requirePositiveId(id, "koreksi absensi");
    const cleanReason = (reason ?? "").trim();
    if (!cleanReason) throw new Error("Alasan penolakan wajib diisi");
    const loaded = await loadCorrectionForDecision(correctionId);
    if (!loaded) throw new Error("Pengajuan koreksi absensi tidak ditemukan");
    await assertAttendanceCorrectionApprover(user, loaded.employeeId);

    const claim = await prisma.attendanceCorrection.updateMany({
      where: { id: correctionId, status: "pending" },
      data: { status: "rejected", rejectionReason: cleanReason },
    });
    if (claim.count === 0) {
      throw new Error("Pengajuan koreksi absensi sudah diproses atau status tidak valid");
    }

    await logActivity(
      "reject",
      "AttendanceCorrection",
      correctionId,
      "Menolak koreksi absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[rejectAttendanceCorrection]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function cancelAttendanceCorrection(id: number) {
  try {
    const user = await requirePermission("create_attendance_corrections");
    const correctionId = requirePositiveId(id, "koreksi absensi");
    const loaded = await prisma.attendanceCorrection.findUnique({
      where: { id: correctionId },
      select: { employeeId: true, status: true },
    });
    if (!loaded) throw new Error("Pengajuan koreksi absensi tidak ditemukan");
    const me = await callerEmployeeIdForCorrection(user.id);
    if (me == null || me !== loaded.employeeId) {
      throw new Error("Hanya pengaju yang dapat membatalkan pengajuan ini");
    }
    if (loaded.status !== "pending") {
      throw new Error("Hanya pengajuan koreksi berstatus menunggu yang dapat dibatalkan");
    }

    const claim = await prisma.attendanceCorrection.updateMany({
      where: { id: correctionId, status: "pending" },
      data: { status: "cancelled" },
    });
    if (claim.count === 0) {
      throw new Error("Pengajuan koreksi absensi sudah diproses atau status tidak valid");
    }

    await logActivity(
      "cancel",
      "AttendanceCorrection",
      correctionId,
      "Membatalkan koreksi absensi",
    );
    revalidatePath("/sdm/absensi");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[cancelAttendanceCorrection]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
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

/**
 * F-2026-10-20-96 (lapis aman): lembar waktu yang sudah ditarik menjadi
 * ProductionCost (sourceTimesheetId) tidak boleh diubah/dihapus — jam di
 * timesheet adalah dasar snapshot HPP labor; mengubahnya sesudah ditarik
 * membuat subledger biaya produksi tak bisa ditelusur. Hapus baris biaya
 * produksinya dulu bila memang perlu koreksi.
 */
async function timesheetPulledError(id: number): Promise<{ success: false; error: string } | null> {
  const used = (await prisma.productionCost.findMany({ where: { sourceTimesheetId: id }, select: { id: true } })).length;
  if (used === 0) return null;
  return {
    success: false,
    error: `Lembar waktu ini sudah ditarik menjadi ${used} baris biaya produksi dan tidak dapat diubah atau dihapus. Hapus baris biaya produksinya terlebih dahulu bila perlu koreksi.`,
  };
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

    const pulled = await timesheetPulledError(id);
    if (pulled) return pulled;

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

    const startDate = wibDateToUtcMidnight(v.startDate);
    const endDate = wibDateToUtcMidnight(v.endDate);

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

      const specialCap = SPECIAL_LEAVE_DAY_CAPS[v.type];
      if (specialCap != null) {
        const calendarDays =
          Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
        if (calendarDays > specialCap) {
          throw new Error(
            `Cuti jenis ini maksimal ${specialCap} hari per kejadian (diajukan ${calendarDays} hari).`,
          );
        }
      }

      if (QUOTA_LEAVE_TYPES.has(v.type)) {
        const quotaYear = startDate.getFullYear();
        const quota = await getLeaveQuota(employeeId, {
          year: quotaYear,
          now: startDate,
          excludeLeaveId: id,
          db: tx,
        });
        if (!quota.eligible) {
          throw new Error(
            "Cuti tahunan hanya untuk karyawan dengan masa kerja minimal 1 tahun.",
          );
        }
        // Clip to the quota year (same reasoning as createLeaveRequest): the gate
        // must charge only the days within the start year, matching `used`.
        const quotaYearStart = new Date(quotaYear, 0, 1);
        const quotaYearEnd = new Date(quotaYear, 11, 31);
        const requestedDays = await countLeaveWorkingDays(
          employeeId,
          startDate > quotaYearStart ? startDate : quotaYearStart,
          endDate < quotaYearEnd ? endDate : quotaYearEnd,
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
          slug: await nextSlug("leaveRequest", `cuti-${startDate.toISOString().slice(0, 10)}`, { excludeId: id }),
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

      // Gerbang batas yang sama dengan create (syarat vonis K2-S1):
      // tanpa ini edit pending 2 jam -> 5 jam hari kerja lolos batas
      // PP 35/2021. excludeId mengeluarkan baris ini dari hitungannya.
      await assertOvertimeWithinWorkdayLimits(tx, (empId, d) => resolveDayKind(empId, d, tx), {
        employeeId: v.employeeId,
        date: wibDateToUtcMidnight(v.date),
        hours: v.hours,
        excludeId: id,
      });

      const changed = await tx.overtimeRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          slug: await nextSlug("overtimeRequest", `lembur-${v.date}`, { excludeId: id }),
          employeeId: v.employeeId,
          projectId: v.projectId ?? null,
          date: wibDateToUtcMidnight(v.date),
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
          slug: await nextSlug("employeeLoan", `pinjaman-${v.loanDate}`, { excludeId: id }),
          employeeId: v.employeeId,
          loanDate: wibDateToUtcMidnight(v.loanDate),
          totalAmount,
          monthlyInstallment: v.monthlyInstallment,
          weeklyInstallment: v.weeklyInstallment ?? null,
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

    const pulled = await timesheetPulledError(id);
    if (pulled) return pulled;

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

    const contextError = await timesheetContextGuard(v);
    if (contextError) return contextError;

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data: {
        slug: await nextSlug("timesheet", "lembar-waktu", { excludeId: id }),
        ...timesheetWriteData(v),
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
        slug: await nextSlug("appreciation", "apresiasi"),
        ...appreciationWriteData(v),
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
        slug: await nextSlug("appreciation", "apresiasi", { excludeId: id }),
        ...appreciationWriteData(v),
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

// ==================== P1-6: ATURAN STATUTORI PAYROLL ====================
// Halaman `/sdm/aturan-statutori` adalah SATU-SATUNYA jalur tulis
// `payroll_statutory_rules`. Perubahan tarif = baris BARU (effectiveFrom baru
// + tutup baris lama via effectiveTo); edit value baris lama DITOLAK agar
// snapshot slip historis tetap reproduksibel.

const STATUTORY_RULE_PATH = "/sdm/aturan-statutori";

export async function createStatutoryRule(formData: FormData) {
  try {
    await requirePermission("create_payroll");
    const parsed = parseFormData(statutoryRuleSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;
    const from = wibDateToUtcMidnight(v.effectiveFrom);
    const to = v.effectiveTo ? wibDateToUtcMidnight(v.effectiveTo) : null;
    if (to && to <= from) {
      return { success: false as const, error: "Berlaku sampai harus setelah berlaku sejak" };
    }
    const rule = await prisma.payrollStatutoryRule.create({
      data: {
        key: v.key,
        value: v.value,
        effectiveFrom: from,
        effectiveTo: to,
        source: v.source ?? null,
      },
    });
    await logActivity("create", "PayrollStatutoryRule", rule.id, `Aturan ${v.key} sejak ${v.effectiveFrom}`);
    revalidatePath(STATUTORY_RULE_PATH);
    return { success: true as const, id: rule.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createStatutoryRule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function closeStatutoryRule(id: number, formData: FormData) {
  try {
    await requirePermission("edit_payroll");
    const ruleId = requirePositiveId(id, "aturan statutori");
    const toRaw = ((formData.get("effectiveTo") as string | null) ?? "").trim();
    if (!toRaw) return { success: false as const, error: "Tanggal tutup wajib diisi" };
    // `new Date("2026-02-30")` menggulir diam-diam ke 2 Mar — tolak tanggal
    // kalender fiktif (pola dateOnly create) sebelum tulis.
    if (!dateOnly.safeParse(toRaw).success) {
      return { success: false as const, error: "Tanggal tutup tidak valid" };
    }
    const to = wibDateToUtcMidnight(toRaw);
    const rule = await prisma.payrollStatutoryRule.findUniqueOrThrow({ where: { id: ruleId } });
    if (to <= new Date(rule.effectiveFrom)) {
      return { success: false as const, error: "Tanggal tutup harus setelah berlaku sejak" };
    }
    await prisma.payrollStatutoryRule.update({
      where: { id: ruleId },
      data: { effectiveTo: to },
    });
    await logActivity("update", "PayrollStatutoryRule", ruleId, `Tutup aturan ${rule.key} per ${toRaw}`);
    revalidatePath(STATUTORY_RULE_PATH);
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[closeStatutoryRule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteStatutoryRule(id: number) {
  try {
    // Katalog payroll tanpa izin delete khusus — pakai edit_payroll.
    // Baris yang sudah/pernah efektif (histori slip) TIDAK boleh dihapus;
    // tutup via closeStatutoryRule. Hanya baris masa depan yang bisa hapus.
    await requirePermission("edit_payroll");
    const ruleId = requirePositiveId(id, "aturan statutori");
    const rule = await prisma.payrollStatutoryRule.findUniqueOrThrow({ where: { id: ruleId } });
    if (new Date(rule.effectiveFrom) <= new Date()) {
      return { success: false as const, error: "Baris historis/aktif tidak boleh dihapus — tutup dengan tanggal akhir" };
    }
    await prisma.payrollStatutoryRule.delete({ where: { id: ruleId } });
    await logActivity("delete", "PayrollStatutoryRule", id, `Menghapus aturan statutori #${id}`);
    revalidatePath(STATUTORY_RULE_PATH);
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteStatutoryRule]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * F-2026-10-22-085-S: daftar perhatian siklus hidup karyawan (BR-EMP-08).
 * Izin view_employees + scope HR; keluaran tanpa field gaji (builder murni).
 */
export async function getEmployeeLifecycleAttention() {
  try {
    const user = await requirePermission("view_employees");
    const scope = await getHrScope(user);
    const rows = await loadEmployeeLifecycleAttention(scope);
    return { success: true as const, rows };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getEmployeeLifecycleAttention]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PKWT COMPENSATION (F-2026-10-24-132-V) ====================
// Peristiwa per segmen terbekukan (Putusan 1) + akrual bulanan (Putusan 3) +
// baris slip khusus (Putusan 5). Pajak mengikuti mesin PPh 21 existing
// (Putusan 4) — gaji pokok/segmen tidak diubah di sini.

function parsePkwtDate(value: FormDataEntryValue | null, label: string): Date {
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Tanggal ${label} peristiwa PKWT wajib YYYY-MM-DD`);
  return wibDateToUtcMidnight(s);
}

export async function createPkwtEvent(formData: FormData) {
  try {
    const user = await requirePermission("edit_payroll");
    const employeeId = Number(formData.get("employeeId"));
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid");
    const segmentStart = parsePkwtDate(formData.get("segmentStart"), "mulai segmen");
    const segmentEnd = parsePkwtDate(formData.get("segmentEnd"), "akhir segmen");
    const agreementRaw = formData.get("agreementAmount");
    const agreementAmount =
      agreementRaw == null || String(agreementRaw).trim() === "" ? null : Number(agreementRaw);
    if (agreementAmount != null && !Number.isFinite(agreementAmount)) {
      throw new Error("Nominal kesepakatan PKWT tidak valid");
    }
    const event = await createPkwtCompensationEvent(prisma, {
      employeeId,
      segmentStart,
      segmentEnd,
      agreementAmount,
      agreementDocumentRef:
        typeof formData.get("agreementDocumentRef") === "string"
          ? String(formData.get("agreementDocumentRef"))
          : null,
      isLegacy: formData.get("isLegacy") === "1" || formData.get("isLegacy") === "true",
      correctsEventId: formData.get("correctsEventId")
        ? Number(formData.get("correctsEventId"))
        : null,
      createdBy: Number((user as { id: unknown }).id) || null,
    });
    await logActivity("create", "PkwtCompensationEvent", event.id, "Membuat peristiwa kompensasi PKWT");
    revalidatePath("/sdm/penggajian");
    return { success: true, id: event.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPkwtEvent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function approvePkwtEvent(eventId: number) {
  try {
    const user = await requirePermission("process_payroll");
    if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error("Peristiwa PKWT tidak valid");
    await approvePkwtCompensationEvent(prisma, eventId, Number((user as { id: unknown }).id));
    await logActivity("approve", "PkwtCompensationEvent", eventId, "Menyetujui peristiwa kompensasi PKWT");
    revalidatePath("/sdm/penggajian");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approvePkwtEvent]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function runPkwtAccrual(period: string) {
  try {
    const user = await requirePermission("process_payroll");
    const result = await runPkwtMonthlyAccrual(prisma, period, Number((user as { id: unknown }).id) || null);
    await logActivity("create", "Journal", result.journalId ?? 0, `Akrual kompensasi PKWT ${period}: ${result.accruedCount} karyawan Rp${result.totalAmount}`);
    revalidatePath("/sdm/penggajian");
    return { success: true, data: result };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[runPkwtAccrual]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function attachPkwtEventToPayroll(payrollId: number, formData: FormData) {
  try {
    if (!Number.isSafeInteger(payrollId) || payrollId <= 0) throw new Error("Slip gaji tidak valid");
    await requirePermission("edit_payroll");
    await assertDraftPayrollLineAccess(payrollId);
    const eventId = Number(formData.get("eventId"));
    if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error("Peristiwa PKWT tidak valid");
    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: payrollId },
      select: { employeeId: true },
    });
    const lineData = await buildPkwtPayrollLineData(prisma, {
      eventId,
      payrollEmployeeId: payroll.employeeId,
    });
    const created = await prisma.payrollComponentLine.create({
      data: { payrollId, ...lineData },
    });
    await recalcDraftPayrollFromLines(payrollId);
    await logActivity("create", "PayrollComponentLine", created.id, "Menarik kompensasi PKWT ke slip gaji");
    revalidatePath("/sdm/penggajian");
    return { success: true, id: created.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[attachPkwtEventToPayroll]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
