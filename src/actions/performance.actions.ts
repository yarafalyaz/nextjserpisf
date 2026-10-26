"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import {
  getHrScope,
  assertHrEmployeeAccess,
} from "@/lib/auth/hr-scope";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  performanceCycleSchema,
  performanceGoalSchema,
} from "@/lib/validations/development.schemas";
import { nextSlug } from "@/lib/utils/slug-db";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";

/**
 * Skor akhir dari sasaran berbobot: rata-rata tertimbang skor capaian.
 * Sasaran tanpa skor diabaikan; tanpa sasaran ternilai hasilnya null.
 */
export function computeWeightedScore(
  goals: { score: number | null; weight: number }[],
): number | null {
  let weighted = 0;
  let weights = 0;
  for (const g of goals) {
    if (g.score == null) continue;
    weighted += g.score * g.weight;
    weights += g.weight;
  }
  if (weights === 0) return null;
  return Math.round((weighted / weights) * 100) / 100;
}

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

// ==================== SIKLUS ====================

export async function createPerformanceCycle(formData: FormData) {
  try {
    const user = await requirePermission("create_performance");
    const parsed = parseFormData(performanceCycleSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const cycle = await prisma.performanceCycle.create({
      data: {
        name: v.name,
        slug: await nextSlug("performanceCycle", v.name),
        periodStart: wibDateToUtcMidnight(v.periodStart),
        periodEnd: wibDateToUtcMidnight(v.periodEnd),
        status: "draft",
        createdBy: Number(user.id),
      },
    });

    await logActivity("create", "PerformanceCycle", cycle.id, `Membuat siklus penilaian ${cycle.name}`);
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: cycle.id, slug: cycle.slug };
  } catch (e: unknown) {
    return resultError(e, "[createPerformanceCycle]");
  }
}

export async function setPerformanceCycleStatus(id: number, status: "active" | "closed") {
  try {
    await requirePermission("edit_performance");
    const existing = await prisma.performanceCycle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return { success: false as const, error: "Siklus tidak ditemukan" };
    const allowed =
      (existing.status === "draft" && status === "active") ||
      (existing.status === "active" && status === "closed");
    if (!allowed) {
      return { success: false as const, error: `Siklus berstatus ${existing.status} tidak dapat menjadi ${status}` };
    }
    await prisma.performanceCycle.update({ where: { id }, data: { status } });
    await logActivity("update", "PerformanceCycle", id, `Siklus penilaian menjadi ${status}`);
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id };
  } catch (e: unknown) {
    return resultError(e, "[setPerformanceCycleStatus]");
  }
}

export async function deletePerformanceCycle(id: number) {
  try {
    await requirePermission("delete_performance");
    await prisma.performanceCycle.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await logActivity("delete", "PerformanceCycle", id, "Menghapus siklus penilaian");
    revalidatePath("/sdm/kinerja");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deletePerformanceCycle]");
  }
}

// ==================== SASARAN ====================

export async function upsertPerformanceGoal(formData: FormData, goalId?: number) {
  try {
    const actor = await requirePermission("edit_performance");
    const parsed = parseFormData(performanceGoalSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    // Sasaran hanya boleh ditulis untuk karyawan dalam scope penulis
    // (self untuk sasaran sendiri, tim/departemen untuk bawahan, all HR).
    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, v.employeeId);

    const data = {
      cycleId: v.cycleId,
      employeeId: v.employeeId,
      title: v.title,
      target: v.target ?? null,
      weight: v.weight,
      achievement: v.achievement ?? null,
      score: v.score ?? null,
    };

    const goal = goalId
      ? await prisma.performanceGoal.update({ where: { id: goalId }, data })
      : await prisma.performanceGoal.create({
          data: { ...data, createdBy: Number(actor.id) },
        });

    await logActivity(goalId ? "update" : "create", "PerformanceGoal", goal.id, `Sasaran kinerja: ${goal.title}`);
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: goal.id };
  } catch (e: unknown) {
    return resultError(e, "[upsertPerformanceGoal]");
  }
}

export async function deletePerformanceGoal(goalId: number) {
  try {
    const actor = await requirePermission("edit_performance");
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      select: { employeeId: true },
    });
    if (!goal) return { success: false as const, error: "Sasaran tidak ditemukan" };
    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, goal.employeeId);
    await prisma.performanceGoal.delete({ where: { id: goalId } });
    revalidatePath("/sdm/kinerja");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deletePerformanceGoal]");
  }
}

