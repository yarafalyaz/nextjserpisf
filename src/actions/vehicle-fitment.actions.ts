"use server";

import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  createVehicleFitmentSchema,
  updateVehicleFitmentSchema,
  checkFitmentSchema,
} from "@/lib/validations/vehicle-fitment.schemas";
import {
  evaluateFitment,
  evaluateProductFitment,
} from "@/lib/services/vehicle-fitment.service";

// ==================== VEHICLE FITMENT RULE ACTIONS (VEH-07) ====================

export async function createVehicleFitment(formData: FormData) {
  try {
    const user = await requirePermission("create_vehicle_fitments");

    const parsed = parseFormData(createVehicleFitmentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.yearFrom != null && v.yearTo != null && v.yearFrom > v.yearTo) {
      return { success: false, error: "Tahun awal tidak boleh melebihi tahun akhir." };
    }

    const rule = await prisma.vehicleFitmentRule.create({
      data: {
        itemId: v.itemId,
        bomRevisionId: v.bomRevisionId ?? null,
        vehicleBrandId: v.vehicleBrandId ?? null,
        vehicleModelId: v.vehicleModelId ?? null,
        vehicleVariantId: v.vehicleVariantId ?? null,
        yearFrom: v.yearFrom ?? null,
        yearTo: v.yearTo ?? null,
        drivetrain: v.drivetrain ?? null,
        transmission: v.transmission ?? null,
        result: v.result,
        source: v.source ?? null,
        notes: v.notes ?? null,
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/kendaraan/fitment");
    await logActivity("create", "VehicleFitmentRule", rule.id, "Membuat aturan fitment kendaraan");
    return { success: true, id: rule.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVehicleFitment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal membuat aturan fitment") };
  }
}

export async function updateVehicleFitment(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicle_fitments");

    const parsed = parseFormData(updateVehicleFitmentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.yearFrom != null && v.yearTo != null && v.yearFrom > v.yearTo) {
      return { success: false, error: "Tahun awal tidak boleh melebihi tahun akhir." };
    }

    const rule = await prisma.vehicleFitmentRule.update({
      where: { id },
      data: {
        itemId: v.itemId,
        bomRevisionId: v.bomRevisionId ?? null,
        vehicleBrandId: v.vehicleBrandId ?? null,
        vehicleModelId: v.vehicleModelId ?? null,
        vehicleVariantId: v.vehicleVariantId ?? null,
        yearFrom: v.yearFrom ?? null,
        yearTo: v.yearTo ?? null,
        drivetrain: v.drivetrain ?? null,
        transmission: v.transmission ?? null,
        result: v.result,
        source: v.source ?? null,
        notes: v.notes ?? null,
        ...(v.isActive !== undefined ? { isActive: v.isActive } : {}),
      },
    });

    revalidatePath("/kendaraan/fitment");
    revalidatePath(`/kendaraan/fitment/${id}`);
    await logActivity("update", "VehicleFitmentRule", id, "Memperbarui aturan fitment kendaraan");
    return { success: true, id: rule.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVehicleFitment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memperbarui aturan fitment") };
  }
}

export async function deleteVehicleFitment(id: number) {
  try {
    await requirePermission("delete_vehicle_fitments");

    await prisma.vehicleFitmentRule.delete({ where: { id } });

    revalidatePath("/kendaraan/fitment");
    await logActivity("delete", "VehicleFitmentRule", id, "Menghapus aturan fitment kendaraan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVehicleFitment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal menghapus aturan fitment") };
  }
}

/**
 * Check fitment for a single item, or for a product's whole material list, against
 * a vehicle configuration. Returns `compatible | incompatible | unknown` with the
 * deciding rule's source/reason (VEH-07).
 */
export async function checkVehicleFitment(formData: FormData) {
  try {
    await requirePermission("view_vehicle_fitments");

    const parsed = parseFormData(checkFitmentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const configuration = {
      vehicleBrandId: v.vehicleBrandId ?? null,
      vehicleModelId: v.vehicleModelId ?? null,
      vehicleVariantId: v.vehicleVariantId ?? null,
      year: v.year ?? null,
      drivetrain: v.drivetrain ?? null,
      transmission: v.transmission ?? null,
    };

    if (v.itemId != null) {
      const evaluation = await evaluateFitment(prisma, {
        itemId: v.itemId,
        bomRevisionId: v.bomRevisionId ?? null,
        configuration,
      });
      return { success: true, mode: "item" as const, evaluation };
    }

    if (v.productId != null) {
      const lines = await evaluateProductFitment(prisma, {
        productId: v.productId,
        bomRevisionId: v.bomRevisionId ?? null,
        configuration,
      });
      return { success: true, mode: "product" as const, lines };
    }

    return { success: false, error: "Pilih produk atau item untuk diperiksa." };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[checkVehicleFitment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Gagal memeriksa kompatibilitas") };
  }
}
