"use server";

import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services/activity-log.service";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  vehicleBrandSchema,
  vehicleModelSchema,
  vehicleVariantSchema,
  vehicleSchema,
  customerVehicleSchema,
  serviceScheduleSchema,
} from "@/lib/validations/vehicle.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { nextSlug } from "@/lib/utils/slug-db";

// ==================== VEHICLE BRAND ACTIONS ====================

export async function createVehicleBrand(formData: FormData) {
  try {
    await requirePermission("create_vehicle_brands");

    const parsed = parseFormData(vehicleBrandSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const vehicleBrand = await prisma.vehicleBrand.create({
      data: {
        name: parsed.data.name,
        slug: await nextSlug("vehicleBrand", parsed.data.name),
      },
    });

    revalidatePath("/kendaraan/merek");
    await logActivity(
      "create",
      "VehicleBrand",
      vehicleBrand.id,
      "Membuat merek kendaraan",
    );
    return { success: true, id: vehicleBrand.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVehicleBrand]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal membuat merek kendaraan"),
    };
  }
}

// ==================== VEHICLE MODEL ACTIONS ====================

export async function createVehicleModel(formData: FormData) {
  try {
    await requirePermission("create_vehicle_models");

    const parsed = parseFormData(vehicleModelSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { name, vehicleBrandId } = parsed.data;

    const duplicate = await prisma.vehicleModel.findFirst({
      where: { vehicleBrandId, name },
    });
    if (duplicate) {
      return {
        success: false,
        error: `Model "${name}" sudah ada untuk merek ini.`,
      };
    }

    const model = await prisma.vehicleModel.create({
      data: {
        name,
        vehicleBrandId,
        slug: await nextSlug("vehicleModel", name),
      },
    });

    revalidatePath("/kendaraan/model");
    revalidatePath("/kendaraan/merek");
    await logActivity(
      "create",
      "VehicleModel",
      model.id,
      "Membuat model kendaraan",
    );
    return { success: true, id: model.id, slug: model.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVehicleModel]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal membuat model kendaraan"),
    };
  }
}

// ==================== VEHICLE ACTIONS ====================

export async function createVehicle(formData: FormData) {
  try {
    await requirePermission("create_vehicles");

    const parsed = parseFormData(vehicleSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { variantId, name, year } = parsed.data;

    // `Vehicle` is the catalog type master: it only carries the variant link,
    // an optional label and a model year. Physical-unit attributes (plate,
    // color) live on CustomerVehicle. No customer linkage here — a customer's
    // ownership of this type is created via /kendaraan/pelanggan.
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleVariantId: variantId,
        name: name ?? null,
        year: year ?? null,
        slug: await nextSlug("vehicle", name ?? "vehicle"),
      },
    });

    revalidatePath("/kendaraan");
    await logActivity("create", "Vehicle", vehicle.id, "Membuat tipe kendaraan");
    return { success: true, id: vehicle.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal membuat tipe kendaraan"),
    };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVehicleBrand(id: number) {
  try {
    await requirePermission("delete_vehicle_brands");

    // Integrity guard: Product.vehicleBrandId is ON DELETE SET NULL, so a raw
    // delete silently NULLs the brand-compatibility tag on every product that
    // referenced it — no error, no warning. VehicleModel.vehicleBrandId is
    // ON DELETE RESTRICT (a raw delete errors if models exist), and now
    // VehicleFitmentRule.vehicleBrandId is SET NULL too. Mirrors
    // ditolak pola deletePosition/deletePaymentTerm — dengan pesan Indonesia yang
    // menyebut jumlahnya. Hanya relasi opsional SetNull yang bermasalah: tautan
    // kendaraan (yang malah MELEBAR jadi wildcard saat induknya hilang) dan
    // tautan kompatibilitas produk. Varian→Kendaraan Restrict, jadi tidak perlu.
    const [productCount, ruleCount] = await Promise.all([
      prisma.product.count({ where: { vehicleBrandId: id } }),
      prisma.vehicleFitmentRule.count({ where: { vehicleBrandId: id } }),
    ]);
    const totalCount = productCount + ruleCount;
    if (totalCount > 0) {
      return {
        success: false,
        error:
          `Merek kendaraan ini masih dipakai oleh ${totalCount} data (produk: ${productCount}, aturan kompatibilitas: ${ruleCount}) ` +
          `dan tidak bisa dihapus karena akan menghilangkan informasi kompatibilitas merek. ` +
          `Lepas asosiasi merek dari produk dan aturan terlebih dahulu.`,
      };
    }

    await prisma.vehicleBrand.delete({ where: { id } });

    revalidatePath("/kendaraan/merek");
    await logActivity(
      "delete",
      "VehicleBrand",
      id,
      "Menghapus merek kendaraan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVehicleBrand]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(
        e,
        "Gagal menghapus merek kendaraan. Pastikan tidak ada model yang masih memakai merek ini.",
      ),
    };
  }
}

