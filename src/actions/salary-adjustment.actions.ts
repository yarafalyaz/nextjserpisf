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
import { computeChangePercent } from "@/lib/services/salary-adjustment.service";
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

/*
 * F-2026-10-26-054-S Jalur A (putusan Lead Q-SA-1/2/3; vonis Accountant
 * V-SA-1..6): penyesuaian gaji lahir `menunggu`, TIDAK langsung terjadwal.
 * Penyetuju (izin approve_salary_adjustments, scope HR `all` tahap 1)
 * menyetujui -> scheduled atau menolak -> ditolak (alasan wajib tersimpan).
 * Maker-checker ditegakkan server: penyetuju != createdBy, untuk approve
 * DAN reject. Penerapan ke master tetap applyDueSalaryAdjustments existing
 * yang hanya mengambil status scheduled — angka statutori tidak disentuh.
 */

async function assertSalaryApproverScope(actor: { id: unknown; roles?: string[] }) {
  if (!(await canViewSalaryAmounts())) {
    throw new Error("Anda tidak memiliki izin melihat/mengubah nominal gaji");
  }
  // Q-SA-2: scope penyetuju tahap 1 hanya `all` (preseden
  // requirePayrollComponentAdmin di hrm.actions.ts).
  const scope = await getHrScope({
    id: String((actor as { id: unknown }).id),
    roles: Array.isArray((actor as { roles?: unknown }).roles)
      ? [...((actor as { roles: string[] }).roles)]
      : [],
  });
  if (scope.kind !== "all") {
    throw new Error("Persetujuan penyesuaian gaji hanya untuk cakupan HR menyeluruh");
  }
  return actor;
}

async function loadAdjustmentForDecision(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Penyesuaian tidak valid");
  const row = await prisma.salaryAdjustment.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true, createdBy: true },
  });
  if (!row) throw new Error("Penyesuaian gaji tidak ditemukan");
  return row;
}

function assertNotSelfDecision(
  actor: { id: unknown },
  row: { createdBy: number | null },
) {
  // Fail-closed: baris tanpa pengaju tercatat tidak boleh diputus siapa pun
  // (maker-checker tidak dapat dibuktikan).
  if (row.createdBy == null || Number(actor.id) === row.createdBy) {
    throw new Error("Penyetuju tidak boleh memutus penyesuaian gaji yang diajukan sendiri");
  }
}

export async function createSalaryAdjustment(formData: FormData) {
  try {
    const actor = await requirePermission("edit_employees");
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
          status: "menunggu",
          createdBy: Number(actor.id),
        },
      });
      return { adjustment, employeeName: employee.name };
    });

    // BR-SA-04: tanggal efektif lampau TIDAK auto-terap saat dibuat; master
    // berubah hanya sesudah disetujui, pada applyDue payroll berikutnya.
    await logActivity(
      "create",
      "SalaryAdjustment",
      created.adjustment.id,
      `Pengajuan kenaikan gaji ${created.employeeName} (${reason}) menunggu persetujuan`,
    );
    revalidatePath("/master/karyawan");
    return {
      success: true as const,
      id: created.adjustment.id,
      applied: false,
      status: created.adjustment.status,
      changePercent: computeChangePercent(
        Number(created.adjustment.previousBaseSalary),
        newBaseSalary,
      ),
    };
  } catch (e: unknown) {
    return resultError(e, "[createSalaryAdjustment]");
  }
}

