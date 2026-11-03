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
import { nextSlugWithClient } from "@/lib/utils/slug-db";
import { checkIdempotency } from "@/lib/utils/idempotency";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";
import { computeWeightedScore } from "@/lib/hr/hcms-scoring";

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

/**
 * Siklus hidup siklus penilaian: draft -> active -> closed. Penulisan
 * sasaran/ulasan hanya sah pada siklus ACTIVE; tanpa gerbang ini sasaran
 * dan skor final tetap bisa lahir pada siklus yang sudah ditutup.
 */

type PerformanceDb = any;

function assertCycleActive(
  cycle: { status: string } | null,
): asserts cycle is { status: "active" } {
  if (!cycle) throw new Error("Siklus penilaian tidak ditemukan");
  if (cycle.status !== "active") {
    throw new Error(
      `Siklus penilaian berstatus ${cycle.status}; sasaran dan ulasan hanya dapat ditulis pada siklus aktif`,
    );
  }
}

async function assertPerformanceCycleActive(db: PerformanceDb, cycleId: number) {
  if (typeof db.$executeRaw === "function") {
    await db.$executeRaw`SELECT id FROM performance_cycles WHERE id = ${cycleId} FOR UPDATE`;
  }
  const cycle = await db.performanceCycle.findFirst({
    where: { id: cycleId, deletedAt: null },
    select: { status: true },
  });
  assertCycleActive(cycle);
}