export async function deleteVehicleModel(id: number) {
  try {
    await requirePermission("delete_vehicle_models");

    // Integrity guard: Product.vehicleModelId is ON DELETE SET NULL, so a raw
    // delete silently NULLs the model-compatibility tag on every product that
    // referenced it — no error, no warning — and now
    // VehicleFitmentRule.vehicleModelId is SET NULL too, widening those rules
    // to a model-wildcard. VehicleModel.vehicleBrandId is RESTRICT, so a raw
    // delete of a model still in use errors generically. Mirrors
    // deletePosition/deletePaymentTerm's guard — refuse with an Indonesian
    // error listing the count, let the operator detach products first.
    // Hanya relasi opsional SetNull yang bermasalah: aturan kendaraan (yang
    // malah MELEBAR jadi wildcard saat induknya hilang) dan tautan
    // kompatibilitas produk. Varian→Model Restrict, jadi tidak perlu.
    const [productCount, ruleCount] = await Promise.all([
      prisma.product.count({ where: { vehicleModelId: id } }),
      prisma.vehicleFitmentRule.count({ where: { vehicleModelId: id } }),
    ]);
    const totalCount = productCount + ruleCount;
    if (totalCount > 0) {
      return {
        success: false,
        error:
          `Model kendaraan ini masih dipakai oleh ${totalCount} data (produk: ${productCount}, aturan kompatibilitas: ${ruleCount}) ` +
          `dan tidak bisa dihapus karena akan menghilangkan informasi kompatibilitas model. ` +
          `Lepas asosiasi model dari produk dan aturan terlebih dahulu.`,
      };
    }

    await prisma.vehicleModel.delete({ where: { id } });

    revalidatePath("/kendaraan/model");
    revalidatePath("/kendaraan/merek");
    await logActivity(
      "delete",
      "VehicleModel",
      id,
      "Menghapus model kendaraan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVehicleModel]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal menghapus model kendaraan"),
    };
  }
}

// ==================== VEHICLE VARIANT ACTIONS ====================

export async function createVehicleVariant(formData: FormData) {
  try {
    await requirePermission("edit_vehicle_models");

    const parsed = parseFormData(vehicleVariantSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { name, vehicleModelId, drivetrain, transmission } = parsed.data;

    const duplicate = await prisma.vehicleVariant.findFirst({
      where: { vehicleModelId, name },
    });
    if (duplicate) {
      return {
        success: false,
        error: `Varian "${name}" sudah ada untuk model ini.`,
      };
    }

    const variant = await prisma.vehicleVariant.create({
      data: {
        vehicleModelId,
        name,
        drivetrain: drivetrain ?? null,
        transmission: transmission ?? null,
      },
    });

    revalidatePath(`/kendaraan/model/${vehicleModelId}/ubah`);
    revalidatePath("/kendaraan/model");
    revalidatePath("/kendaraan/merek");
    await logActivity(
      "create",
      "VehicleVariant",
      variant.id,
      "Membuat varian kendaraan",
    );
    return { success: true, id: variant.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVehicleVariant]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal membuat varian kendaraan"),
    };
  }
}

