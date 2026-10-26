"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { getHrScope } from "@/lib/auth/hr-scope";
import { canViewSalaryAmounts } from "@/lib/auth/field-visibility";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";
import {
  applyDueSalaryAdjustments,
  computeChangePercent,
} from "@/lib/services/salary-adjustment.service";
import { SALARY_ADJUSTMENT_REASONS } from "@/lib/hr/hcms-scoring";

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

/**
 * TEMUAN-1 PR #959: penyesuaian gaji hanya untuk scope HR `all`
 * (preseden requirePayrollComponentAdmin di hrm.actions.ts) — permission
 * edit/view_employees + view_salary_amounts saja tidak cukup; aktor
 * department/self tidak boleh menyentuh nominal karyawan di luar cakupan.
 */
async function requireSalaryAdjustmentScopeAll(actor: {
  id: unknown;
  roles?: string[];
}): Promise<void> {
  const scope = await getHrScope({
    id: String(actor.id),
    roles: Array.isArray(actor.roles) ? [...actor.roles] : [],
  });
  if (scope.kind !== "all") {
    throw new Error("Penyesuaian gaji hanya boleh dikelola oleh pengguna dengan cakupan semua karyawan");
  }
}

export async function createSalaryAdjustment(formData: FormData) {
  try {
    const actor = await requirePermission("edit_employees");
    await requireSalaryAdjustmentScopeAll(actor as { id: unknown; roles?: string[] });
    if (!(await canViewSalaryAmounts())) {
      throw new Error("Anda tidak memiliki izin melihat/mengubah nominal gaji");
    }

    const employeeIdRaw = Number(formData.get("employeeId"));
    if (!Number.isSafeInteger(employeeIdRaw) || employeeIdRaw <= 0) {
      throw new Error("Karyawan tidak valid");
    }
    const newBaseSalary = parseMoneyAmount(formData.get("newBaseSalary"));
    if (newBaseSalary == null || newBaseSalary < 0) {
      throw new Error("Gaji pokok baru tidak valid");
    }
    const reason = String(formData.get("reason") ?? "");
    if (!(SALARY_ADJUSTMENT_REASONS as readonly string[]).includes(reason)) {
      throw new Error("Alasan kenaikan tidak dikenal");
    }
    const effectiveRaw = String(formData.get("effectiveDate") ?? "").trim();
    if (!effectiveRaw) throw new Error("Tanggal efektif wajib diisi");
    const effectiveDate = wibDateToUtcMidnight(effectiveRaw);
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM employees WHERE id = ${employeeIdRaw} FOR UPDATE`;
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeIdRaw },
        select: { baseSalary: true, name: true },
      });
      const previous = Number(employee.baseSalary);
      if (newBaseSalary === previous) {
        throw new Error("Gaji pokok baru sama dengan gaji saat ini");
      }
      const adjustment = await tx.salaryAdjustment.create({
        data: {
          employeeId: employeeIdRaw,
          effectiveDate,
          previousBaseSalary: previous,
          newBaseSalary,
          reason,
          notes,
          status: "scheduled",
          createdBy: Number(actor.id),
        },
      });
      return { adjustment, employeeName: employee.name };
    });

    // Tanggal efektif sudah lewat: terapkan sekarang juga dalam jalur ini.
    await applyDueSalaryAdjustments(employeeIdRaw);

    const finalRow = await prisma.salaryAdjustment.findUnique({
      where: { id: created.adjustment.id },
      select: { status: true, previousBaseSalary: true, newBaseSalary: true },
    });

    // TEMUAN-2 PR #959: deskripsi log TANPA nominal — log aktivitas tampil
    // ke pemegang manage_settings tanpa view_salary_amounts.
    await logActivity(
      "create",
      "SalaryAdjustment",
      created.adjustment.id,
      `Kenaikan gaji ${created.employeeName} (${reason})`,
    );
    revalidatePath("/master/karyawan");
    return {
      success: true as const,
      id: created.adjustment.id,
      applied: finalRow?.status === "applied",
      changePercent: computeChangePercent(
        Number(created.adjustment.previousBaseSalary),
        newBaseSalary,
      ),
    };
  } catch (e: unknown) {
    return resultError(e, "[createSalaryAdjustment]");
  }
}

export async function cancelSalaryAdjustment(id: number) {
  try {
    const actor = await requirePermission("edit_employees");
    await requireSalaryAdjustmentScopeAll(actor as { id: unknown; roles?: string[] });
    if (!(await canViewSalaryAmounts())) {
      throw new Error("Anda tidak memiliki izin melihat/mengubah nominal gaji");
    }
    // Resolusi baris dulu: scope diperiksa atas employeeId baris, bukan id mentah.
    const row = await prisma.salaryAdjustment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      return { success: false as const, error: "Penyesuaian gaji tidak ditemukan" };
    }
    const claim = await prisma.salaryAdjustment.updateMany({
      where: { id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    if (claim.count === 0) {
      return {
        success: false as const,
        error: "Hanya kenaikan terjadwal yang dapat dibatalkan",
      };
    }
    revalidatePath("/master/karyawan");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[cancelSalaryAdjustment]");
  }
}

export async function getSalaryAdjustments(employeeId: number) {
  try {
    const actor = await requirePermission("view_employees");
    await requireSalaryAdjustmentScopeAll(actor as { id: unknown; roles?: string[] });
    if (!(await canViewSalaryAmounts())) {
      throw new Error("Anda tidak memiliki izin melihat nominal gaji");
    }
    const rows = await prisma.salaryAdjustment.findMany({
      where: { employeeId },
      orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
    });
    return {
      success: true as const,
      data: rows.map((r) => ({
        id: r.id,
        effectiveDate: r.effectiveDate.toISOString(),
        previousBaseSalary: Number(r.previousBaseSalary),
        newBaseSalary: Number(r.newBaseSalary),
        changePercent: computeChangePercent(
          Number(r.previousBaseSalary),
          Number(r.newBaseSalary),
        ),
        reason: r.reason,
        notes: r.notes,
        status: r.status,
        appliedAt: r.appliedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (e: unknown) {
    return resultError(e, "[getSalaryAdjustments]");
  }
}