export async function approveSalaryAdjustment(id: number) {
  try {
    const actor = await requirePermission("approve_salary_adjustments");
    await assertSalaryApproverScope(actor);
    const row = await loadAdjustmentForDecision(id);
    assertNotSelfDecision(actor, row);
    // Klaim atomik bersyarat: hanya baris yang masih menunggu yang beralih;
    // balapan dua penyetuju -> yang kalah count 0 (EC-SA-1, idempoten).
    const claim = await prisma.salaryAdjustment.updateMany({
      where: { id, status: "menunggu" },
      data: {
        status: "scheduled",
        approvedBy: Number(actor.id),
        decidedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return {
        success: false as const,
        error: "Penyesuaian gaji sudah diputus atau tidak lagi menunggu persetujuan",
      };
    }
    await logActivity(
      "update",
      "SalaryAdjustment",
      id,
      "Penyesuaian gaji disetujui; menunggu penerapan pada tanggal efektif",
    );
    revalidatePath("/master/karyawan");
    return { success: true as const, status: "scheduled" as const };
  } catch (e: unknown) {
    return resultError(e, "[approveSalaryAdjustment]");
  }
}

export async function rejectSalaryAdjustment(id: number, rejectionReason: string) {
  try {
    const actor = await requirePermission("approve_salary_adjustments");
    await assertSalaryApproverScope(actor);
    // BR-SA-03: alasan penolakan wajib, tersimpan, terbaca di riwayat.
    const reason = String(rejectionReason ?? "").trim();
    if (!reason) {
      return { success: false as const, error: "Alasan penolakan wajib diisi" };
    }
    const row = await loadAdjustmentForDecision(id);
    assertNotSelfDecision(actor, row);
    const claim = await prisma.salaryAdjustment.updateMany({
      where: { id, status: "menunggu" },
      data: {
        status: "ditolak",
        rejectedBy: Number(actor.id),
        rejectionReason: reason,
        decidedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return {
        success: false as const,
        error: "Penyesuaian gaji sudah diputus atau tidak lagi menunggu persetujuan",
      };
    }
    await logActivity(
      "update",
      "SalaryAdjustment",
      id,
      "Penyesuaian gaji ditolak",
    );
    revalidatePath("/master/karyawan");
    return { success: true as const, status: "ditolak" as const };
  } catch (e: unknown) {
    return resultError(e, "[rejectSalaryAdjustment]");
  }
}

export async function cancelSalaryAdjustment(id: number) {
  try {
    await requirePermission("edit_employees");
    if (!(await canViewSalaryAmounts())) {
      throw new Error("Anda tidak memiliki izin melihat/mengubah nominal gaji");
    }
    const claim = await prisma.salaryAdjustment.updateMany({
      where: { id, status: { in: ["menunggu", "scheduled"] } },
      data: { status: "cancelled" },
    });
    if (claim.count === 0) {
      return {
        success: false as const,
        error: "Hanya penyesuaian menunggu atau terjadwal yang dapat dibatalkan",
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
    await requirePermission("view_employees");
    if (!(await canViewSalaryAmounts())) {
      throw new Error("Anda tidak memiliki izin melihat nominal gaji");
    }
    // Q-SA-3 / EC-SA-2: karyawan yang sudah berhenti — baris menunggu/
    // scheduled dibatalkan otomatis dan tercatat sebagai cancelled di
    // riwayat (bukan hilang diam-diam); baris applied tidak disentuh.
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { employmentEndedAt: true },
    });
    let autoCancelledBerhenti = 0;
    if (employee?.employmentEndedAt) {
      const swept = await prisma.salaryAdjustment.updateMany({
        where: { employeeId, status: { in: ["menunggu", "scheduled"] } },
        data: { status: "cancelled", decidedAt: new Date() },
      });
      // Tercatat = status cancelled + decidedAt terisi tanpa approvedBy/
      // rejectedBy di baris riwayat di bawah; terhitung = nilai kembalian ini.
      autoCancelledBerhenti = swept.count;
    }
    const rows = await prisma.salaryAdjustment.findMany({
      where: { employeeId },
      orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
    });
    return {
      success: true as const,
      autoCancelledBerhenti,
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
        createdBy: r.createdBy,
        approvedBy: r.approvedBy,
        rejectedBy: r.rejectedBy,
        rejectionReason: r.rejectionReason,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (e: unknown) {
    return resultError(e, "[getSalaryAdjustments]");
  }
}
