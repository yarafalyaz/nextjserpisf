"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  applicantSchema,
  vacancySchema,
} from "@/lib/validations/recruitment.schemas";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { nextSlug } from "@/lib/utils/slug-db";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";
import { APPLICANT_STAGES } from "@/lib/hr/hcms-scoring";

const TERMINAL_STAGES = new Set(["hired", "rejected"]);

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

// ==================== LOWONGAN ====================

export async function createVacancy(formData: FormData) {
  try {
    const user = await requirePermission("create_recruitments");

    const parsed = parseFormData(vacancySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const code = await generateDocumentNumber("VAC", "simple");
    const vacancy = await prisma.jobVacancy.create({
      data: {
        code,
        slug: await nextSlug("jobVacancy", code),
        title: v.title,
        departmentId: v.departmentId ?? null,
        positionId: v.positionId ?? null,
        description: v.description ?? null,
        requirements: v.requirements ?? null,
        location: v.location ?? null,
        employmentType: v.employmentType ?? null,
        quota: v.quota,
        status: "draft",
        createdBy: Number(user.id),
      },
    });

    await logActivity("create", "JobVacancy", vacancy.id, `Membuat lowongan ${vacancy.title}`);
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const, id: vacancy.id, slug: vacancy.slug };
  } catch (e: unknown) {
    return resultError(e, "[createVacancy]");
  }
}

export async function updateVacancy(id: number, formData: FormData) {
  try {
    await requirePermission("edit_recruitments");

    const existing = await prisma.jobVacancy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return { success: false as const, error: "Lowongan tidak ditemukan" };
    if (existing.status === "closed") {
      return { success: false as const, error: "Lowongan yang sudah ditutup tidak dapat diubah" };
    }

    const parsed = parseFormData(vacancySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.jobVacancy.update({
      where: { id },
      data: {
        title: v.title,
        departmentId: v.departmentId ?? null,
        positionId: v.positionId ?? null,
        description: v.description ?? null,
        requirements: v.requirements ?? null,
        location: v.location ?? null,
        employmentType: v.employmentType ?? null,
        quota: v.quota,
      },
    });

    await logActivity("update", "JobVacancy", id, `Memperbarui lowongan ${v.title}`);
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const, id };
  } catch (e: unknown) {
    return resultError(e, "[updateVacancy]");
  }
}

export async function setVacancyStatus(id: number, status: "open" | "closed") {
  try {
    await requirePermission("edit_recruitments");

    const existing = await prisma.jobVacancy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return { success: false as const, error: "Lowongan tidak ditemukan" };

    const allowed =
      (existing.status === "draft" && status === "open") ||
      (existing.status === "open" && status === "closed");
    if (!allowed) {
      return {
        success: false as const,
        error: `Lowongan berstatus ${existing.status} tidak dapat menjadi ${status}`,
      };
    }

    await prisma.jobVacancy.update({
      where: { id },
      data: {
        status,
        ...(status === "open" ? { openedAt: new Date() } : { closedAt: new Date() }),
      },
    });

    await logActivity("update", "JobVacancy", id, `Lowongan menjadi ${status}`);
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const, id };
  } catch (e: unknown) {
    return resultError(e, "[setVacancyStatus]");
  }
}

export async function deleteVacancy(id: number) {
  try {
    await requirePermission("delete_recruitments");

    await prisma.jobVacancy.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await logActivity("delete", "JobVacancy", id, "Menghapus lowongan");
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deleteVacancy]");
  }
}

// ==================== PELAMAR ====================