export async function deleteVehicleVariant(id: number) {
  try {
    await requirePermission("edit_vehicle_models");

    // Guard: refuse if vehicles are using this variant. Vehicle.vehicleVariantId
    // is Restrict (aman), tapi VehicleFitmentRule.vehicleVariantId opsional
    // SetNull — hapus varian tanpa penjagaan diam-diam MELEBARkan aturan itu
    // jadi wildcard varian. Kolomnya memang ditulis fitment actions, jadi hidup.
    const [vehicleCount, ruleCount] = await Promise.all([
      prisma.vehicle.count({ where: { vehicleVariantId: id } }),
      prisma.vehicleFitmentRule.count({ where: { vehicleVariantId: id } }),
    ]);
    const inUseCount = vehicleCount + ruleCount;
    if (inUseCount > 0) {
      return {
        success: false,
        error: `Tidak bisa menghapus varian — masih dipakai oleh ${inUseCount} data (kendaraan: ${vehicleCount}, aturan kompatibilitas: ${ruleCount}).`,
      };
    }

    const variant = await prisma.vehicleVariant.findUnique({ where: { id } });
    await prisma.vehicleVariant.delete({ where: { id } });

    if (variant)
      revalidatePath(`/kendaraan/model/${variant.vehicleModelId}/ubah`);
    revalidatePath("/kendaraan/model");
    revalidatePath("/kendaraan/merek");
    await logActivity(
      "delete",
      "VehicleVariant",
      id,
      "Menghapus varian kendaraan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVehicleVariant]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(
        e,
        "Gagal menghapus varian. Pastikan tidak ada kendaraan yang masih memakai varian ini.",
      ),
    };
  }
}

export async function updateVehicleBrand(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicle_brands");

    const parsed = parseFormData(vehicleBrandSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    await prisma.vehicleBrand.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: await nextSlug("vehicleBrand", parsed.data.name, {
          excludeId: id,
        }),
      },
    });

    revalidatePath("/kendaraan/merek");
    await logActivity(
      "update",
      "VehicleBrand",
      id,
      "Memperbarui merek kendaraan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVehicleBrand]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal memperbarui merek kendaraan"),
    };
  }
}

export async function updateVehicleModel(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicle_models");

    const parsed = parseFormData(vehicleModelSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { name, vehicleBrandId } = parsed.data;

    const duplicate = await prisma.vehicleModel.findFirst({
      where: { vehicleBrandId, name, NOT: { id } },
    });
    if (duplicate) {
      return {
        success: false,
        error: `Model "${name}" sudah ada untuk merek ini.`,
      };
    }

    const model = await prisma.vehicleModel.update({
      where: { id },
      data: {
        name,
        vehicleBrandId,
        slug: await nextSlug("vehicleModel", name, { excludeId: id }),
      },
    });

    revalidatePath("/kendaraan/model");
    revalidatePath("/kendaraan/merek");
    await logActivity(
      "update",
      "VehicleModel",
      model.id,
      "Memperbarui model kendaraan",
    );
    return { success: true, id: model.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVehicleModel]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal memperbarui model kendaraan"),
    };
  }
}

export async function updateVehicle(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicles");

    const parsed = parseFormData(vehicleSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { variantId, name, year } = parsed.data;

    await prisma.vehicle.update({
      where: { id },
      data: {
        vehicleVariantId: variantId,
        name: name ?? null,
        year: year ?? null,
        slug: await nextSlug("vehicle", name ?? "vehicle", { excludeId: id }),
      },
    });

    revalidatePath("/kendaraan");
    await logActivity("update", "Vehicle", id, "Memperbarui tipe kendaraan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal memperbarui tipe kendaraan"),
    };
  }
}

// Vehicle delete