// ==================== ULASAN ====================

async function ensureReview(cycleId: number, employeeId: number, createdBy: number) {
  const existing = await prisma.performanceReview.findFirst({
    where: { cycleId, employeeId },
  });
  if (existing) return existing;
  return prisma.performanceReview.create({
    data: {
      cycleId,
      employeeId,
      slug: await nextSlug("performanceReview", `review-${cycleId}-${employeeId}`),
      status: "draft",
      createdBy,
    },
  });
}

export async function submitSelfReview(
  cycleId: number,
  employeeId: number,
  selfScore: number,
) {
  try {
    const actor = await requirePermission("view_performance");
    const scope = await getHrScope(actor);
    // Penilaian diri hanya untuk record sendiri, kecuali scope all (HR).
    if (scope.kind !== "all" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya dapat menilai diri sendiri");
    }
    if (selfScore < 0 || selfScore > 100) {
      return { success: false as const, error: "Skor harus 0-100" };
    }
    const review = await ensureReview(cycleId, employeeId, Number(actor.id));
    if (review.status === "finalized") {
      return { success: false as const, error: "Ulasan sudah difinalisasi" };
    }
    await prisma.performanceReview.update({
      where: { id: review.id },
      data: { selfScore, status: "self_submitted" },
    });
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: review.id };
  } catch (e: unknown) {
    return resultError(e, "[submitSelfReview]");
  }
}

export async function submitManagerReview(
  cycleId: number,
  employeeId: number,
  input: { managerScore: number; strengths?: string; improvements?: string },
) {
  try {
    const actor = await requirePermission("edit_performance");
    const scope = await getHrScope(actor);
    // Penilai wajib punya akses struktural ke karyawan ini (atasan/tim/HR).
    await assertHrEmployeeAccess(scope, employeeId);
    if (scope.kind === "self") {
      throw new Error("Anda tidak dapat menilai diri sendiri sebagai atasan");
    }
    if (input.managerScore < 0 || input.managerScore > 100) {
      return { success: false as const, error: "Skor harus 0-100" };
    }
    const review = await ensureReview(cycleId, employeeId, Number(actor.id));
    if (review.status === "finalized") {
      return { success: false as const, error: "Ulasan sudah difinalisasi" };
    }
    const reviewerEmployeeId =
      scope.kind === "all" ? review.reviewerEmployeeId : scope.employeeId;
    await prisma.performanceReview.update({
      where: { id: review.id },
      data: {
        managerScore: input.managerScore,
        strengths: input.strengths ?? null,
        improvements: input.improvements ?? null,
        reviewerEmployeeId,
        status: "manager_reviewed",
      },
    });
    await logActivity("update", "PerformanceReview", review.id, "Ulasan atasan disimpan");
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: review.id };
  } catch (e: unknown) {
    return resultError(e, "[submitManagerReview]");
  }
}

export async function finalizeReview(cycleId: number, employeeId: number) {
  try {
    const actor = await requirePermission("edit_performance");
    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, employeeId);

    const review = await ensureReview(cycleId, employeeId, Number(actor.id));
    if (review.status === "finalized") {
      return { success: false as const, error: "Ulasan sudah difinalisasi" };
    }
    const goals = await prisma.performanceGoal.findMany({
      where: { cycleId, employeeId },
      select: { score: true, weight: true },
    });
    const goalScore = computeWeightedScore(
      goals.map((g) => ({ score: g.score == null ? null : Number(g.score), weight: g.weight })),
    );
    const finalScore = goalScore ?? (review.managerScore == null ? null : Number(review.managerScore));
    if (finalScore == null) {
      return {
        success: false as const,
        error: "Belum ada skor sasaran maupun skor atasan untuk difinalisasi",
      };
    }
    await prisma.performanceReview.update({
      where: { id: review.id },
      data: { finalScore, status: "finalized" },
    });
    await logActivity("update", "PerformanceReview", review.id, `Ulasan difinalisasi (${finalScore})`);
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: review.id, finalScore };
  } catch (e: unknown) {
    return resultError(e, "[finalizeReview]");
  }
}