export async function createApplicant(formData: FormData) {
  try {
    const user = await requirePermission("create_recruitments");

    const parsed = parseFormData(applicantSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const vacancy = await prisma.jobVacancy.findFirst({
      where: { id: v.vacancyId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!vacancy) return { success: false as const, error: "Lowongan tidak ditemukan" };
    if (vacancy.status !== "open") {
      return { success: false as const, error: "Pelamar hanya dapat ditambah ke lowongan yang terbuka" };
    }

    const applicant = await prisma.$transaction(async (tx) => {
      const created = await tx.jobApplicant.create({
        data: {
          vacancyId: v.vacancyId,
          slug: await nextSlug("jobApplicant", v.name),
          name: v.name,
          email: v.email || null,
          phone: v.phone ?? null,
          source: v.source ?? null,
          cvReference: v.cvReference ?? null,
          notes: v.notes ?? null,
          stage: "applied",
          createdBy: Number(user.id),
        },
      });
      await tx.applicantStageHistory.create({
        data: {
          applicantId: created.id,
          fromStage: null,
          toStage: "applied",
          changedBy: Number(user.id),
        },
      });
      return created;
    });

    await logActivity("create", "JobApplicant", applicant.id, `Menambah pelamar ${applicant.name}`);
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const, id: applicant.id, slug: applicant.slug };
  } catch (e: unknown) {
    return resultError(e, "[createApplicant]");
  }
}

export async function moveApplicantStage(
  applicantId: number,
  toStage: string,
  notes?: string,
) {
  try {
    const user = await requirePermission("edit_recruitments");

    if (!(APPLICANT_STAGES as readonly string[]).includes(toStage)) {
      return { success: false as const, error: "Tahapan tidak dikenal" };
    }
    if (toStage === "hired") {
      return {
        success: false as const,
        error: "Gunakan tombol Terima agar data karyawan dibuat otomatis",
      };
    }

    const applicant = await prisma.jobApplicant.findFirst({
      where: { id: applicantId, deletedAt: null },
      select: { id: true, stage: true, name: true },
    });
    if (!applicant) return { success: false as const, error: "Pelamar tidak ditemukan" };
    if (TERMINAL_STAGES.has(applicant.stage)) {
      return { success: false as const, error: "Pelamar sudah pada tahap akhir" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobApplicant.update({
        where: { id: applicantId },
        data: { stage: toStage },
      });
      await tx.applicantStageHistory.create({
        data: {
          applicantId,
          fromStage: applicant.stage,
          toStage,
          notes: notes ?? null,
          changedBy: Number(user.id),
        },
      });
    });

    await logActivity(
      "update",
      "JobApplicant",
      applicantId,
      `Pelamar ${applicant.name}: ${applicant.stage} -> ${toStage}`,
    );
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const, id: applicantId };
  } catch (e: unknown) {
    return resultError(e, "[moveApplicantStage]");
  }
}

/**
 * Terima pelamar: baris Employee lahir dari data pelamar + departemen/
 * jabatan lowongan, dalam satu transaksi dengan perubahan tahap. Inilah
 * titik "HCMS menyatu dengan ERP": karyawan baru langsung tunduk pada
 * absensi, payroll, scope HR, dan pohon organisasi yang sudah ada.
 */
export async function hireApplicant(applicantId: number) {
  try {
    const user = await requirePermission("edit_recruitments");

    const employeeNo = await generateDocumentNumber("EMP", "simple");
    const todayWib = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM job_applicants WHERE id = ${applicantId} FOR UPDATE`;

      const applicant = await tx.jobApplicant.findFirst({
        where: { id: applicantId, deletedAt: null },
        include: { vacancy: true },
      });
      if (!applicant) throw new Error("Pelamar tidak ditemukan");
      if (applicant.stage === "hired" || applicant.hiredEmployeeId != null) {
        throw new Error("Pelamar ini sudah diterima");
      }
      if (applicant.stage === "rejected") {
        throw new Error("Pelamar yang ditolak tidak dapat diterima");
      }

      const employee = await tx.employee.create({
        data: {
          employeeNo,
          slug: await nextSlug("employee", applicant.name),
          name: applicant.name,
          email: applicant.email,
          phone: applicant.phone,
          departmentId: applicant.vacancy.departmentId,
          positionId: applicant.vacancy.positionId,
          joinDate: wibDateToUtcMidnight(todayWib),
          isActive: true,
        },
      });

      await tx.jobApplicant.update({
        where: { id: applicantId },
        data: { stage: "hired", hiredEmployeeId: employee.id },
      });
      await tx.applicantStageHistory.create({
        data: {
          applicantId,
          fromStage: applicant.stage,
          toStage: "hired",
          notes: `Karyawan dibuat: ${employee.employeeNo}`,
          changedBy: Number(user.id),
        },
      });

      return { employeeId: employee.id, employeeNo: employee.employeeNo };
    });

    await logActivity(
      "create",
      "Employee",
      result.employeeId,
      `Karyawan dari rekrutmen (${result.employeeNo})`,
    );
    revalidatePath("/sdm/rekrutmen");
    revalidatePath("/master/karyawan");
    return { success: true as const, employeeId: result.employeeId, employeeNo: result.employeeNo };
  } catch (e: unknown) {
    return resultError(e, "[hireApplicant]");
  }
}

export async function deleteApplicant(id: number) {
  try {
    await requirePermission("delete_recruitments");

    await prisma.jobApplicant.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await logActivity("delete", "JobApplicant", id, "Menghapus pelamar");
    revalidatePath("/sdm/rekrutmen");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deleteApplicant]");
  }
}
