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
  linkSupplierClaimSchema,
  postWarrantyClaimCostSchema,
  postWarrantySupplierRecoverySchema,
  transitionSupplierClaimSchema,
  transitionWarrantyClaimSchema,
} from "@/lib/validations/warranty.schemas";
import {
  postWarrantyClaimCostJournal,
  postWarrantySupplierRecoveryJournal,
} from "@/lib/services/warranty-journal.service";
import {
  assessWarrantyEligibility,
  createWarrantyClaim,
  decideWarrantyClaim,
  linkSupplierClaim,
  linkSupplierClaimVendorOnly,
  transitionSupplierClaim,
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

// ==================== SUPPLIER CLAIM LINK (F-2026-10-21-022) ====================
// Tautan dokumen saja: TANPA jurnal recovery, TANPA auto-buat PurchaseReturn.
// Permission existing dipakai ulang (edit/approve_warranty_claims); retur
// lahir terpisah lewat createPurchaseReturn existing (create_purchase_returns).

export async function linkSupplierClaimAction(formData: FormData) {
  try {
    const user = await requirePermission("edit_warranty_claims");
    const parsed = parseFormData(linkSupplierClaimSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const claim =
      v.purchaseReturnId != null
        ? await linkSupplierClaim({
            claimId: v.claimId,
            supplierClaimVendorId: v.supplierClaimVendorId,
            purchaseReturnId: v.purchaseReturnId,
            actorUserId: Number(user.id),
            supplierClaimRefNo: v.supplierClaimRefNo ?? null,
            supplierClaimNotes: v.supplierClaimNotes ?? null,
          })
        : await linkSupplierClaimVendorOnly({
            claimId: v.claimId,
            supplierClaimVendorId: v.supplierClaimVendorId,
            actorUserId: Number(user.id),
            supplierClaimRefNo: v.supplierClaimRefNo ?? null,
            supplierClaimNotes: v.supplierClaimNotes ?? "",
          });

    revalidatePath("/produksi/garansi");
    await logActivity("update", "WarrantyClaim", claim.id, "Menautkan klaim supplier part cacat");
    return { success: true, id: claim.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[linkSupplierClaimAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal menautkan klaim supplier") };
  }
}

export async function transitionSupplierClaimAction(formData: FormData) {
  try {
    const parsed = parseFormData(transitionSupplierClaimSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;
    // R2 kirim + R6/R8 tutup final = persetujuan: approve_warranty_claims.
    // Langkah pencatatan lain (accepted/rejected/returned/lepas) = edit.
    const user =
      v.to === "sent" || v.to === "closed_no_recovery"
        ? await requirePermission("approve_warranty_claims")
        : await requirePermission("edit_warranty_claims");
    const roles = (user as { roles?: string[] }).roles ?? [];
    const actorIsAdmin = roles.includes("admin") || roles.includes("super_admin");

    const claim = await transitionSupplierClaim({
      claimId: v.claimId,
      to: v.to,
      actorUserId: Number(user.id),
      actorIsAdmin,
      supplierClaimRefNo: v.supplierClaimRefNo ?? null,
      supplierClaimNotes: v.supplierClaimNotes ?? null,
    });

    revalidatePath("/produksi/garansi");
    await logActivity(
      "update",
      "WarrantyClaim",
      claim.id,
      `Status klaim supplier berpindah ke ${v.to}`,
    );
    return { success: true, id: claim.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[transitionSupplierClaimAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal mengubah status klaim supplier") };
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
        supplierClaimVendor: { select: { id: true, name: true } },
        purchaseReturn: { select: { id: true, documentNo: true, status: true } },
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

// ==================== JURNAL GARANSI TAHAP 3 RUTE MATI (E2/E3) ====================
// Posting jurnal = aksi finansial: izin menyetujui klaim (pejabat yang sama
// yang memutus klaim). Syarat jurnal hidup di warranty-journal.service.ts.

export async function postWarrantyClaimCostAction(formData: FormData) {
  try {
    const user = await requirePermission("approve_warranty_claims");
    const parsed = parseFormData(postWarrantyClaimCostSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const result = await postWarrantyClaimCostJournal({
      claimId: v.claimId,
      eventDate: v.eventDate ?? new Date(),
      createdBy: Number(user.id),
    });

    revalidatePath("/produksi/garansi");
    await logActivity("create", "Journal", result.journalId, `Posting jurnal biaya klaim garansi #${v.claimId} (${result.journalNumber})`);
    return { success: true, journalId: result.journalId, journalNumber: result.journalNumber, amount: result.amount };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postWarrantyClaimCostAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memposting jurnal biaya garansi") };
  }
}

export async function postWarrantySupplierRecoveryAction(formData: FormData) {
  try {
    const user = await requirePermission("approve_warranty_claims");
    const parsed = parseFormData(postWarrantySupplierRecoverySchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const result = await postWarrantySupplierRecoveryJournal({
      claimId: v.claimId,
      amount: v.amount,
      eventDate: v.eventDate ?? new Date(),
      createdBy: Number(user.id),
    });

    revalidatePath("/produksi/garansi");
    await logActivity("create", "Journal", result.journalId, `Posting jurnal recovery supplier garansi #${v.claimId} (${result.journalNumber})`);
    return { success: true, journalId: result.journalId, journalNumber: result.journalNumber, amount: result.amount };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postWarrantySupplierRecoveryAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memposting jurnal recovery supplier") };
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