export async function deleteVehicle(id: number) {
  try {
    await requirePermission("delete_vehicles");

    // Integrity guard: Vehicle → CustomerVehicle is now onDelete: Restrict, and
    // the customerVehicleId on Quotation/WorkOrder/SalesOrder/SalesInvoice/Project
    // is nullable (SetNull). A raw delete would either be refused by the FK (when
    // a link still exists) or, if we removed links first, silently NULL the
    // vehicle reference on every historical document, erasing service-history
    // linkage. Refuse if any dependent record exists (mirrors deleteRole's
    // in-use guard) — or if any (non-deleted) customer still owns this type.
    const links = await prisma.customerVehicle.findMany({
      where: { vehicleId: id, deletedAt: null },
      select: {
        id: true,
        _count: {
          select: { workOrders: true, quotations: true, projects: true },
        },
      },
    });
    const relationDependents = links.reduce(
      (sum, l) =>
        sum + l._count.workOrders + l._count.quotations + l._count.projects,
      0,
    );

    // SalesOrder.customerVehicleId and SalesInvoice.customerVehicleId are plain
    // (non-relation) Int columns — CustomerVehicle has no back-relation for them,
    // so they cannot be counted via _count above. The guard's comment promised to
    // protect SalesOrder/SalesInvoice but the code never enforced it: a vehicle
    // referenced ONLY by an SO/Invoice (no WO/quotation/project) would pass and be
    // deleted, orphaning their customer_vehicle_id (no FK = silent dangling
    // reference, erasing the vehicle linkage on financial documents). Count them
    // directly against the cascade-deleted CustomerVehicle link ids.
    const linkIds = links.map((l) => l.id);
    let salesDependents = 0;
    if (linkIds.length > 0) {
      const [soCount, invCount] = await Promise.all([
        prisma.salesOrder.count({
          where: { customerVehicleId: { in: linkIds } },
        }),
        prisma.salesInvoice.count({
          where: { customerVehicleId: { in: linkIds } },
        }),
      ]);
      salesDependents = soCount + invCount;
    }

    const dependents = relationDependents + salesDependents;
    if (dependents > 0) {
      return {
        success: false,
        error:
          `Kendaraan ini punya ${dependents} dokumen terkait (perintah kerja/penawaran/proyek/penjualan) ` +
          `dan tidak bisa dihapus karena akan menghilangkan riwayat servis. Nonaktifkan kepemilikan kendaraan sebagai gantinya.`,
      };
    }

    await prisma.vehicle.delete({ where: { id } });
    revalidatePath("/kendaraan");
    await logActivity("delete", "Vehicle", id, "Menghapus kendaraan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal menghapus kendaraan"),
    };
  }
}

// ==================== CUSTOMER VEHICLE ACTIONS ====================

/**
 * Opsi varian kendaraan untuk dialog quick-add ("Toyota Avanza 1.3 G"). Dipakai saat
 * menambah kendaraan pelanggan langsung dari form Penawaran/Proyek tanpa pindah halaman.
 */
