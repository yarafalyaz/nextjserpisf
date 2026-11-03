"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { assertHrEmployeeAccess, getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope";
import { parseFormData } from "@/lib/validations/parse-form";
import { successionCandidateSchema } from "@/lib/validations/development.schemas";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";
import { computeSuccessionCoverage } from "@/lib/hr/hcms-scoring";

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

    const scope = await getHrScope(actor);
    await assertHrEmployeeAccess(scope, v.candidateEmployeeId);

    // Putaran 100: nilai ulang incumbent + kandidat hidup DI DALAM tx
    // berkunci baris employee kandidat. Pemeriksaan pra-tx saja kalah
    // balapan dengan updateEmployee yang memindahkan kandidat menjadi
    // pemegang jabatan target di jendela cek→upsert (kunci baris yang
    // sama diambil updateEmployee), sehingga kandidat bisa tampil
    // sebagai pengganti dirinya sendiri. Pemegang jabatan aktif tidak
    // menjadi kandidat untuk jabatannya sendiri — suksesi menyiapkan
    // pengganti, bukan orang yang sama.
    const row = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM employees WHERE id = ${v.candidateEmployeeId} FOR UPDATE`;
      }
      const candidate = await tx.employee.findFirst({
        where: { id: v.candidateEmployeeId, deletedAt: null, isActive: true },
        select: { id: true, positionId: true },
      });
      if (!candidate) throw new Error("Kandidat tidak ditemukan atau nonaktif");
      if (candidate.positionId === v.positionId) {
        throw new Error("Karyawan ini adalah pemegang jabatan tersebut saat ini");
      }
      return tx.successionCandidate.upsert({
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
    const actor = await requirePermission("delete_succession");
    const candidate = await prisma.successionCandidate.findUnique({
      where: { id },
      select: { candidateEmployeeId: true },
    });
    if (candidate) {
      const scope = await getHrScope(actor);
      await assertHrEmployeeAccess(scope, candidate.candidateEmployeeId);
    }
    await prisma.successionCandidate.delete({ where: { id } });
    revalidatePath("/sdm/suksesi");
    return { success: true as const };
  } catch (e: unknown) {
    return resultError(e, "[removeSuccessorCandidate]");
  }
}

/**
 * Ringkasan cakupan jabatan kritis DALAM cakupan HR pemanggil
 * (preseden competency-gap-queue: populasi disaring dulu, coverage
 * dihitung dari populasi tersaring; scope "all" identik perilaku lama).
 * Pemegang view_succession non-global (mis. kepala_bengkel) tidak lagi
 * melihat incumbent/kandidat/readiness departemen lain.
 */
export async function getSuccessionOverview() {
  const actor = await requirePermission("view_succession");
  const scope = await getHrScope(actor);
  const employeeWhere = hrEmployeeScopeWhere(scope);
  const positions = await prisma.position.findMany({
    where: {
      isCritical: true,
      // Scope departemen: jabatan di luar departemen tidak tampil sama
      // sekali. Team/self: populasi incumbent/kandidat tersaring di
      // bawah yang menentukan isi (preseden gap-queue).
      ...(scope.kind === "department"
        ? { departmentId: scope.departmentId ?? -1 }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      department: { select: { name: true } },
      employees: {
        where: { deletedAt: null, isActive: true, ...employeeWhere },
        select: { id: true, name: true },
      },
      successionCandidates: {
        where: { candidate: employeeWhere },
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
