"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  competencySchema,
  employeeCompetencySchema,
  positionCompetencySchema,
  trainingParticipantSchema,
  trainingSchema,
} from "@/lib/validations/development.schemas";
import { nextSlug } from "@/lib/utils/slug-db";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

// ==================== KOMPETENSI ====================

export async function createCompetency(formData: FormData) {
  try {
    await requirePermission("create_competencies");
    const parsed = parseFormData(competencySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const competency = await prisma.competency.create({
      data: {
        name: v.name,
        slug: await nextSlug("competency", v.name),
        category: v.category ?? null,
        description: v.description ?? null,
      },
    });
    await logActivity("create", "Competency", competency.id, `Membuat kompetensi ${competency.name}`);
    revalidatePath("/sdm/kompetensi");
    return { success: true as const, id: competency.id };
  } catch (e: unknown) {
    return resultError(e, "[createCompetency]");
  }
}

export async function deleteCompetency(id: number) {
  try {
    await requirePermission("delete_competencies");
    await prisma.competency.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/sdm/kompetensi");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deleteCompetency]");
  }
}

export async function setPositionCompetency(formData: FormData) {
  try {
    await requirePermission("edit_competencies");
    const parsed = parseFormData(positionCompetencySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const row = await prisma.positionCompetency.upsert({
      where: {
        positionId_competencyId: {
          positionId: v.positionId,
          competencyId: v.competencyId,
        },
      },
      create: v,
      update: { requiredLevel: v.requiredLevel },
    });
    revalidatePath("/sdm/kompetensi");
    return { success: true as const, id: row.id };
  } catch (e: unknown) {
    return resultError(e, "[setPositionCompetency]");
  }
}

export async function assessEmployeeCompetency(formData: FormData) {
  try {
    const actor = await requirePermission("edit_competencies");
    const parsed = parseFormData(employeeCompetencySchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const row = await prisma.employeeCompetency.upsert({
      where: {
        employeeId_competencyId: {
          employeeId: v.employeeId,
          competencyId: v.competencyId,
        },
      },
      create: {
        ...v,
        assessedBy: Number(actor.id),
        assessedAt: new Date(),
      },
      update: {
        level: v.level,
        notes: v.notes ?? null,
        assessedBy: Number(actor.id),
        assessedAt: new Date(),
      },
    });
    await logActivity("update", "EmployeeCompetency", row.id, "Penilaian kompetensi karyawan");
    revalidatePath("/sdm/kompetensi");
    return { success: true as const, id: row.id };
  } catch (e: unknown) {
    return resultError(e, "[assessEmployeeCompetency]");
  }
}

/**
 * Peta kesenjangan: untuk tiap kompetensi yang disyaratkan jabatan seorang
 * karyawan, bandingkan level syarat vs level aktual (0 bila belum dinilai).
 */
export async function getCompetencyGaps(employeeId: number) {
  await requirePermission("view_competencies");
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { positionId: true },
  });
  if (!employee?.positionId) return [];
  const required = await prisma.positionCompetency.findMany({
    where: { positionId: employee.positionId },
    include: {
      competency: { select: { name: true } },
      position: { select: { name: true } },
    },
  });
  const actual = await prisma.employeeCompetency.findMany({
    where: { employeeId },
    select: { competencyId: true, level: true },
  });
  const actualByCompetency = new Map(actual.map((a) => [a.competencyId, a.level]));
  return required.map((r) => {
    const currentLevel = actualByCompetency.get(r.competencyId) ?? 0;
    return {
      competencyId: r.competencyId,
      competencyName: r.competency.name,
      requiredLevel: r.requiredLevel,
      currentLevel,
      gap: r.requiredLevel - currentLevel,
    };
  });
}

// ==================== PELATIHAN ====================

export async function createTraining(formData: FormData) {
  try {
    const user = await requirePermission("create_trainings");
    const parsed = parseFormData(trainingSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const training = await prisma.training.create({
      data: {
        title: v.title,
        slug: await nextSlug("training", v.title),
        provider: v.provider ?? null,
        startDate: wibDateToUtcMidnight(v.startDate),
        endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
        location: v.location ?? null,
        cost: parseMoneyAmount(formData.get("cost")) ?? 0,
        description: v.description ?? null,
        status: "scheduled",
        createdBy: Number(user.id),
      },
    });
    await logActivity("create", "Training", training.id, `Membuat pelatihan ${training.title}`);
    revalidatePath("/sdm/pelatihan");
    return { success: true as const, id: training.id, slug: training.slug };
  } catch (e: unknown) {
    return resultError(e, "[createTraining]");
  }
}

export async function setTrainingStatus(id: number, status: "done" | "cancelled") {
  try {
    await requirePermission("edit_trainings");
    const existing = await prisma.training.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!existing) return { success: false as const, error: "Pelatihan tidak ditemukan" };
    if (existing.status !== "scheduled") {
      return { success: false as const, error: "Hanya pelatihan terjadwal yang dapat diubah statusnya" };
    }
    await prisma.training.update({ where: { id }, data: { status } });
    revalidatePath("/sdm/pelatihan");
    return { success: true as const, id };
  } catch (e: unknown) {
    return resultError(e, "[setTrainingStatus]");
  }
}

export async function deleteTraining(id: number) {
  try {
    await requirePermission("delete_trainings");
    await prisma.training.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/sdm/pelatihan");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deleteTraining]");
  }
}

export async function addTrainingParticipant(formData: FormData) {
  try {
    await requirePermission("edit_trainings");
    const parsed = parseFormData(trainingParticipantSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const row = await prisma.trainingParticipant.upsert({
      where: {
        trainingId_employeeId: { trainingId: v.trainingId, employeeId: v.employeeId },
      },
      create: v,
      update: {},
    });
    revalidatePath("/sdm/pelatihan");
    return { success: true as const, id: row.id };
  } catch (e: unknown) {
    return resultError(e, "[addTrainingParticipant]");
  }
}

export async function setParticipantResult(
  participantId: number,
  input: { status: "attended" | "absent"; score?: number; certificateRef?: string },
) {
  try {
    await requirePermission("edit_trainings");
    if (input.score != null && (input.score < 0 || input.score > 100)) {
      return { success: false as const, error: "Skor harus 0-100" };
    }
    await prisma.trainingParticipant.update({
      where: { id: participantId },
      data: {
        status: input.status,
        score: input.score ?? null,
        certificateRef: input.certificateRef ?? null,
      },
    });
    revalidatePath("/sdm/pelatihan");
    return { success: true as const, id: participantId };
  } catch (e: unknown) {
    return resultError(e, "[setParticipantResult]");
  }
}

export async function removeTrainingParticipant(participantId: number) {
  try {
    await requirePermission("edit_trainings");
    await prisma.trainingParticipant.delete({ where: { id: participantId } });
    revalidatePath("/sdm/pelatihan");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[removeTrainingParticipant]");
  }
}