export async function listVehicleVariantOptions(): Promise<{ value: string; label: string }[]> {
  await requirePermission("view_vehicles");
  const variants = await prisma.vehicleVariant.findMany({
    select: {
      id: true,
      name: true,
      model: { select: { name: true, brand: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return variants.map((variant) => ({
    value: String(variant.id),
    label: [variant.model?.brand?.name, variant.model?.name, variant.name]
      .filter(Boolean)
      .join(" "),
  }));
}

// FK hanya dicek format (int positif) oleh schema: customer terhapus,
// varian/tipe fiktif lolos lalu gagal P2003 mentah. Cek eksistensi
// pra-tulis (pola withholding-tax/position-department).
async function assertCustomerVehicleRefsExist(input: {
  customerId: number;
  variantId?: number | null;
  formVehicleId?: number | null;
  kendaraanId?: number | null;
}): Promise<string | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!customer) return "Pelanggan tidak ditemukan";
  if (input.variantId) {
    const variant = await prisma.vehicleVariant.findFirst({
      where: { id: input.variantId },
      select: { id: true },
    });
    if (!variant) return "Varian kendaraan tidak ditemukan";
  } else {
    const rawVehicleId = input.formVehicleId ?? input.kendaraanId;
    if (rawVehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: rawVehicleId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) return "Tipe kendaraan tidak ditemukan";
    }
  }
  return null;
}

export async function createCustomerVehicle(formData: FormData) {
  try {
    await requirePermission("create_customers");

    const parsed = parseFormData(customerVehicleSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const {
      customerId,
      variantId,
      vehicleId: formVehicleId,
      kendaraanId,
      plateNumber,
      color,
      year,
      chassisNumber,
      engineNumber,
      isActive,
      notes,
    } = parsed.data;

    const refError = await assertCustomerVehicleRefsExist({ customerId, variantId, formVehicleId, kendaraanId });
    if (refError) return { success: false, error: refError };

    // Find or create the catalog-type Vehicle from variantId, then create the
    // ownership link (with the physical-unit attributes) — both in ONE
    // transaction. Without the wrapper, a vehicle.create success followed by a
    // customerVehicle.create failure orphans the freshly-created Vehicle row.
    // Mirrors the atomic createVehicle fix.
    const customerVehicle = await prisma.$transaction(async (tx) => {
      let vehicleId: number;

      if (variantId) {
        // Create a new catalog-type Vehicle linked to the variant.
        const vehicle = await tx.vehicle.create({
          data: {
            vehicleVariantId: variantId,
            year: year ?? null,
          },
        });
        vehicleId = vehicle.id;
      } else {
        const rawVehicleId = formVehicleId ?? kendaraanId;
        if (!rawVehicleId) {
          throw new Error("vehicleId wajib diisi");
        }
        vehicleId = rawVehicleId;
      }

      // Physical-unit attributes (plate/color/chassis/engine) live on the
      // ownership link, not the catalog type.
      return tx.customerVehicle.create({
        data: {
          customerId,
          vehicleId,
          // Pelat nomor paling terbaca di URL; unit tanpa pelat memakai fallback.
          slug: await nextSlug("customerVehicle", plateNumber, {
            fallback: `kendaraan-${customerId}-${vehicleId}`,
          }),
          plateNumber: plateNumber ?? null,
          color: color ?? null,
          chassisNumber: chassisNumber ?? null,
          engineNumber: engineNumber ?? null,
          isActive: isActive ?? true,
          notes: notes ?? null,
        },
      });
    });

    revalidatePath(`/master/pelanggan/${customerId}/kendaraan`);
    await logActivity(
      "create",
      "CustomerVehicle",
      customerVehicle.id,
      "Membuat kendaraan pelanggan",
    );
    return { success: true, id: customerVehicle.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createCustomerVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal membuat kendaraan pelanggan"),
    };
  }
}

export async function updateCustomerVehicle(id: number, formData: FormData) {
  try {
    await requirePermission("edit_customers");

    const parsed = parseFormData(customerVehicleSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const d = parsed.data;

    const refError = await assertCustomerVehicleRefsExist({ customerId: d.customerId, variantId: d.variantId, formVehicleId: d.vehicleId, kendaraanId: d.kendaraanId });
    if (refError) return { success: false, error: refError };

    // Atomic update: the catalog-type Vehicle row + the ownership link, both in
    // ONE transaction. A vehicle.update success followed by a customerVehicle
    // .update failure would otherwise leave the pair inconsistent (e.g. year
    // moved on the type but the link still points at the old row).
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customerVehicle.findUniqueOrThrow({
        where: { id },
      });

      let vehicleId: number;

      if (d.variantId) {
        // Update the catalog type's variant/year from the form. `name` is not
        // edited here — it is a catalog label owned by /kendaraan.
        const updatedVehicle = await tx.vehicle.update({
          where: { id: existing.vehicleId },
          data: {
            vehicleVariantId: d.variantId,
            year: d.year ?? null,
          },
        });
        vehicleId = updatedVehicle.id;
      } else {
        const rawVehicleId = d.vehicleId ?? d.kendaraanId;
        if (!rawVehicleId) {
          throw new Error("vehicleId wajib diisi");
        }
        vehicleId = rawVehicleId;
        // Year is a catalog-type attribute, so keep it in sync on this path too
        // — otherwise relinking to an existing type silently dropped the edit.
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { year: d.year ?? null },
        });
      }

      // Physical-unit attributes (plate/color/chassis/engine) live on the link.
      await tx.customerVehicle.update({
        where: { id },
        data: {
          vehicleId,
          plateNumber: d.plateNumber ?? null,
          color: d.color ?? null,
          chassisNumber: d.chassisNumber ?? null,
          engineNumber: d.engineNumber ?? null,
          isActive: d.isActive ?? true,
          notes: d.notes ?? null,
        },
      });
    });

    revalidatePath(`/master/pelanggan/${d.customerId}/kendaraan`);
    await logActivity(
      "update",
      "CustomerVehicle",
      id,
      "Memperbarui kendaraan pelanggan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateCustomerVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal memperbarui kendaraan pelanggan"),
    };
  }
}

