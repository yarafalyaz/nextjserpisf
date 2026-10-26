"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { parseFormData } from "@/lib/validations/parse-form";
import { successionCandidateSchema } from "@/lib/validations/development.schemas";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";

export const READINESS_LEVELS = ["ready_now", "ready_1_2_years", "ready_future"] as const;

export const READINESS_LABELS: Record<string, string> = {
  ready_now: "Siap Sekarang",
  ready_1_2_years: "Siap 1-2 Tahun",
  ready_future: "Siap Masa Depan",
};

export type SuccessionCoverage = "covered" | "at_risk" | "vacant";

/**
 * Cakupan suksesi satu jabatan dari kandidatnya: ada yang siap sekarang
 * berarti aman; hanya kandidat masa depan berarti berisiko; tanpa
 * kandidat sama sekali berarti kosong.
 */
export function computeSuccessionCoverage(
  candidates: { readiness: string }[],
): SuccessionCoverage {
  if (candidates.length === 0) return "vacant";
  if (candidates.some((c) => c.readiness === "ready_now")) return "covered";
  return "at_risk";
}

function resultError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

export async function setPositionCritical(positionId: number, isCritical: boolean) {
  try {
    await requirePermission("edit_succession");
    await prisma.position.update({
      where: { id: positionId },
      data: { isCritical },
    });
    await logActivity("update", "Position", positionId, `Jabatan kritis: ${isCritical ? "ya" : "tidak"}`);
    revalidatePath("/sdm/suksesi");
    return { success: true as const, id: positionId };
  } catch (e: unknown) {
    return resultError(e, "[setPositionCritical]");
  }
}

export async function upsertSuccessorCandidate(formData: FormData) {
  try {
    const actor = await requirePermission("create_succession");
    const parsed = parseFormData(successionCandidateSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    // Pemegang jabatan aktif tidak menjadi kandidat untuk jabatannya
    // sendiri — suksesi menyiapkan pengganti, bukan orang yang sama.
    const incumbent = await prisma.employee.findFirst({
      where: { id: v.candidateEmployeeId, positionId: v.positionId, deletedAt: null },
      select: { id: true },
    });
    if (incumbent) {
      return {
        success: false as const,
        error: "Karyawan ini adalah pemegang jabatan tersebut saat ini",
      };
    }

    const candidate = await prisma.employee.findFirst({
      where: { id: v.candidateEmployeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!candidate) {
      return { success: false as const, error: "Kandidat tidak ditemukan atau nonaktif" };
    }

    const row = await prisma.successionCandidate.upsert({
      where: {
        positionId_candidateEmployeeId: {
          positionId: v.positionId,
          candidateEmployeeId: v.candidateEmployeeId,
        },
      },
      create: {
        ...v,
        notes: v.notes ?? null,
        assessedBy: Number(actor.id),
        createdBy: Number(actor.id),
      },
      update: {
        readiness: v.readiness,
        rank: v.rank,
        notes: v.notes ?? null,
        assessedBy: Number(actor.id),
      },
    });

    await logActivity("create", "SuccessionCandidate", row.id, "Menetapkan kandidat suksesi");
    revalidatePath("/sdm/suksesi");
    return { success: true as const, id: row.id };
  } catch (e: unknown) {
    return resultError(e, "[upsertSuccessorCandidate]");
  }
}

export async function removeSuccessorCandidate(id: number) {
  try {
    await requirePermission("delete_succession");
    await prisma.successionCandidate.delete({ where: { id } });
    revalidatePath("/sdm/suksesi");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[removeSuccessorCandidate]");
  }
}

/** Ringkasan cakupan untuk seluruh jabatan kritis. */
export async function getSuccessionOverview() {
  await requirePermission("view_succession");
  const positions = await prisma.position.findMany({
    where: { isCritical: true },
    orderBy: { name: "asc" },
    include: {
      department: { select: { name: true } },
      employees: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
      },
      successionCandidates: {
        orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
        include: { candidate: { select: { id: true, name: true } } },
      },
    },
  });
  return positions.map((p) => ({
    positionId: p.id,
    positionName: p.name,
    departmentName: p.department?.name ?? null,
    incumbents: p.employees,
    candidates: p.successionCandidates.map((c) => ({
      id: c.id,
      employeeId: c.candidateEmployeeId,
      employeeName: c.candidate.name,
      readiness: c.readiness,
      rank: c.rank,
    })),
    coverage: computeSuccessionCoverage(p.successionCandidates),
  }));
}
