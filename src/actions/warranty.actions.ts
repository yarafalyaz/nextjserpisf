"use server";

import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  createWarrantyClaimSchema,
  decideWarrantyClaimSchema,
  transitionWarrantyClaimSchema,
} from "@/lib/validations/warranty.schemas";
import {
  assessWarrantyEligibility,
  createWarrantyClaim,
  decideWarrantyClaim,
  transitionWarrantyClaim,
} from "@/lib/services/warranty.service";

// ==================== WARRANTY CLAIM ACTIONS (F-2026-10-21-021 tahap 2) ====================
// Service warranty.service.ts memegang state machine + keputusan manual;
// action ini hanya gerbang izin/validasi/audit. TANPA jurnal/provisi.

export async function createWarrantyClaimAction(formData: FormData) {
  try {
    const user = await requirePermission("create_warranty_claims");
    const parsed = parseFormData(createWarrantyClaimSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const claim = await createWarrantyClaim({
      coverageId: v.coverageId,
      reportedAt: v.reportedAt ?? new Date(),
      odometerKm: v.odometerKm ?? null,
      complaint: v.complaint,
      createdBy: Number(user.id),
    });

    revalidatePath("/produksi/garansi");
    await logActivity("create", "WarrantyClaim", claim.id, "Membuat klaim garansi");
    return { success: true, id: claim.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createWarrantyClaimAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal membuat klaim garansi") };
  }
}

export async function decideWarrantyClaimAction(formData: FormData) {
  try {
    const user = await requirePermission("approve_warranty_claims");
    const parsed = parseFormData(decideWarrantyClaimSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const claim = await decideWarrantyClaim({
      claimId: v.claimId,
      decision: v.decision,
      resolutionType: v.resolutionType,
      decisionBy: Number(user.id),
      decisionNotes: v.decisionNotes ?? null,
    });

    revalidatePath("/produksi/garansi");
    await logActivity(
      "update",
      "WarrantyClaim",
      claim.id,
      v.decision === "approved" ? "Menyetujui klaim garansi" : "Menolak klaim garansi",
    );
    return { success: true, id: claim.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[decideWarrantyClaimAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memutuskan klaim garansi") };
  }
}

export async function transitionWarrantyClaimAction(formData: FormData) {
  try {
    await requirePermission("edit_warranty_claims");
    const parsed = parseFormData(transitionWarrantyClaimSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const claim = await transitionWarrantyClaim({
      claimId: v.claimId,
      to: v.to,
      repairWorkOrderId: v.repairWorkOrderId ?? null,
    });

    revalidatePath("/produksi/garansi");
    await logActivity("update", "WarrantyClaim", claim.id, `Klaim garansi berpindah ke status ${v.to}`);
    return { success: true, id: claim.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[transitionWarrantyClaimAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal mengubah status klaim garansi") };
  }
}

/** Detail klaim + fakta eligibility untuk penilai. Fakta TIDAK memutuskan apa pun. */
export async function getWarrantyClaimDetail(claimId: number) {
  try {
    await requirePermission("view_warranty_claims");
    const claim = await prisma.warrantyClaim.findUnique({
      where: { id: claimId },
      include: {
        coverage: true,
        customerVehicle: { select: { id: true, plateNumber: true, lastOdometerKm: true } },
      },
    });
    if (!claim) return { success: false, error: "Klaim garansi tidak ditemukan." };
    const eligibility = assessWarrantyEligibility({
      coverage: claim.coverage,
      reportedAt: claim.reportedAt,
      odometerKm: claim.odometerKm,
    });
    return { success: true, claim, eligibility };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getWarrantyClaimDetail]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memuat klaim garansi") };
  }
}

/** Cakupan aktif satu kendaraan — titik mulai intake klaim dari detail kendaraan. */
export async function listWarrantyCoveragesByVehicle(customerVehicleId: number) {
  try {
    await requirePermission("view_warranty_claims");
    const coverages = await prisma.warrantyCoverage.findMany({
      where: { customerVehicleId },
      orderBy: { installedAt: "desc" },
      include: { item: { select: { id: true, name: true, sku: true } } },
    });
    return { success: true, coverages };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[listWarrantyCoveragesByVehicle]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memuat cakupan garansi") };
  }
}