export async function deleteCustomerVehicle(id: number) {
  try {
    await requirePermission("delete_customers");

    const vehicle = await prisma.customerVehicle.findUniqueOrThrow({
      where: { id },
      select: {
        customerId: true,
        vehicleId: true,
        _count: {
          select: { workOrders: true, quotations: true, projects: true },
        },
      },
    });

    // Integrity guard: customerVehicleId on Quotation/WorkOrder/Project is nullable
    // (SetNull), so deleting a customer-vehicle with history silently NULLs the
    // vehicle reference on those documents, erasing service-history linkage.
    // Refuse when dependents exist (mirrors deleteVehicle / deleteRole).
    const relationDependents =
      vehicle._count.workOrders +
      vehicle._count.quotations +
      vehicle._count.projects;

    // SalesOrder.customerVehicleId and SalesInvoice.customerVehicleId are plain
    // (non-relation) Int columns — CustomerVehicle has no back-relation for them,
    // so they cannot be counted via _count above. Without this, a customer-vehicle
    // referenced ONLY by an SO/Invoice (no WO/quotation/project) would pass the
    // guard and be deleted, orphaning their customer_vehicle_id (no FK = silent
    // dangling reference on financial documents). Count them directly. Mirrors the
    // same guard already present in deleteVehicle.
    const [soCount, invCount] = await Promise.all([
      prisma.salesOrder.count({ where: { customerVehicleId: id } }),
      prisma.salesInvoice.count({ where: { customerVehicleId: id } }),
    ]);
    const salesDependents = soCount + invCount;

    const dependents = relationDependents + salesDependents;
    if (dependents > 0) {
      return {
        success: false,
        error:
          `Kendaraan pelanggan ini punya ${dependents} dokumen terkait (perintah kerja/penawaran/proyek/penjualan) ` +
          `dan tidak bisa dihapus karena akan menghilangkan riwayat servis. Nonaktifkan kendaraan sebagai gantinya.`,
      };
    }

    // Delete the linkage row AND its backing catalog-type Vehicle row atomically.
    // Every CustomerVehicle created from a variant gets its own dedicated
    // catalog Vehicle row (see createCustomerVehicle), and Vehicle → CustomerVehicle
    // is onDelete: Restrict — deleting only the linkage would leave that Vehicle
    // row orphaned forever (no customer, invisible in every screen), and the FK
    // would block a later raw delete. A Vehicle MAY be shared by several
    // CustomerVehicles, so only delete it when this is its last remaining owner;
    // otherwise just drop the linkage and keep the shared row.
    await prisma.$transaction(async (tx) => {
      const otherOwners = await tx.customerVehicle.count({
        where: { vehicleId: vehicle.vehicleId, id: { not: id } },
      });

      await tx.customerVehicle.delete({ where: { id } });

      if (otherOwners === 0) {
        await tx.vehicle.deleteMany({ where: { id: vehicle.vehicleId } });
      }
    });

    revalidatePath(`/master/pelanggan/${vehicle.customerId}/kendaraan`);
    await logActivity(
      "delete",
      "CustomerVehicle",
      id,
      "Menghapus kendaraan pelanggan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteCustomerVehicle]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal menghapus kendaraan pelanggan"),
    };
  }
}