async function ensureReviewInTransaction(
  tx: PerformanceDb,
  cycleId: number,
  employeeId: number,
  createdBy: number,
) {
  await assertPerformanceCycleActive(tx, cycleId);
  const existing = await tx.performanceReview.findFirst({
    where: { cycleId, employeeId },
  });
  if (existing) return existing;

  try {
    return await tx.performanceReview.create({
      data: {
        cycleId,
        employeeId,
        slug: await nextSlugWithClient(
          tx as never,
          "performanceReview",
          `review-${cycleId}-${employeeId}`,
        ),
        status: "draft",
        createdBy,
      },
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") {
      const winner = await tx.performanceReview.findFirst({
        where: { cycleId, employeeId },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

// ==================== SIKLUS ====================

export async function createPerformanceCycle(formData: FormData) {
  try {
    const user = await requirePermission("create_performance");
    const parsed = parseFormData(performanceCycleSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    // Putaran 78: create dalam tx berkunci idempotency + slug delegate tx.
    // Varian global tidak melihat siklus tak-tercommit dan retry identik
    // tanpa key bisa melahirkan siklus ganda / P2002 slug mentah.
    const cycle = await prisma.$transaction(async (tx) => {
      await checkIdempotency(
        formData.get("idempotencyKey") as string | null,
        tx,
        user.id,
      );
      return tx.performanceCycle.create({
        data: {
          name: v.name,
          slug: await nextSlugWithClient(tx as never, "performanceCycle", v.name),
          periodStart: wibDateToUtcMidnight(v.periodStart),
          periodEnd: wibDateToUtcMidnight(v.periodEnd),
          status: "draft",
          createdBy: Number(user.id),
        },
      });
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

    // Klaim transisi berpredikat status terbaca: dua aktor tidak boleh saling
    // menimpa (closed -> active basi tidak boleh menang atas closed).
    const claimed = await prisma.performanceCycle.updateMany({
      where: { id, deletedAt: null, status: existing.status },
      data: { status },
    });
    if (claimed.count === 0) {
      return {
        success: false as const,
        error: "Status siklus berubah; muat ulang sebelum mengubah status",
      };
    }
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

    if (goalId) {
      // Update wajib membuktikan akses ke PEMILIK existing dulu (pola
      // deletePerformanceGoal): tanpa ini sasaran milik karyawan luar
      // scope bisa ditimpa/dipindah hanya dengan menebak goalId.
      const existing = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        select: { employeeId: true },
      });
      if (!existing) return { success: false as const, error: "Sasaran tidak ditemukan" };
      await assertHrEmployeeAccess(scope, existing.employeeId);
      // Pemilik baru (bila berubah) sudah dicek di atas via v.employeeId.
    }

    const data = {
      cycleId: v.cycleId,
      employeeId: v.employeeId,
      title: v.title,
      target: v.target ?? null,
      weight: v.weight,
      achievement: v.achievement ?? null,
      score: v.score ?? null,
    };

    // Status siklus dinilai ulang dalam tx sesudah baris siklus dikunci,
    // sehingga penutupan siklus konkuren tidak bisa dilewati oleh snapshot
    // global yang masih menyebut active.
    const goal = await prisma.$transaction(async (tx) => {
      await assertPerformanceCycleActive(tx, v.cycleId);
      return goalId
        ? tx.performanceGoal.update({ where: { id: goalId }, data })
        : tx.performanceGoal.create({
            data: { ...data, createdBy: Number(actor.id) },
          });
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
      select: { employeeId: true, cycleId: true },
    });
    if (!goal) return { success: false as const, error: "Sasaran tidak ditemukan" };
    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, goal.employeeId);
    await prisma.$transaction(async (tx) => {
      await assertPerformanceCycleActive(tx, goal.cycleId);
      await tx.performanceGoal.delete({ where: { id: goalId } });
    });
    revalidatePath("/sdm/kinerja");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[deletePerformanceGoal]");
  }
}

// ==================== ULASAN ====================

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
    const claim = await prisma.$transaction(async (tx) => {
      const review = await ensureReviewInTransaction(
        tx,
        cycleId,
        employeeId,
        Number(actor.id),
      );
      if (review.status === "finalized") {
        return {
          reviewId: review.id,
          claimed: false as const,
          error: "Ulasan sudah difinalisasi",
        };
      }
      // Klaim kondisional: finalisasi konkuren yang menang membuat count 0.
      const result = await tx.performanceReview.updateMany({
        where: { id: review.id, status: { not: "finalized" } },
        data: { selfScore, status: "self_submitted" },
      });
      return {
        reviewId: review.id,
        claimed: result.count > 0,
        error:
          result.count > 0 ? null : "Ulasan sudah difinalisasi",
      };
    });
    if (!claim.claimed) {
      return { success: false as const, error: claim.error ?? "Ulasan sudah difinalisasi" };
    }
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: claim.reviewId };
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
    const claim = await prisma.$transaction(async (tx) => {
      const review = await ensureReviewInTransaction(
        tx,
        cycleId,
        employeeId,
        Number(actor.id),
      );
      if (review.status === "finalized") {
        return {
          reviewId: review.id,
          claimed: false as const,
          error: "Ulasan sudah difinalisasi",
        };
      }
      const reviewerEmployeeId =
        scope.kind === "all" ? review.reviewerEmployeeId : scope.employeeId;
      // Klaim kondisional: finalisasi konkuren yang menang membuat count 0,
      // sehingga skor atasan tidak menimpa baris finalized dari snapshot basi.
      const result = await tx.performanceReview.updateMany({
        where: { id: review.id, status: { not: "finalized" } },
        data: {
          managerScore: input.managerScore,
          strengths: input.strengths ?? null,
          improvements: input.improvements ?? null,
          reviewerEmployeeId,
          status: "manager_reviewed",
        },
      });
      return {
        reviewId: review.id,
        claimed: result.count > 0,
        error:
          result.count > 0 ? null : "Ulasan sudah difinalisasi",
      };
    });
    if (!claim.claimed) {
      return { success: false as const, error: claim.error ?? "Ulasan sudah difinalisasi" };
    }
    await logActivity("update", "PerformanceReview", claim.reviewId, "Ulasan atasan disimpan");
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: claim.reviewId };
  } catch (e: unknown) {
    return resultError(e, "[submitManagerReview]");
  }
}

export async function finalizeReview(cycleId: number, employeeId: number) {
  try {
    const actor = await requirePermission("edit_performance");
    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, employeeId);

    const finalized = await prisma.$transaction(async (tx) => {
      const review = await ensureReviewInTransaction(
        tx,
        cycleId,
        employeeId,
        Number(actor.id),
      );
      if (review.status === "finalized") {
        return {
          reviewId: review.id,
          claimed: false as const,
          finalScore: null,
          error: "Ulasan sudah difinalisasi",
        };
      }
      const goals = await tx.performanceGoal.findMany({
        where: { cycleId, employeeId },
        select: { score: true, weight: true },
      });
      const goalScore = computeWeightedScore(
        goals.map((g) => ({ score: g.score == null ? null : Number(g.score), weight: g.weight })),
      );
      const finalScore = goalScore ?? (review.managerScore == null ? null : Number(review.managerScore));
      if (finalScore == null) {
        return {
          reviewId: review.id,
          claimed: false as const,
          finalScore: null,
          error: "Belum ada skor sasaran maupun skor atasan untuk difinalisasi",
        };
      }
      // Klaim dari status terbaca: submit konkuren yang mengubah status lebih
      // dulu membuat count 0 daripada finalScore basi tersimpan senyap.
      const result = await tx.performanceReview.updateMany({
        where: { id: review.id, status: review.status },
        data: { finalScore, status: "finalized" },
      });
      if (result.count === 0) {
        return {
          reviewId: review.id,
          claimed: false as const,
          finalScore: null,
          error: "Status ulasan berubah saat finalisasi; muat ulang sebelum finalisasi",
        };
      }
      return {
        reviewId: review.id,
        claimed: true as const,
        finalScore,
        error: null,
      };
    });
    if (!finalized.claimed || finalized.finalScore == null) {
      return {
        success: false as const,
        error: finalized.error ?? "Ulasan sudah difinalisasi",
      };
    }
    await logActivity("update", "PerformanceReview", finalized.reviewId, `Ulasan difinalisasi (${finalized.finalScore})`);
    revalidatePath("/sdm/kinerja");
    return { success: true as const, id: finalized.reviewId, finalScore: finalized.finalScore };
  } catch (e: unknown) {
    return resultError(e, "[finalizeReview]");
  }
}