// ==================== JADWAL SERVIS BERIKUTNYA (F-2026-10-25-021-S) ====================

/**
 * Catat/ubah/kosongkan jadwal servis berikutnya satu kendaraan
 * (F-2026-10-25-021-S tahap 1, BR-SV-02/08).
 *
 * Mutasi master berizin `edit_customers` — izin ubah master kendaraan
 * pelanggan existing (updateCustomerVehicle memakai key sama; usulan
 * Q-SV-2 tanpa key baru, putusan Lead belum tertulis — lihat header
 * builder service-reminder-queue.ts). Pencatat tercatat di
 * nextServiceUpdatedBy/At + logActivity pola master existing.
 * Satu jadwal aktif per kendaraan: catat ulang menimpa, keduanya kosong
 * = kosongkan jadwal. Tanpa jurnal, tanpa dokumen transaksi (BR-SV-08).
 *
 * Penjaga pintu masuk (AC-SV-F3): km target <= odometer terakhir
 * tercatat ditolak berisik dengan angka nyata — jadwal_rusak dicegah
 * di pintu masuk, bukan disimpan diam-diam. Tanggal lampau SAH
 * (langsung terlewat jujur, spec §6). WO selesai TIDAK menggeser
 * jadwal ini (BR-SV-07, tahap 2 Q-SV-4).
 */
export async function updateCustomerVehicleServiceSchedule(
  id: number,
  formData: FormData,
) {
  try {
    const user = await requirePermission("edit_customers");

    const parsed = parseFormData(serviceScheduleSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const { nextServiceDate, nextServiceKm, nextServiceNote } = parsed.data;

    const existing = await prisma.customerVehicle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, customerId: true, lastOdometerKm: true },
    });
    if (!existing) {
      return { success: false, error: "Kendaraan pelanggan tidak ditemukan" };
    }

    if (
      nextServiceKm != null &&
      existing.lastOdometerKm != null &&
      nextServiceKm <= existing.lastOdometerKm
    ) {
      return {
        success: false,
        error:
          `Km servis berikutnya (${nextServiceKm.toLocaleString("id-ID")}) harus lebih besar ` +
          `dari odometer terakhir tercatat (${existing.lastOdometerKm.toLocaleString("id-ID")} km). ` +
          `Periksa kembali jadwal yang dicatat.`,
      };
    }

    const updatedBy = Number(user.id);
    await prisma.customerVehicle.update({
      where: { id },
      data: {
        nextServiceDate: nextServiceDate ? wibDateToUtcMidnight(nextServiceDate) : null,
        nextServiceKm: nextServiceKm ?? null,
        nextServiceNote: nextServiceNote ?? null,
        nextServiceUpdatedBy: Number.isFinite(updatedBy) ? updatedBy : null,
        nextServiceUpdatedAt: new Date(),
      },
    });

    revalidatePath(`/master/pelanggan/${existing.customerId}/kendaraan`);
    await logActivity(
      "update",
      "CustomerVehicle",
      id,
      nextServiceDate == null && nextServiceKm == null
        ? "Mengosongkan jadwal servis berikutnya kendaraan pelanggan"
        : "Mencatat jadwal servis berikutnya kendaraan pelanggan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateCustomerVehicleServiceSchedule]", getErrorMessage(e) || e);
    return {
      success: false,
      error: getErrorMessage(e, "Gagal mencatat jadwal servis berikutnya"),
    };
  }
}
