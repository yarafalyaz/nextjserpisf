"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { getSystemSettings } from "@/lib/utils/settings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  safeId,
  safeNumber,
  safeJsonParse,
  requireString,
} from "@/lib/utils/safe-parse";
import { logActivity } from "@/lib/services/activity-log.service";
import { validateCommissionRateWrite } from "@/lib/services/customer-commission-rate.service";
import {
  customerSchema,
  customerCategorySchema,
  vendorSchema,
  itemSchema,
  warehouseServerSchema,
  accountServerSchema,
  barcodeServerSchema,
  taxServerSchema,
  bankServerSchema,
  itemCategoryServerSchema,
  uomServerSchema,
  employeeDatesSchema,
} from "@/lib/validations/schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { parseFormData } from "@/lib/validations/parse-form";
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money";
import {
  createLeadSchema,
  updateLeadSchema,
} from "@/lib/validations/crm.schemas";
import {
  findLeadDuplicateCandidates,
  buildDuplicateWarning,
  validateDuplicateOverrideReason,
  buildDuplicateOverrideDescription,
  leadContactKeys,
  DUPLICATE_OVERRIDE_ACTIVITY_TYPE,
  DUPLICATE_OVERRIDE_SUBJECT,
  type LeadDuplicateWarning,
} from "@/lib/services/lead-duplicate.service";
import {
  findCustomerDuplicateCandidates,
  findCustomerNpwpConflict,
  buildCustomerDuplicateWarning,
  buildCustomerNpwpBlockedMessage,
  loadCustomerDuplicateGroups,
  CUSTOMER_REUSED_MESSAGE,
  CUSTOMER_NPWP_BLOCKED_TITLE,
  type CustomerDuplicateWarning,
  type CustomerDuplicateGroup,
  type CustomerNpwpConflict,
} from "@/lib/services/customer-duplicate.service";
import bcrypt from "bcryptjs";
import { getHrScope } from "@/lib/auth/hr-scope";
import { nextSlug } from "@/lib/utils/slug-db";
import {
  normalizeNitku,
  normalizeNpwp,
  validateMasterTaxIdentity,
} from "@/lib/tax/customer-tax-identity";
import {
  isEmploymentEndReason,
  isEmploymentStatus,
} from "@/lib/reports/employee-lifecycle";
import { validateLeadLostTransition } from "@/lib/reports/lead-lost-reason";

/**
 * Konversi satuan alternatif dari JSON FormData `uomConversions`
 * ([{ code, factorToBase }]). factorToBase bisa string berformat Indonesia
 * dari klien non-form ("1.000" = 1000, "1,5" = 1.5) — wajib lewat
 * parseLocaleNumber; Number() mentah membaca "1.000" jadi 1 dan "abc" jadi
 * NaN yang lolos filter >0 secara diam-diam. Baris berkode dengan faktor tak
 * terbaca / tidak > 0 ditolak berpesan, bukan dibuang diam-diam (konversi
 * hilang = qty transaksi dihitung 1:1 tanpa jejak). Baris tanpa kode tetap
 * dibuang (baris kosong form).
 */
function parseUomConversions(
  convJson: string | null,
): { code: string; factorToBase: number }[] {
  const rows =
    safeJsonParse<{ code: string; factorToBase: unknown }[]>(convJson) ?? [];
  const conversions: { code: string; factorToBase: number }[] = [];
  for (const c of rows) {
    const code = typeof c?.code === "string" ? c.code.trim() : "";
    if (!code) continue;
    const factor = parseLocaleNumber(
      c.factorToBase as string | number | null | undefined,
    );
    if (factor === null || factor <= 0) {
      throw new Error(
        `Faktor konversi satuan "${code}" tidak valid — isi angka lebih dari 0 (mis. 12 atau 1.000).`,
      );
    }
    conversions.push({ code, factorToBase: factor });
  }
  return conversions;
}

/**
 * Privilege-escalation guard for Employee → User creation/sync flows.
 *
 * `createEmployee` and `updateEmployee` both let a caller mint a brand-new
 * login account (or sync roles onto an existing one) by submitting a list of
 * role IDs in the form. Without this guard, anyone holding `create_employees`
 * or `edit_employees` — even an HR manager with no role-management rights —
 * could pass the `super_admin` role ID and grant themselves (or anyone) full
 * system access, completely bypassing the
 * `assertNoSuperAdminGrant` gate that `auth.actions.ts` enforces for the
 * dedicated user-management path. That would defeat the principle of least
 * privilege and allow a single HR-permission holder to escalate to super admin
 * by editing a single employee record.
 *
 * Returns an error message when the assignment is disallowed, otherwise null.
 * Kept local to this file (not exported) on purpose: it is a server-action
 * helper and must not be reachable from client components.
 */
async function assertNoSuperAdminGrant(
  actorRoles: string[],
  roleIds: number[],
): Promise<string | null> {
  if (actorRoles.includes("super_admin")) return null;
  if (roleIds.length === 0) return null;
  const requested = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true },
  });
  if (requested.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat memberikan role super admin";
  }
  return null;
}

/**
 * Target-escalation guard for Employee → User update flows.
 *
 * A non-super-admin must not be able to alter the record (or its synced login
 * account) of an employee whose user is super_admin. Without this guard, an
 * `edit_employees` holder could rewrite the super admin's name/email/phone, or
 * — via the `loginRoleIds` sync branch — strip the super_admin role and grant
 * themselves arbitrary elevated permissions, all under the guise of a normal
 * HR edit.
 *
 * Returns an error message when the modification is disallowed, otherwise
 * null. Resolves to null when `targetUserId` is null (employee has no login
 * account yet — the create path covers that case via `assertNoSuperAdminGrant`).
 */
async function assertCanModifyEmployeeTarget(
  actorRoles: string[],
  targetUserId: number | null,
): Promise<string | null> {
  if (targetUserId === null) return null;
  if (actorRoles.includes("super_admin")) return null;
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { roles: { select: { name: true } } },
  });
  if (!target) return null;
  if (target.roles.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin";
  }
  return null;
}

/**
 * Smart delete for master records that carry a `deletedAt` soft-delete column.
 * Attempts a HARD delete first; if the row is still referenced by other records
 * the database raises a foreign-key violation (P2003), in which case we fall
 * back to a SOFT delete to preserve those historical references.
 *
 * This keeps the table free of cruft for never-used masters (so generated codes
 * reflect reality and an empty list yields PREFIX-0001) while protecting
 * referential integrity for masters tied to transactions.
 *
 * Safe by schema design: no transaction->master relation uses onDelete: Cascade,
 * so a hard delete can never wipe transactional data — it is always Restricted
 * (or SetNull for nullable, non-historical links such as Task.assignedTo).
 *
 * The soft-delete fallback also clears `isActive`. A row that keeps isActive=true
 * while deletedAt is set stays visible in every picker and list that filters by
 * isActive alone, so the "deleted" master could still be chosen for new documents.
 */
async function hardDeleteOrSoftDelete(
  hardDelete: () => Promise<unknown>,
  softDelete: () => Promise<unknown>,
): Promise<void> {
  try {
    await hardDelete();
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      await softDelete();
      return;
    }
    throw e;
  }
}

// ==================== CUSTOMER ACTIONS ====================

/**
 * Q-CD-1 (PUTUSAN Lead PR #901, F-2026-10-25-040-S §B): gerbang BLOKIR
 * NPWP persis — pengecualian dari peringatan advisory BR-CD-04. NPWP
 * ternormalisasi (`normalizeCustomerTaxIdKey`) sama persis DAN terisi di
 * kedua sisi = simpan DITOLAK sebelum create/update; kunci lain
 * (telepon/nama+email) tetap peringatan tahap 1. Respons blokir
 * terstruktur: `npwpConflict` (id/nama/kode pemegang) + `error` verbatim
 * supaya operator memakai master existing atau mengoreksi NPWP.
 */
function buildCustomerNpwpBlockedResult(conflict: CustomerNpwpConflict) {
  return {
    success: false as const,
    error: buildCustomerNpwpBlockedMessage(conflict),
    npwpConflict: {
      id: conflict.id,
      slug: conflict.slug,
      name: conflict.name,
      code: conflict.code,
      title: CUSTOMER_NPWP_BLOCKED_TITLE,
    },
  };
}

// F-2026-10-25-004-S: validasi bentuk identitas pajak master (longgar-
// tertanda vonis 019-V §1/§2/§3) + normalisasi simpan digit-saja.
// Bentuk cacat = tolak simpan; legacy15/unlinked lolos dengan peringatan
// di respons (advisory, simpan tetap berhasil — pola duplicateWarning).
function customerTaxIdentityForSave(v: {
  taxId?: string
  taxpayerName?: string
  taxAddress?: string
  nitku?: string
  pkpStatus?: string
  pkpEffectiveFrom?: string
  pkpSource?: string
}): { error: string } | { data: Record<string, unknown>; warnings: string[] } {
  const check = validateMasterTaxIdentity({
    taxId: v.taxId,
    taxpayerName: v.taxpayerName,
    nitku: v.nitku,
  })
  if (!check.ok) return { error: check.errors.join("; ") }
  let pkpEffectiveFrom: Date | null = null
  if (v.pkpEffectiveFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.pkpEffectiveFrom)) {
      return { error: "Tanggal pengukuhan PKP tidak valid (format YYYY-MM-DD)" }
    }
    pkpEffectiveFrom = wibDateToUtcMidnight(v.pkpEffectiveFrom)
  }
  return {
    warnings: check.warnings,
    data: {
      taxId: normalizeNpwp(v.taxId) ?? v.taxId ?? null,
      taxpayerName: v.taxpayerName ?? null,
      taxAddress: v.taxAddress ?? null,
      nitku: normalizeNitku(v.nitku),
      pkpStatus: v.pkpStatus ?? "unknown",
      pkpEffectiveFrom,
      pkpSource: v.pkpSource ?? null,
    },
  }
}

export async function createCustomer(formData: FormData) {
  try {
    const user = await requirePermission("create_customers");

    // quick-add upsert: if name + phone matches an active non-deleted customer, reuse it
    // F-2026-10-25-003-S BR-CD-05: reuse WAJIB terucap — penanda reused +
    // identitas pelanggan terpakai di respons; id/slug tidak berubah.
    const rawNameCust = (formData.get("name") as string | null)?.trim()
    const rawPhoneCust = (formData.get("phone") as string | null)?.trim() || ""
    if (rawNameCust) {
      const existing = await prisma.customer.findFirst({ where: { name: rawNameCust, phone: rawPhoneCust || undefined, deletedAt: null, isActive: true }, select: { id: true, slug: true, name: true, code: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined, reused: true as const, reusedCustomer: { id: existing.id, name: existing.name, code: existing.code, slug: existing.slug }, message: CUSTOMER_REUSED_MESSAGE }
    }


    const parsed = parseFormData(customerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const taxIdentity = customerTaxIdentityForSave(v);
    if ("error" in taxIdentity) return { success: false, error: taxIdentity.error };

    // Q-CD-1: NPWP persis terisi dua sisi = BLOKIR sebelum create.
    const npwpConflict = await findCustomerNpwpConflict({ taxId: v.taxId });
    if (npwpConflict) return buildCustomerNpwpBlockedResult(npwpConflict);

    // FK tanpa cek: customerCategoryId fiktif lolos optionalNumber lalu P2003 mentah.
    // UI hanya tawarkan kategori aktif (tambah/ubah pelanggan), samakan di sini.
    if (v.customerCategoryId != null) {
      const cat = await prisma.customerCategory.findFirst({ where: { id: v.customerCategoryId, deletedAt: null, isActive: true }, select: { id: true } });
      if (!cat) return { success: false, error: "Kategori pelanggan tidak ditemukan" };
    }

    const settings = await getSystemSettings();
    let code = v.code || null;
    if (settings.enableAutoCustomerCode !== false || !code) {
      code = await generateDocumentNumber("CUST", "simple");
    }

    const customer = await prisma.customer.create({
      data: {
        name: v.name,
        slug: await nextSlug("customer", v.name),
        email: v.email ?? null,
        phone: v.phone ?? null,
        address: v.address ?? null,
        city: v.city ?? null,
        contactPerson: v.contactPerson ?? null,
        createdBy: Number(user.id),
        gender: v.gender ?? null,
        code,
        street: v.street ?? null,
        province: v.province ?? null,
        district: v.district ?? null,
        village: v.village ?? null,
        postalCode: v.postalCode ?? null,
        isActive: true,
        ...taxIdentity.data,
        customerCategoryId: v.customerCategoryId ?? null,
      },
    });

    revalidatePath("/master/pelanggan");
    await logActivity("create", "Customer", customer.id, "Membuat pelanggan");
    // F-2026-10-25-003-S BR-CD-04: peringatan advisory — simpan tetap
    // berhasil, kandidat dihitung SESUDAH create karena quick-add reuse
    // nama+telepon mentah persis di atas tidak menangkap varian format
    // (BR-CD-02). Kandidat berisi pelanggan LAIN (excludeId = baru).
    const candidates = await findCustomerDuplicateCandidates(
      { name: v.name, phone: v.phone, taxId: v.taxId, email: v.email, excludeCustomerId: customer.id },
    );
    const duplicateWarning: CustomerDuplicateWarning | null =
      buildCustomerDuplicateWarning(candidates);
    // taxWarnings hanya disertakan bila ada peringatan (legacy15 dsb.) —
    // bentuk respons lama byte-sama bila tidak ada (kontrak tidak berubah diam-diam).
    return taxIdentity.warnings.length
      ? { success: true, id: customer.id, slug: customer.slug, duplicateWarning, taxWarnings: taxIdentity.warnings }
      : { success: true, id: customer.id, slug: customer.slug, duplicateWarning };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createCustomer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateCustomer(customerId: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_customers");

    const parsed = parseFormData(customerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const taxIdentity = customerTaxIdentityForSave(v);
    if ("error" in taxIdentity) return { success: false, error: taxIdentity.error };

    // Q-CD-1: NPWP persis terisi dua sisi = BLOKIR sebelum update;
    // self-match (NPWP milik pelanggan ini sendiri) dikecualikan.
    const npwpConflict = await findCustomerNpwpConflict({
      taxId: v.taxId,
      excludeCustomerId: customerId,
    });
    if (npwpConflict) return buildCustomerNpwpBlockedResult(npwpConflict);

    if (v.customerCategoryId != null) {
      const cat = await prisma.customerCategory.findFirst({ where: { id: v.customerCategoryId, deletedAt: null, isActive: true }, select: { id: true } });
      if (!cat) return { success: false, error: "Kategori pelanggan tidak ditemukan" };
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        updatedBy: Number(user.id),
        name: v.name,
        slug: await nextSlug("customer", v.name, { excludeId: customerId }),
        email: v.email ?? null,
        phone: v.phone ?? null,
        address: v.address ?? null,
        city: v.city ?? null,
        contactPerson: v.contactPerson ?? null,
        gender: v.gender ?? null,
        code: v.code ?? null,
        street: v.street ?? null,
        province: v.province ?? null,
        district: v.district ?? null,
        village: v.village ?? null,
        postalCode: v.postalCode ?? null,
        ...taxIdentity.data,
        customerCategoryId: v.customerCategoryId ?? null,
      },
    });

    revalidatePath("/master/pelanggan");
    await logActivity(
      "update",
      "Customer",
      customerId,
      "Memperbarui pelanggan",
    );
    // F-2026-10-25-003-S AC-CD-B5: sinyal kandidat sesudah ubah,
    // excludeId diri (BR-CD-06). Advisory — update tetap berhasil.
    const candidates = await findCustomerDuplicateCandidates(
      { name: v.name, phone: v.phone, taxId: v.taxId, email: v.email, excludeCustomerId: customerId },
    );
    const duplicateWarning: CustomerDuplicateWarning | null =
      buildCustomerDuplicateWarning(candidates);
    return taxIdentity.warnings.length
      ? { success: true, duplicateWarning, taxWarnings: taxIdentity.warnings }
      : { success: true, duplicateWarning };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateCustomer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteCustomer(customerId: number) {
  try {
    const user = await requirePermission("delete_customers");

    await hardDeleteOrSoftDelete(
      () => prisma.customer.delete({ where: { id: customerId } }),
      () =>
        prisma.customer.update({
          where: { id: customerId },
          data: {
        updatedBy: Number(user.id), deletedAt: new Date(), isActive: false },
        }),
    );

    revalidatePath("/master/pelanggan");
    await logActivity("delete", "Customer", customerId, "Menghapus pelanggan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteCustomer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== VENDOR ACTIONS ====================

export async function createVendor(formData: FormData) {
  try {
    const user = await requirePermission("create_vendors");

    const rawNameVendor = (formData.get("name") as string | null)?.trim()
    if (rawNameVendor) {
      const existing = await prisma.vendor.findFirst({ where: { name: rawNameVendor, deletedAt: null }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const parsed = parseFormData(vendorSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // FK tanpa cek: paymentTermId fiktif lolos optionalNumber lalu P2003 mentah.
    // PaymentTerm tanpa deletedAt; nonaktif tetap ditolak (tak bisa dipakai bayar).
    if (v.paymentTermId != null) {
      const term = await prisma.paymentTerm.findFirst({ where: { id: v.paymentTermId, isActive: true }, select: { id: true } });
      if (!term) return { success: false, error: "Syarat pembayaran tidak ditemukan" };
    }

    const settings = await getSystemSettings();
    let code = v.code || null;
    if (settings.enableAutoVendorCode !== false || !code) {
      code = await generateDocumentNumber("VND", "simple");
    }

    const vendor = await prisma.vendor.create({
      data: {
        name: v.name,
        slug: await nextSlug("vendor", v.name),
        code,
        email: v.email ?? null,
        phone: v.phone ?? null,
        address: v.address ?? null,
        city: v.city ?? null,
        npwp: v.npwp ?? null,
        contactPerson: v.contactPerson ?? null,
        createdBy: Number(user.id),
        paymentTermId: v.paymentTermId ?? null,
        street: v.street ?? null,
        province: v.province ?? null,
        postalCode: v.postalCode ?? null,
        districtVendor: v.districtVendor ?? null,
        villageVendor: v.villageVendor ?? null,
        bankName: v.bankName ?? null,
        bankAccountNumber: v.bankAccountNumber ?? null,
        bankAccountHolder: v.bankAccountHolder ?? null,
        isActive: true,
      },
    });

    revalidatePath("/master/vendor");
    await logActivity("create", "Vendor", vendor.id, "Membuat vendor");
    return { success: true, id: vendor.id, slug: vendor.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVendor]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateVendor(vendorId: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_vendors");

    const parsed = parseFormData(vendorSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.paymentTermId != null) {
      const term = await prisma.paymentTerm.findFirst({ where: { id: v.paymentTermId, isActive: true }, select: { id: true } });
      if (!term) return { success: false, error: "Syarat pembayaran tidak ditemukan" };
    }

    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        updatedBy: Number(user.id),
        name: v.name,
        slug: await nextSlug("vendor", v.name, { excludeId: vendorId }),
        email: v.email ?? null,
        phone: v.phone ?? null,
        address: v.address ?? null,
        city: v.city ?? null,
        npwp: v.npwp ?? null,
        contactPerson: v.contactPerson ?? null,
        paymentTermId: v.paymentTermId ?? null,
        street: v.street ?? null,
        province: v.province ?? null,
        postalCode: v.postalCode ?? null,
        districtVendor: v.districtVendor ?? null,
        villageVendor: v.villageVendor ?? null,
        bankName: v.bankName ?? null,
        bankAccountNumber: v.bankAccountNumber ?? null,
        bankAccountHolder: v.bankAccountHolder ?? null,
      },
    });

    revalidatePath("/master/vendor");
    await logActivity("update", "Vendor", vendorId, "Memperbarui vendor");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVendor]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ITEM ACTIONS ====================

export async function createItem(formData: FormData) {
  try {
    await requirePermission("create_items");

    const parsed = parseFormData(itemSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // F-2026-10-24-135-V syarat 1: item besi tua TIDAK boleh isProduct=true.
    // Kombinasi itu masuk jalur stok/COGS dan melanggar nilai buku scrap Rp0.
    if ((v.isScrapSaleItem ?? false) && (v.isProduct ?? false)) {
      return { success: false, error: "Item besi tua tidak boleh isProduct=true — scrap tanpa jalur stok/COGS." };
    }

    const itemSettings = await getSystemSettings();
    let sku = v.sku || null;
    if (itemSettings.enableAutoItemCode !== false || !sku) {
      sku = await generateDocumentNumber("ITM", "simple");
    }

    const itemCost = v.cost;
    const itemPrice = v.price;
    if (itemPrice < itemCost) {
      return {
        success: false,
        error: "Harga jual tidak boleh lebih rendah dari harga beli (modal).",
      };
    }

    // ATOMICITY: Item insert + UoM conversion insert must commit together.
    // Previously the conversions were a separate prisma call after the item
    // was already committed — a failure there would leave an Item row with no
    // alternate units but the UI claiming the create succeeded, producing
    // "phantom" items missing the multi-UoM data the operator just typed in.
    // Wrapping both in one tx ties item existence to conversion existence.
    const item = await prisma.$transaction(async (tx) => {
      let finalCostingMethod: "fifo" | "average" | undefined = v.costingMethod;
      if (!finalCostingMethod && v.categoryId) {
        const cat = await tx.itemCategory.findUnique({
          where: { id: v.categoryId },
          select: { costingMethod: true },
        });
        // Nilai warisan tak dikenal diabaikan (resolver HPP menormalisasi
        // sisanya); jangan simpan string sampah ke baris barang baru.
        if (cat && (cat.costingMethod === "fifo" || cat.costingMethod === "average")) {
          finalCostingMethod = cat.costingMethod;
        }
      }
      if (!finalCostingMethod) {
        finalCostingMethod = "average";
      }

      const created = await tx.item.create({
        data: {
          sku,
          name: v.name,
          slug: await nextSlug("item", v.name),
          description: v.description ?? null,
          image: v.image ?? null,
          categoryId: v.categoryId ?? null,
          groupId: v.groupId ?? null,
          brandId: v.brandId ?? null,
          vendorId: v.vendorId ?? null,
          defaultWarehouseId: v.defaultWarehouseId ?? null,
          defaultRackId: v.defaultRackId ?? null,
          defaultRackRowId: v.defaultRackRowId ?? null,
          unitOfMeasure: v.unitOfMeasure,
          qtyOnHand: 0,
          minStock: v.minStock ?? 0,
          cost: itemCost,
          price: itemPrice,
          standardCost: v.standardCost ?? undefined,
          costingMethod: finalCostingMethod,
          purchasePrice: v.purchasePrice ?? undefined,
          isProduct: v.isProduct ?? false,
          isService: v.isService ?? false,
          isScrapSaleItem: v.isScrapSaleItem ?? false,
          trackBatch: v.trackBatch ?? false,
          trackSerial: v.trackSerial ?? false,
          isActive: true,
        },
      });

      // Multi-UoM alternate unit conversions (JSON: [{ code, factorToBase }])
      const conversions = parseUomConversions(
        formData.get("uomConversions") as string | null,
      );
      if (conversions.length > 0) {
        await tx.uomConversion.createMany({
          data: conversions.map((c) => ({
            itemId: created.id,
            code: c.code.trim(),
            factorToBase: c.factorToBase,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    revalidatePath("/master/barang");
    await logActivity("create", "Item", item.id, "Membuat barang");
    return { success: true, id: item.id, slug: item.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createItem]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateItem(itemId: number, formData: FormData) {
  try {
    await requirePermission("edit_items");

    // Validate with the same schema as createItem — previously updateItem read
    // raw formData (name/sku/unitOfMeasure as string) with no validation, so an
    // empty required field silently wrote null/empty to the row.
    const parsed = parseFormData(itemSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // F-2026-10-24-135-V syarat 1: item besi tua TIDAK boleh isProduct=true.
    // Kombinasi itu masuk jalur stok/COGS dan melanggar nilai buku scrap Rp0.
    if ((v.isScrapSaleItem ?? false) && (v.isProduct ?? false)) {
      return { success: false, error: "Item besi tua tidak boleh isProduct=true — scrap tanpa jalur stok/COGS." };
    }

    if (v.price < v.cost) {
      return {
        success: false,
        error: "Harga jual tidak boleh lebih rendah dari harga beli (modal).",
      };
    }

    // ATOMICITY: item update + uomConversion deleteMany + uomConversion createMany
    // must commit together. Previously the three were sequential non-transactional
    // calls — a failure on createMany after a successful deleteMany would leave
    // the item with NO alternate units (the old rows were wiped, the new rows
    // never landed), silently breaking any sales/purchase line that referenced
    // the item in the new unit. Wrapping all three in one tx makes the
    // "wipe + re-insert" either fully succeed or fully roll back.
    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id: itemId },
        data: {
          sku: v.sku || undefined,
          name: v.name,
          slug: await nextSlug("item", v.name, { excludeId: itemId }),
          description: v.description ?? null,
          image: v.image ?? null,
          categoryId: v.categoryId ?? null,
          groupId: v.groupId ?? null,
          brandId: v.brandId ?? null,
          vendorId: v.vendorId ?? null,
          defaultWarehouseId: v.defaultWarehouseId ?? null,
          defaultRackId: v.defaultRackId ?? null,
          defaultRackRowId: v.defaultRackRowId ?? null,
          unitOfMeasure: v.unitOfMeasure,
          minStock: v.minStock ?? 0,
          cost: v.cost,
          price: v.price,
          standardCost: v.standardCost ?? undefined,
          costingMethod: v.costingMethod ?? undefined,
          purchasePrice: v.purchasePrice ?? undefined,
          isProduct: v.isProduct ?? false,
          isService: v.isService ?? false,
          isScrapSaleItem: v.isScrapSaleItem ?? false,
          trackBatch: v.trackBatch ?? false,
          trackSerial: v.trackSerial ?? false,
        },
      });

      // Replace alternate-unit conversions
      const convJson = formData.get("uomConversions") as string | null;
      if (convJson !== null) {
        const conversions = parseUomConversions(convJson);
        await tx.uomConversion.deleteMany({ where: { itemId } });
        if (conversions.length > 0) {
          await tx.uomConversion.createMany({
            data: conversions.map((c) => ({
              itemId,
              code: c.code.trim(),
              factorToBase: c.factorToBase,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    revalidatePath("/master/barang");
    await logActivity("update", "Item", itemId, "Memperbarui barang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateItem]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== WAREHOUSE ACTIONS ====================

export async function createWarehouse(formData: FormData) {
  try {
    await requirePermission("create_warehouses");

    const rawNameWh = (formData.get("name") as string | null)?.trim()
    if (rawNameWh) {
      const existing = await prisma.warehouse.findFirst({ where: { name: rawNameWh, deletedAt: null }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const parsed = parseFormData(warehouseServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const settings = await getSystemSettings();
    let code = v.code || null;
    if (settings.enableAutoWarehouseCode !== false || !code) {
      const prefix = settings.warehouseCodePrefix || "WH-";
      // Only count non-deleted warehouses so soft-deleted codes can be reused
      const existingCodes = await prisma.warehouse.findMany({
        where: { deletedAt: null, code: { startsWith: prefix } },
        select: { code: true },
      });
      let maxNum = 0;
      for (const w of existingCodes) {
        const num = Number.parseInt(w.code.slice(prefix.length), 10);
        if (!Number.isNaN(num) && num > maxNum) maxNum = num;
      }
      let nextId = maxNum + 1;
      while (
        await prisma.warehouse.findFirst({
          where: { deletedAt: null, code: prefix + String(nextId).padStart(4, "0") },
          select: { id: true },
        })
      ) {
        nextId++;
      }
      code = prefix + String(nextId).padStart(4, "0");
    }

    // Free up code if it's held by a soft-deleted warehouse (UNIQUE collision)
    if (code) {
      const existingDeleted = await prisma.warehouse.findFirst({
        where: { deletedAt: { not: null }, code },
        select: { id: true },
      });
      if (existingDeleted) {
        await prisma.warehouse.update({
          where: { id: existingDeleted.id },
          data: { code: `DELETED-${existingDeleted.id}-${Date.now()}` },
        });
      }
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name: v.name,
        slug: await nextSlug("warehouse", v.name),
        code,
        address: v.address ?? null,
        isActive: true,
      },
    });

    revalidatePath("/master/gudang");
    await logActivity("create", "Warehouse", warehouse.id, "Membuat gudang");
    return { success: true, id: warehouse.id, slug: warehouse.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createWarehouse]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateWarehouse(warehouseId: number, formData: FormData) {
  try {
    await requirePermission("edit_warehouses");

    const parsed = parseFormData(warehouseServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: v.name,
        slug: await nextSlug("warehouse", v.name, { excludeId: warehouseId }),
        code: v.code ?? "",
        address: v.address ?? null,
      },
    });

    revalidatePath("/master/gudang");
    await logActivity("update", "Warehouse", warehouseId, "Memperbarui gudang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateWarehouse]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


/** Baca opsi akun login dari form karyawan (dipakai create + update, identik).
 * ID peran hanya desimal murni via safeId — pola repo (taxIds, route
 * workflow/print/attachments/notifications, parseId tukar faktur). Number()
 * mentah menerima "0x10"->16, "1e3"->1000, " 5"->5: ID tak terduga lolos
 * ke connect/set lalu meledak P2025/P2003 mentah atau menaut peran salah.
 * Nilai non-ID dibuang diam-diam (bukan menolak): form hanya mengirim string
 * ID sah dari checkbox peran, tak ada jalur sah yang mengirim "0" — dan
 * menolak di sini mengubah respons sukses-menjadi-gagal bagi payload lama. */
function readEmployeeLoginInput(formData: FormData) {
  return {
    wantsLogin:
      formData.get("createLoginAccount") === "true" ||
      formData.get("createLoginAccount") === "on",
    email: formData.get("email") as string | null,
    loginPass: formData.get("loginPassword") as string | null,
    loginRoleIds: formData
      .getAll("loginRoleIds")
      .map((v) => safeId(v))
      .filter((n): n is number => n !== null),
  };
}

/** Field karyawan yang sama persis di create dan update (tanpa kolom khusus jalur). */
function readEmployeeFormFields(
  formData: FormData,
  dates: { joinDate: string; dateOfBirth?: string },
) {
  return {
    name: requireString(formData.get("name"), "name"),
    email: formData.get("email") as string | null,
    phone: formData.get("phone") as string | null,
    gender: (formData.get("gender") as string | null) || null,
    dateOfBirth: dates.dateOfBirth ? wibDateToUtcMidnight(dates.dateOfBirth) : null,
    maritalStatus: (formData.get("maritalStatus") as string | null) || null,
    // P1-6: jumlah tanggungan untuk PTKP (0-3). Clamp server-side.
    dependents: Math.min(3, Math.max(0, Math.floor(Number(formData.get("dependents")) || 0))),
    departmentId: safeId(formData.get("departmentId")),
    positionId: safeId(formData.get("positionId")),
    paymentFrequency:
      (formData.get("paymentFrequency") as string) || "MONTHLY",
    // Gaji pokok nominal uang: wajib parser repo — safeNumber/Number membaca
    // "5.000.000" sebagai 5 dan "5.000.000,50" sebagai NaN->0.
    baseSalary: parseMoneyAmount(formData.get("baseSalary")) ?? 0,
    idNumber: formData.get("idNumber") as string | null,
    npwp: formData.get("npwp") as string | null,
    bankName: formData.get("bankName") as string | null,
    bankAccountNumber: formData.get("bankAccountNumber") as string | null,
    bankAccountHolder: formData.get("bankAccountHolder") as string | null,
    bpjsKetenagakerjaan: formData.get("bpjsKetenagakerjaan") as string | null,
    bpjsKesehatan: formData.get("bpjsKesehatan") as string | null,
    street: formData.get("street") as string | null,
    province: formData.get("province") as string | null,
    employeeCity: formData.get("city") as string | null,
    employeeDistrict: formData.get("district") as string | null,
    employeeVillage: formData.get("village") as string | null,
    postalCode: formData.get("postalCode") as string | null,
  };
}

/**
 * F-2026-10-22-085-S: field siklus hidup karyawan dari FormData.
 * Kosakata tertutup Q-EMP-1/2 divalidasi di sini (BR-EMP-02): teks bebas
 * ditolak. employmentEndedAt dan endReason wajib berpasangan. Tanggal
 * divalidasi employeeDatesSchema (parsedDates) sebelum fungsi ini jalan.
 * Field absen dari FormData = tidak disentuh (null) supaya pemanggil lama
 * (quick-add dsb.) tidak menghapus data siklus hidup tanpa sadar.
 */
function readEmployeeLifecycleFields(
  formData: FormData,
  dates: {
    contractStartDate?: string;
    contractEndDate?: string;
    employmentEndedAt?: string;
    leaveEligibilityStartDate?: string;
  },
) {
  const rawStatus = (formData.get("employmentStatus") as string | null)?.trim() || null;
  if (rawStatus !== null && !isEmploymentStatus(rawStatus)) {
    throw new Error("Status kepegawaian tidak valid");
  }
  const rawReason = (formData.get("endReason") as string | null)?.trim() || null;
  if (rawReason !== null && !isEmploymentEndReason(rawReason)) {
    throw new Error("Alasan berhenti tidak valid");
  }
  const endedAt = dates.employmentEndedAt
    ? wibDateToUtcMidnight(dates.employmentEndedAt)
    : null;
  if ((endedAt === null) !== (rawReason === null)) {
    throw new Error("Tanggal berhenti dan alasan berhenti wajib diisi bersamaan");
  }
  return {
    employmentStatus: rawStatus,
    contractStartDate: dates.contractStartDate
      ? wibDateToUtcMidnight(dates.contractStartDate)
      : null,
    contractEndDate: dates.contractEndDate
      ? wibDateToUtcMidnight(dates.contractEndDate)
      : null,
    employmentEndedAt: endedAt,
    endReason: rawReason,
    leaveEligibilityStartDate: dates.leaveEligibilityStartDate
      ? wibDateToUtcMidnight(dates.leaveEligibilityStartDate)
      : null,
  };
}

function todayWibMidnightDate(): Date {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return wibDateToUtcMidnight(today);
}

function dateOnlyOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

type EmployeeLifecycleValues = {
  employmentStatus: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  employmentEndedAt: string | null;
  endReason: string | null;
  leaveEligibilityStartDate: string | null;
};

/**
 * BR-EMP-09: satu baris jejak perubahan siklus hidup dengan old/new.
 * Pola writeWorkOrderEndDateLog (F-035): gagal tulis TIDAK melempar —
 * update karyawan yang sudah commit tidak dilaporkan gagal gara-gara
 * jejak; kegagalan dikembalikan sebagai penanda eksplisit { success }.
 */
async function writeEmployeeLifecycleLog(args: {
  userId: number;
  employeeId: number;
  oldValues: EmployeeLifecycleValues;
  newValues: EmployeeLifecycleValues;
}): Promise<{ success: boolean }> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        action: "employee_lifecycle_changed",
        modelType: "Employee",
        modelId: args.employeeId,
        description: "Mengubah status kepegawaian karyawan",
        oldValues: args.oldValues,
        newValues: args.newValues,
      },
    });
    return { success: true };
  } catch (logError) {
    console.error("[writeEmployeeLifecycleLog] gagal menulis jejak", logError);
    return { success: false };
  }
}

// departmentId/positionId hanya divalidasi format oleh safeId; FK fiktif lolos
// ke Prisma (P2003 mentah / karyawan yatim). Cek eksistensi pra-tulis.
async function assertEmployeeRefsExist(fields: { departmentId: number | null; positionId: number | null }) {
  if (fields.departmentId !== null) {
    const dept = await prisma.department.findFirst({ where: { id: fields.departmentId }, select: { id: true } });
    if (!dept) throw new Error("Departemen tidak ditemukan");
  }
  if (fields.positionId !== null) {
    const pos = await prisma.position.findFirst({ where: { id: fields.positionId }, select: { id: true } });
    if (!pos) throw new Error("Jabatan tidak ditemukan");
  }
}

// ==================== EMPLOYEE ACTIONS ====================

export async function createEmployee(formData: FormData) {
  try {
    const actor = await requirePermission("create_employees");

    // quick-add upsert: name match active (HR-scope checked below). Only applied when __quickAdd flag
    const rawNameEmp = (formData.get("name") as string | null)?.trim()
    if (rawNameEmp && formData.get("__quickAdd") === "1") {
      const existingEmp = await prisma.employee.findFirst({ where: { name: rawNameEmp, deletedAt: null }, select: { id: true, slug: true } })
      if (existingEmp) return { success: true as const, id: existingEmp.id, slug: existingEmp.slug ?? undefined }
    }


    const scope = await getHrScope(actor);
    if (scope.kind === "self") {
      throw new Error("Anda tidak memiliki akses untuk membuat data karyawan.");
    } else if (scope.kind === "department") {
      const deptId = safeId(formData.get("departmentId"));
      if (deptId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan membuat data karyawan di departemen Anda sendiri.");
      }
    }

    const settings = await getSystemSettings();
    let employeeNo = (formData.get("employeeNo") as string) || null;
    if (settings.enableAutoEmployeeCode !== false || !employeeNo) {
      employeeNo = await generateDocumentNumber("EMP", "simple");
    }

    // Optional login account fields
    const { wantsLogin, email, loginPass, loginRoleIds } = readEmployeeLoginInput(formData);

    if (wantsLogin) {
      if (!email || email.trim() === "") {
        return { success: false, error: "Email wajib diisi untuk akun login" };
      }
      if (!loginPass || loginPass.length < 8) {
        return { success: false, error: "Kata sandi minimal 8 karakter" };
      }
      const existing = await prisma.user.findUnique({
        where: { email: email.trim() },
      });
      if (existing) {
        return {
          success: false,
          error: "Email sudah terdaftar sebagai pengguna",
        };
      }
      // Privilege-escalation guard: never let a non-super-admin mint a
      // login account carrying the super_admin role from the Employee form.
      // Mirrors `assertNoSuperAdminGrant` in auth.actions.ts so an HR-permission
      // holder cannot bypass the dedicated user-management gate.
      const grantErr = await assertNoSuperAdminGrant(actor.roles, loginRoleIds);
      if (grantErr) {
        return { success: false, error: grantErr };
      }
    }

    const parsedDates = parseFormData(employeeDatesSchema, formData);
    if (!parsedDates.success) return { success: false, error: parsedDates.error };

    const employeeData = {
      employeeNo,
      ...readEmployeeFormFields(formData, parsedDates.data),
      ...readEmployeeLifecycleFields(formData, parsedDates.data),
      joinDate: wibDateToUtcMidnight(parsedDates.data.joinDate),
      isActive: true,
    };
    await assertEmployeeRefsExist(employeeData);

    // Create employee + (optionally) a linked login account atomically.
    const employee = await prisma.$transaction(async (tx) => {
      if (wantsLogin && email && loginPass) {
        const hashedPassword = await bcrypt.hash(loginPass, 12);
        const user = await tx.user.create({
          data: {
            name: employeeData.name,
            email: email.trim(),
            slug: await nextSlug("user", employeeData.name),
            password: hashedPassword,
            isActive: true,
            ...(loginRoleIds.length > 0
              ? { roles: { connect: loginRoleIds.map((id) => ({ id })) } }
              : {}),
          },
        });
        return tx.employee.create({
          data: {
            ...employeeData,
            userId: user.id,
            slug: await nextSlug("employee", employeeData.name),
          },
        });
      }
      return tx.employee.create({
        data: {
          ...employeeData,
          slug: await nextSlug("employee", employeeData.name),
        },
      });
    });

    revalidatePath("/master/karyawan");
    await logActivity(
      "create",
      "Employee",
      employee.id,
      wantsLogin ? "Membuat karyawan + akun login" : "Membuat karyawan",
    );
    return { success: true, id: employee.id, slug: employee.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createEmployee]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateEmployee(employeeId: number, formData: FormData) {
  try {
    const actor = await requirePermission("edit_employees");

    const scope = await getHrScope(actor);
    if (scope.kind === "self" && scope.employeeId !== employeeId) {
      throw new Error("Anda hanya diperbolehkan mengupdate data diri Anda sendiri.");
    } else if (scope.kind === "department") {
      const currentEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { departmentId: true }
      });
      if (!currentEmployee || currentEmployee.departmentId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengupdate data karyawan se-departemen Anda.");
      }

      const newDeptId = safeId(formData.get("departmentId"));
      if (newDeptId !== scope.departmentId) {
        throw new Error("Anda hanya diperbolehkan mengupdate data karyawan ke departemen Anda sendiri.");
      }
    }

    // Optional: create a login account for an employee that does not have one yet.
    const { wantsLogin, email, loginPass, loginRoleIds } = readEmployeeLoginInput(formData);

    // Look up whether this employee already has a linked login account.
    const current = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        userId: true,
        employmentStatus: true,
        leaveEligibilityStartDate: true,
        contractStartDate: true,
        contractEndDate: true,
        employmentEndedAt: true,
        endReason: true,
      },
    });
    const trimmedEmail = email?.trim() || null;

    // Target-escalation guard: a non-super-admin must not be able to alter the
    // record/login account of an employee whose user is super_admin (rewrite its
    // name/email, or strip/replace its roles via the sync branch below).
    const targetErr = await assertCanModifyEmployeeTarget(
      actor.roles,
      current?.userId ?? null,
    );
    if (targetErr) {
      return { success: false, error: targetErr };
    }

    if (wantsLogin) {
      if (current?.userId) {
        return {
          success: false,
          error: "Karyawan ini sudah memiliki akun login",
        };
      }
      if (!trimmedEmail) {
        return { success: false, error: "Email wajib diisi untuk akun login" };
      }
      if (!loginPass || loginPass.length < 8) {
        return { success: false, error: "Kata sandi minimal 8 karakter" };
      }
      const existing = await prisma.user.findUnique({
        where: { email: trimmedEmail },
      });
      if (existing) {
        return {
          success: false,
          error: "Email sudah terdaftar sebagai pengguna",
        };
      }
    }

    // Privilege-escalation guard: block granting the super_admin role from the
    // Employee form on BOTH the "create new login" and the "sync existing login"
    // branches. Applies whenever role IDs are submitted, regardless of wantsLogin.
    const grantErr = await assertNoSuperAdminGrant(actor.roles, loginRoleIds);
    if (grantErr) {
      return { success: false, error: grantErr };
    }

    // If the employee already has a login account and the email is changing,
    // keep the user's login email in sync (email IS the login credential).
    let syncUserId: number | null = null;
    if (!wantsLogin && current?.userId && trimmedEmail) {
      const clash = await prisma.user.findUnique({
        where: { email: trimmedEmail },
      });
      if (clash && clash.id !== current.userId) {
        return {
          success: false,
          error: "Email sudah terdaftar sebagai pengguna lain",
        };
      }
      syncUserId = current.userId;
    }

    const parsedDates = parseFormData(employeeDatesSchema, formData);
    if (!parsedDates.success) return { success: false, error: parsedDates.error };

    const employeeFields = readEmployeeFormFields(formData, parsedDates.data);
    await assertEmployeeRefsExist(employeeFields);
    // F-085-S: siklus hidup hanya ditulis bila form mengirim field-nya;
    // form lama tanpa field ini tidak menghapus data yang sudah tercatat.
    const lifecycleTouched =
      formData.has("employmentStatus") ||
      formData.has("contractStartDate") ||
      formData.has("contractEndDate") ||
      formData.has("employmentEndedAt") ||
      formData.has("leaveEligibilityStartDate") ||
      formData.has("endReason");
    const lifecycleFields = lifecycleTouched
      ? readEmployeeLifecycleFields(formData, parsedDates.data)
      : null;

    // Transisi Magang -> Kontrak: jam masa kerja hak cuti mulai dari
    // tanggal mulai kontrak (masa magang tidak terhitung). Jangkar hanya
    // diisi otomatis bila belum pernah diatur manual.
    if (
      lifecycleFields &&
      current &&
      current.employmentStatus === "INTERN" &&
      (lifecycleFields.employmentStatus === "PKWT" ||
        lifecycleFields.employmentStatus === "PKWTT") &&
      current.leaveEligibilityStartDate == null &&
      lifecycleFields.leaveEligibilityStartDate == null
    ) {
      lifecycleFields.leaveEligibilityStartDate =
        lifecycleFields.contractStartDate ?? todayWibMidnightDate();
    }
    const updateData = {
      ...employeeFields,
      ...(lifecycleFields ?? {}),
      // updateEmployee tidak menulis joinDate (tak berubah); tanggal divalidasi di atas agar konsisten dgn create.
      slug: await nextSlug("employee", employeeFields.name, { excludeId: employeeId }),
    };

    await prisma.$transaction(async (tx) => {
      if (wantsLogin && email && loginPass) {
        const hashedPassword = await bcrypt.hash(loginPass, 12);
        const user = await tx.user.create({
          data: {
            name: updateData.name,
            email: email.trim(),
            slug: await nextSlug("user", updateData.name),
            password: hashedPassword,
            isActive: true,
            ...(loginRoleIds.length > 0
              ? { roles: { connect: loginRoleIds.map((id) => ({ id })) } }
              : {}),
          },
        });
        await tx.employee.update({
          where: { id: employeeId },
          data: { ...updateData, userId: user.id },
        });
      } else {
        await tx.employee.update({
          where: { id: employeeId },
          data: updateData,
        });
        // Keep the linked login account's email + name + roles in sync with the employee.
        if (syncUserId) {
          await tx.user.update({
            where: { id: syncUserId },
            data: {
              name: updateData.name,
              ...(trimmedEmail ? { email: trimmedEmail } : {}),
              ...(loginRoleIds.length > 0
                ? { roles: { set: loginRoleIds.map((id) => ({ id })) } }
                : {}),
            },
          });
        }
      }
    });

    revalidatePath("/master/karyawan");
    await logActivity(
      "update",
      "Employee",
      employeeId,
      wantsLogin
        ? "Memperbarui karyawan + buat akun login"
        : "Memperbarui karyawan",
    );
    // BR-EMP-09: perubahan siklus hidup tercatat old/new (pola F-035).
    // logActivity existing tidak menulis oldValues/newValues -> baris khusus.
    if (lifecycleFields && current) {
      const oldValues = {
        employmentStatus: current.employmentStatus,
        contractStartDate: dateOnlyOrNull(current.contractStartDate),
        contractEndDate: dateOnlyOrNull(current.contractEndDate),
        employmentEndedAt: dateOnlyOrNull(current.employmentEndedAt),
        endReason: current.endReason,
        leaveEligibilityStartDate: dateOnlyOrNull(current.leaveEligibilityStartDate),
      };
      const newValues = {
        employmentStatus: lifecycleFields.employmentStatus,
        contractStartDate: dateOnlyOrNull(lifecycleFields.contractStartDate),
        contractEndDate: dateOnlyOrNull(lifecycleFields.contractEndDate),
        employmentEndedAt: dateOnlyOrNull(lifecycleFields.employmentEndedAt),
        endReason: lifecycleFields.endReason,
        leaveEligibilityStartDate: dateOnlyOrNull(lifecycleFields.leaveEligibilityStartDate),
      };
      if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) {
        const logged = await writeEmployeeLifecycleLog({
          userId: Number(actor.id),
          employeeId,
          oldValues,
          newValues,
        });
        if (!logged.success) {
          console.error("[updateEmployee] jejak siklus hidup gagal ditulis", {
            employeeId,
          });
        }
      }
    }
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateEmployee]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ACCOUNT (COA) ACTIONS ====================

export async function createAccount(formData: FormData) {
  try {
    await requirePermission("create_accounts");

    const rawNameAcc = (formData.get("name") as string | null)?.trim()
    if (rawNameAcc) {
      const existing = await prisma.account.findFirst({ where: { name: rawNameAcc, deletedAt: null }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const parsed = parseFormData(accountServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    let code = v.code || null;
    if (!code) {
      code = await generateDocumentNumber("ACC", "simple");
    }

    const account = await prisma.account.create({
      data: {
        code,
        name: v.name,
        slug: await nextSlug("account", v.name),
        type: v.type,
        parentId: v.parentId ?? null,
        description: v.description ?? null,
        normalBalance: v.normalBalance ?? null,
        isActive: true,
      },
    });

    revalidatePath("/master/akun");
    await logActivity("create", "Account", account.id, "Membuat akun");
    return { success: true, id: account.id, slug: account.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAccount]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ITEM CATEGORY ACTIONS ====================

export async function createItemCategory(formData: FormData) {
  try {
    const user = await requirePermission("create_item_categories");

    const rawName = (formData.get("name") as string | null)?.trim()
    if (rawName) {
      const existing = await prisma.itemCategory.findFirst({ where: { name: rawName }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    const parsed = parseFormData(itemCategoryServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.parentId !== undefined) {
      const parent = await prisma.itemCategory.findUnique({
        where: { id: v.parentId },
        select: { id: true },
      });
      if (!parent) return { success: false, error: "Kategori induk tidak ditemukan" };
    }

    const category = await prisma.itemCategory.create({
      data: {
        name: v.name,
        slug: await nextSlug("itemCategory", v.name),
        description: v.description ?? null,
        parentId: v.parentId ?? null,
        costingMethod: v.costingMethod ?? "average",
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/barang");
    await logActivity(
      "create",
      "ItemCategory",
      category.id,
      "Membuat kategori barang",
    );
    return { success: true, id: category.id, slug: category.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createItemCategory]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Kategori dengan nama tersebut sudah ada." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateItemCategory(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_item_categories");

    const parsed = parseFormData(itemCategoryServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Only write the hierarchy/valuation fields when the form actually submits
    // them. The edit form renders only name + description, so blindly writing
    // `parentId: safeNumber(null)` / `costingMethod: "" || "average"` would wipe
    // the category's parent (flattening the tree) and flip a FIFO category to
    // "average" on every save — silently changing HPP valuation for its items.
    const data: Record<string, unknown> = {
      updatedBy: Number(user.id),
      name: v.name,
      slug: await nextSlug("itemCategory", v.name, { excludeId: id }),
      description: v.description ?? null,
    };
    if (formData.has("parentId")) {
      if (v.parentId === undefined) {
        data.parentId = null;
      } else {
        if (v.parentId === id) {
          return { success: false, error: "Kategori tidak dapat menjadi induk bagi dirinya sendiri" };
        }
        const parent = await prisma.itemCategory.findUnique({
          where: { id: v.parentId },
          select: { id: true, parentId: true },
        });
        if (!parent) return { success: false, error: "Kategori induk tidak ditemukan" };
        // Anti-siklus: induk baru tidak boleh keturunan kategori ini.
        let cursor: { id: number; parentId: number | null } | null = parent;
        for (let depth = 0; cursor && depth < 100; depth++) {
          if (cursor.parentId === id) {
            return { success: false, error: "Kategori induk tidak boleh berupa sub-kategori dari kategori ini" };
          }
          if (cursor.parentId === null) break;
          cursor = await prisma.itemCategory.findUnique({
            where: { id: cursor.parentId },
            select: { id: true, parentId: true },
          });
        }
        data.parentId = v.parentId;
      }
    }
    if (formData.has("costingMethod") && v.costingMethod !== undefined) {
      data.costingMethod = v.costingMethod;
    }

    await prisma.itemCategory.update({
      where: { id },
      data,
    });

    revalidatePath("/master/kategori-barang");
    await logActivity(
      "update",
      "ItemCategory",
      id,
      "Memperbarui kategori barang",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateItemCategory]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Kategori dengan nama tersebut sudah ada." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DEPARTMENT ACTIONS ====================

export async function createDepartment(formData: FormData) {
  try {
    await requirePermission("create_departments");

    const rawNameDept = (formData.get("name") as string | null)?.trim()
    if (rawNameDept) {
      const existing = await prisma.department.findFirst({ where: { name: rawNameDept }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    let code = (formData.get("code") as string) || null;
    if (!code) {
      code = await generateDocumentNumber("DEPT", "simple");
    }

    const department = await prisma.department.create({
      data: {
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("department", requireString(formData.get("name"), "name")),
        code,
        description: formData.get("description") as string | null,
      },
    });

    revalidatePath("/master/karyawan");
    await logActivity(
      "create",
      "Department",
      department.id,
      "Membuat departemen",
    );
    return { success: true, id: department.id, slug: department.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createDepartment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateDepartment(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_departments");

    await prisma.department.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("department", requireString(formData.get("name"), "name"), { excludeId: id }),
        code: formData.get("code") as string | null,
        description: formData.get("description") as string | null,
      },
    });

    revalidatePath("/master/departemen");
    await logActivity("update", "Department", id, "Memperbarui departemen");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateDepartment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== POSITION ACTIONS ====================

export async function createPosition(formData: FormData) {
  try {
    await requirePermission("create_positions");

    const rawNamePos = (formData.get("name") as string | null)?.trim()
    if (rawNamePos) {
      const existing = await prisma.position.findFirst({ where: { name: rawNamePos }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    // FK tanpa cek: departmentId fiktif lolos safeId lalu meledak P2003 mentah
    // di DB (atau jabatan yatim). Tolak pra-tulis dengan pesan yang bisa ditindak.
    const departmentId = safeId(formData.get("departmentId"));
    if (departmentId !== null) {
      const dept = await prisma.department.findFirst({ where: { id: departmentId }, select: { id: true } });
      if (!dept) throw new Error("Departemen tidak ditemukan");
    }

    const submittedCode = (formData.get("code") as string) || null;
    let code = submittedCode;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (!code) {
        code = await generateDocumentNumber("POS", "simple");
      }

      try {
        const position = await prisma.position.create({
          data: {
            name: requireString(formData.get("name"), "name"),
            slug: await nextSlug("position", requireString(formData.get("name"), "name")),
            code,
            departmentId,
            description: (formData.get("description") as string) || null,
          },
        });

        revalidatePath("/master/karyawan");
        await logActivity("create", "Position", position.id, "Membuat jabatan");
        return { success: true, id: position.id, slug: position.slug };
      } catch (createErr: unknown) {
        const err = createErr as {
          code?: string;
          meta?: { target?: string[] };
          message?: string;
        };
        const isUniqueCodeConflict =
          err?.code === "P2002" &&
          ((Array.isArray(err?.meta?.target) &&
            err.meta.target.includes("code")) ||
            String(err?.message || "").includes("positions_code_key"));
        if (!isUniqueCodeConflict) throw createErr;
        code = null;
      }
    }

    return {
      success: false,
      error: "Gagal membuat kode jabatan unik, silakan coba lagi",
    };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPosition]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePosition(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_positions");

    // Sama seperti createPosition: departmentId fiktif ditolak pra-tulis.
    const departmentId = safeId(formData.get("departmentId"));
    if (departmentId !== null) {
      const dept = await prisma.department.findFirst({ where: { id: departmentId }, select: { id: true } });
      if (!dept) throw new Error("Departemen tidak ditemukan");
    }

    await prisma.position.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("position", requireString(formData.get("name"), "name"), { excludeId: id }),
        departmentId,
        description: (formData.get("description") as string) || null,
      },
    });

    revalidatePath("/master/jabatan");
    await logActivity("update", "Position", id, "Memperbarui jabatan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePosition]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

function leadExpectedCloseDate(
  value: string | undefined,
): Date | null | undefined {
  return value ? wibDateToUtcMidnight(value) : null;
}

export async function createLead(formData: FormData) {
  try {
    const actor = await requirePermission("create_leads");
    const viewer = {
      userId: Number(actor.id),
      canManageLeads:
        actor.permissions.includes("manage_leads") ||
        actor.roles.includes("super_admin"),
    };

    const parsed = parseFormData(createLeadSchema, formData);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    const v = parsed.data;

    // F-2026-10-24-141-S Model C (Q-DUP-1): kandidat cocok -> TIDAK simpan
    // dulu; kembalikan peringatan. Alasan wajib divalidasi server (BR-DUP-06).
    const reasonCheck = validateDuplicateOverrideReason(
      v.duplicateOverrideReason,
    );
    const preFound = await findLeadDuplicateCandidates(
      { phone: v.phone ?? null, email: v.email ?? null },
      viewer,
    );
    const preWarning = buildDuplicateWarning(preFound);
    if (preWarning && !reasonCheck.ok) {
      return {
        success: false as const,
        duplicateWarning: preWarning,
        error: reasonCheck.error,
      };
    }

    const leadNumber = await generateDocumentNumber("LEAD", "simple");

    const data = {
      slug: await nextSlug("lead", v.name || leadNumber),
      leadNumber,
      name: v.name,
      email: v.email ?? null,
      phone: v.phone ?? null,
      company: v.company ?? null,
      contactName: v.contactName ?? null,
      position: v.position ?? null,
      industry: v.industry ?? null,
      estimatedValue: v.estimatedValue ?? null,
      expectedCloseDate: leadExpectedCloseDate(v.expectedCloseDate),
      address: v.address ?? null,
      source: v.source ?? null,
      notes: v.notes ?? null,
      assignedTo: v.assignedTo ?? null,
      status: "new",
    };

    // Re-check kandidat di dalam transaksi (§1.6) + jejak override atomik
    // pada lead baru (BR-DUP-06/10). Risiko konkuren sisa terdokumentasi
    // di lead-duplicate.service — tanpa klaim atomik penuh.
    const lead = await prisma.$transaction(async (tx) => {
      const txFound = await findLeadDuplicateCandidates(
        { phone: v.phone ?? null, email: v.email ?? null },
        viewer,
        tx,
      );
      const txWarning = buildDuplicateWarning(txFound);
      if (txWarning && !reasonCheck.ok) {
        return null;
      }
      const created = await tx.lead.create({ data });
      const effective = txWarning ?? preWarning;
      if (effective && reasonCheck.ok) {
        await tx.leadActivity.create({
          data: {
            leadId: created.id,
            userId: Number(actor.id),
            type: DUPLICATE_OVERRIDE_ACTIVITY_TYPE,
            subject: DUPLICATE_OVERRIDE_SUBJECT,
            description: buildDuplicateOverrideDescription(reasonCheck.reason, [
              ...effective.candidates.map((c) => c.id),
              ...effective.lostCandidates.map((c) => c.id),
            ]),
          },
        });
      }
      return created;
    });
    if (!lead) {
      const lateWarning = buildDuplicateWarning(
        await findLeadDuplicateCandidates(
          { phone: v.phone ?? null, email: v.email ?? null },
          viewer,
        ),
      );
      return {
        success: false as const,
        duplicateWarning: lateWarning ?? preWarning,
        error: reasonCheck.ok
          ? "Kemungkinan lead duplikat ditemukan. Periksa kandidat dulu."
          : reasonCheck.error,
      };
    }
    revalidatePath("/crm/leads");
    await logActivity("create", "Lead", lead.id, "Membuat lead");
    redirect("/crm/leads");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createLead]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateLead(id: number, formData: FormData) {
  try {
    const actor = await requirePermission("edit_leads");
    const isAdmin =
      actor.permissions.includes("manage_leads") ||
      actor.roles.includes("super_admin");
    const viewer = { userId: Number(actor.id), canManageLeads: isAdmin };

    const parsed = parseFormData(updateLeadSchema, formData);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    const v = parsed.data;

    const existing = await prisma.lead.findUniqueOrThrow({ where: { id } });

    // Security Guard: Sales can only edit their own leads unless they have manage_leads permission.
    if (!isAdmin && existing.assignedTo !== Number(actor.id)) {
      throw new Error(
        "Anda hanya dapat mengubah lead yang ditugaskan kepada Anda.",
      );
    }

    // F-2026-10-25-030-S Q-LR-2/4: cabang lost digerbang SEBELUM mutasi —
    // kategori wajib + key asing ditolak, won/lost terminal mutlak.
    // Kategori pada status non-lost juga ditolak (form wajib kosong);
    // guard kepemilikan existing di atas tetap penjaga pertama (AC-LR-B6).
    if (v.lostReasonCategory != null && v.status !== "lost") {
      throw new Error(
        "Kategori alasan kalah hanya berlaku saat status diubah menjadi kalah (lost).",
      );
    }
    const lostCheck = validateLeadLostTransition({
      fromStatus: existing.status,
      toStatus: v.status ?? null,
      category: v.lostReasonCategory ?? null,
      freeText: v.lostReasonText ?? null,
    });
    if (!lostCheck.ok) {
      throw new Error(lostCheck.error);
    }

    const newAssignedTo = v.assignedTo ?? null;

    // Security Guard: Only admins can re-assign leads to others.
    if (!isAdmin && newAssignedTo !== existing.assignedTo) {
      throw new Error(
        "Anda tidak memiliki izin untuk mengubah penugasan (assignee) lead.",
      );
    }

    // F-2026-10-24-141-S Q-DUP-3: cek duplikat di edit — self-excluded,
    // HANYA bila phone/email berubah dari nilai tersimpan (normalisasi
    // dibandingkan; format-saja bukan perubahan). Status-saja tidak memicu.
    const oldKeys = leadContactKeys(existing);
    const newKeys = leadContactKeys({
      phone: v.phone ?? null,
      email: v.email ?? null,
    });
    const contactChanged =
      oldKeys.phoneKey !== newKeys.phoneKey ||
      oldKeys.emailKey !== newKeys.emailKey;
    const reasonCheck = validateDuplicateOverrideReason(
      v.duplicateOverrideReason,
    );
    let preWarning: LeadDuplicateWarning | null = null;
    if (contactChanged) {
      preWarning = buildDuplicateWarning(
        await findLeadDuplicateCandidates(
          { phone: v.phone ?? null, email: v.email ?? null, excludeLeadId: id },
          viewer,
        ),
      );
      if (preWarning && !reasonCheck.ok) {
        return {
          success: false as const,
          duplicateWarning: preWarning,
          error: reasonCheck.error,
        };
      }
    }

    // Log a status_change activity when status actually changes (mirrors
    // YaraERP LeadController::update). Status + activity write atomically.
    const statusChanged =
      v.status != null && v.status !== existing.status;

    const updated = await prisma.$transaction(async (tx) => {
      // Re-check di dalam transaksi (§1.6); bila kandidat muncul tanpa
      // alasan sah -> batalkan seluruh edit (return null, tanpa mutasi).
      let txWarning: LeadDuplicateWarning | null = null;
      if (contactChanged) {
        txWarning = buildDuplicateWarning(
          await findLeadDuplicateCandidates(
            {
              phone: v.phone ?? null,
              email: v.email ?? null,
              excludeLeadId: id,
            },
            viewer,
            tx,
          ),
        );
        if (txWarning && !reasonCheck.ok) return null;
      }
      await tx.lead.update({
        where: { id },
        data: {
          slug: await nextSlug("lead", v.name || existing.leadNumber, { excludeId: id }),
          name: v.name,
          email: v.email ?? null,
          phone: v.phone ?? null,
          company: v.company ?? null,
          contactName: v.contactName ?? null,
          position: v.position ?? null,
          industry: v.industry ?? null,
          estimatedValue: v.estimatedValue ?? null,
          expectedCloseDate: leadExpectedCloseDate(v.expectedCloseDate),
          address: v.address ?? null,
          source: v.source ?? null,
          notes: v.notes ?? null,
          assignedTo: newAssignedTo,
          ...(v.status != null ? { status: v.status } : {}),
        },
      });
      const effective = txWarning ?? preWarning;
      if (effective && reasonCheck.ok) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: Number(actor.id),
            type: DUPLICATE_OVERRIDE_ACTIVITY_TYPE,
            subject: DUPLICATE_OVERRIDE_SUBJECT,
            description: buildDuplicateOverrideDescription(reasonCheck.reason, [
              ...effective.candidates.map((c) => c.id),
              ...effective.lostCandidates.map((c) => c.id),
            ]),
          },
        });
      }
      if (statusChanged) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: Number(actor.id),
            type: "status_change",
            subject: "Status diubah",
            // Awalan [kalah:key] hanya pada transisi ke lost (Q-LR-1);
            // status lain description tetap null seperti existing.
            description: lostCheck.ok ? lostCheck.description : null,
            oldStatus: existing.status,
            newStatus: v.status,
          },
        });
      }
      return true;
    });
    if (!updated) {
      const lateWarning = buildDuplicateWarning(
        await findLeadDuplicateCandidates(
          { phone: v.phone ?? null, email: v.email ?? null, excludeLeadId: id },
          viewer,
        ),
      );
      return {
        success: false as const,
        duplicateWarning: lateWarning ?? preWarning,
        error: reasonCheck.ok
          ? "Kemungkinan lead duplikat ditemukan. Periksa kandidat dulu."
          : reasonCheck.error,
      };
    }

    revalidatePath("/crm/leads");
    await logActivity("update", "Lead", id, "Memperbarui lead");
    redirect("/crm/leads");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateLead]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BANK ACTIONS ====================

export async function createBank(formData: FormData) {
  try {
    const user = await requirePermission("create_banks");

    const rawNameBank = (formData.get("name") as string | null)?.trim()
    if (rawNameBank) {
      const existing = await prisma.bank.findFirst({ where: { name: rawNameBank }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    const parsed = parseFormData(bankServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Bank.accountId plain Int tanpa FK; cek akun ada agar jurnal kas/bank tak yatim.
    if (v.accountId != null) {
      const account = await prisma.account.findFirst({ where: { id: v.accountId, deletedAt: null }, select: { id: true } })
      if (!account) return { success: false, error: "Akun (COA) tidak ditemukan" }
    }

    const bank = await prisma.bank.create({
      data: {
        name: v.name,
        slug: await nextSlug("bank", v.name),
        code: v.code,
        accountId: v.accountId ?? null,
        type: v.type,
        isActive: true,
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/bank");
    await logActivity("create", "Bank", bank.id, "Membuat bank");
    return { success: true, id: bank.id, slug: bank.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBank]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateBank(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_banks");

    const parsed = parseFormData(bankServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    if (v.accountId != null) {
      const account = await prisma.account.findFirst({ where: { id: v.accountId, deletedAt: null }, select: { id: true } })
      if (!account) return { success: false, error: "Akun (COA) tidak ditemukan" }
    }

    await prisma.bank.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        name: v.name,
        slug: await nextSlug("bank", v.name, { excludeId: id }),
        code: v.code,
        accountId: v.accountId ?? null,
        type: v.type,
      },
    });

    revalidatePath("/master/bank");
    await logActivity("update", "Bank", id, "Memperbarui bank");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateBank]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== TAX ACTIONS ====================

/** Tax rate is a percentage: clamp to a sane 0..100 range (Decimal(5,2)). */
function clampTaxRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(100, Math.max(0, rate));
}

export async function createTax(formData: FormData) {
  try {
    const user = await requirePermission("create_taxes");

    const rawNameTax = (formData.get("name") as string | null)?.trim()
    if (rawNameTax) {
      const existing = await prisma.tax.findFirst({ where: { name: rawNameTax, deletedAt: null }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    const parsed = parseFormData(taxServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const tax = await prisma.tax.create({
      data: {
        name: v.name,
        slug: await nextSlug("tax", v.name),
        rate: clampTaxRate(v.rate),
        code: v.code,
        description: v.description,
        type: v.type,
        scope: v.scope,
        isInclusive: formData.get("isInclusive") === "on",
        isCompound: formData.get("isCompound") === "on",
        effectiveFrom: v.effectiveFrom ? wibDateToUtcMidnight(v.effectiveFrom) : undefined,
        effectiveTo: v.effectiveTo ? wibDateToUtcMidnight(v.effectiveTo) : undefined,
        isActive: true,
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/pajak");
    await logActivity("create", "Tax", tax.id, "Membuat pajak");
    // Quick-add from another form must stay on its own page; only the
    // full-page create form navigates back to the list afterwards.
    if (formData.get("__quickAdd") === "1") return { success: true, id: tax.id, slug: tax.slug };
    redirect("/master/pajak");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createTax]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateTax(id: number, formData: FormData) {
  try {
    await requirePermission("edit_taxes");

    const parsed = parseFormData(taxServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // The edit form renders only `name` and `rate`. Writing `isInclusive`/
    // `isCompound` unconditionally would force them to false on every save
    // (formData.get returns null for an unchecked/absent box), silently
    // downgrading an inclusive or compound tax. Preserve when the form does not
    // submit the field — same class as the account.normalBalance / itemCategory
    // parentId preservation fixes.
    const data: Prisma.TaxUpdateInput = {
      name: v.name,
      slug: await nextSlug("tax", v.name, { excludeId: id }),
      rate: clampTaxRate(v.rate),
      code: v.code,
      description: v.description,
      type: v.type,
      scope: v.scope,
      effectiveFrom: v.effectiveFrom ? wibDateToUtcMidnight(v.effectiveFrom) : undefined,
      effectiveTo: v.effectiveTo ? wibDateToUtcMidnight(v.effectiveTo) : undefined,
    };
    if (formData.has("isInclusive")) {
      data.isInclusive = formData.get("isInclusive") === "on";
    }
    if (formData.has("isCompound")) {
      data.isCompound = formData.get("isCompound") === "on";
    }

    await prisma.tax.update({
      where: { id },
      data,
    });

    revalidatePath("/master/pajak");
    await logActivity("update", "Tax", id, "Memperbarui pajak");
    redirect("/master/pajak");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateTax]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}



// ==================== BARCODE ACTIONS ====================

/**
 * Resolve a scanned/typed code (barcode OR SKU) to an item slug/id.
 * Used by the scan page to jump straight to the item's tracking detail.
 * Returns the slug when present so the scan page lands on the canonical
 * slug URL (detail pages accept numeric ids too, as legacy fallback).
 */
export async function lookupItemByScan(
  rawCode: string,
): Promise<{ success: boolean; id?: number; slug?: string | null; error?: string }> {
  try {
    await requirePermission("view_items");
    const code = (rawCode || "").trim();
    if (!code) return { success: false, error: "Kode kosong" };

    const byBarcode = await prisma.barcode.findUnique({
      where: { barcode: code },
      select: { itemId: true, item: { select: { slug: true } } },
    });
    if (byBarcode) return { success: true, id: byBarcode.itemId, slug: byBarcode.item?.slug ?? null };

    const bySku = await prisma.item.findFirst({
      where: { sku: code, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (bySku) return { success: true, id: bySku.id, slug: bySku.slug };

    return {
      success: false,
      error: `Barang dengan kode "${code}" tidak ditemukan`,
    };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[lookupItemByScan]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createBarcode(formData: FormData) {
  try {
    await requirePermission("create_barcodes");

    const parsed = parseFormData(barcodeServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const item = await prisma.item.findUnique({
      where: { id: v.itemId },
      select: { id: true },
    });
    if (!item) return { success: false, error: "Barang tidak ditemukan" };

    const barcodeEntry = await prisma.barcode.create({
      data: {
        barcode: v.barcode,
        slug: await nextSlug("barcode", v.barcode),
        itemId: v.itemId,
        type: v.type,
      },
    });

    revalidatePath("/master/barcode");
    await logActivity("create", "Barcode", barcodeEntry.id, "Membuat barcode");
    return { success: true, id: barcodeEntry.id, slug: barcodeEntry.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBarcode]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateBarcode(id: number, formData: FormData) {
  try {
    await requirePermission("edit_barcodes");

    const parsed = parseFormData(barcodeServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const item = await prisma.item.findUnique({
      where: { id: v.itemId },
      select: { id: true },
    });
    if (!item) return { success: false, error: "Barang tidak ditemukan" };

    await prisma.barcode.update({
      where: { id },
      data: {
        barcode: v.barcode,
        slug: await nextSlug("barcode", v.barcode, { excludeId: id }),
        itemId: v.itemId,
        type: v.type,
      },
    });
    revalidatePath("/master/barcode");
    await logActivity("update", "Barcode", id, "Memperbarui barcode");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateBarcode]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== TAX GROUP ACTIONS ====================

export async function createTaxGroup(formData: FormData) {
  try {
    await requirePermission("create_taxes");

    const name = requireString(formData.get("name"), "name");
    const rawTaxIds = formData.getAll("taxIds");
    const parsedTaxIds = rawTaxIds.map((id) => safeId(id));
    if (parsedTaxIds.some((id) => id === null) || parsedTaxIds.length === 0) throw new Error("Kelompok pajak wajib berisi minimal satu pajak yang valid");
    const taxIds = [...new Set(parsedTaxIds as number[])];
    // tax_group_taxes.tax_id tanpa FK DB: cek pajak ada & belum terhapus pra-tulis,
    // kalau tidak baris yatim lolos dan kelompok tampil kosong/rusak.
    const foundTaxes = await prisma.tax.findMany({ where: { id: { in: taxIds }, deletedAt: null }, select: { id: true } });
    if (foundTaxes.length !== taxIds.length) throw new Error("Pajak dalam kelompok tidak ditemukan atau nonaktif");

    const taxGroup = await prisma.taxGroup.create({
      data: {
        name,
        slug: await nextSlug("taxGroup", name),
        taxes: {
          create: taxIds.map((taxId) => ({ taxId })),
        },
      },
    });

    revalidatePath("/master/kelompok-pajak");
    await logActivity(
      "create",
      "TaxGroup",
      taxGroup.id,
      "Membuat kelompok pajak",
    );
    return { success: true, id: taxGroup.id, slug: taxGroup.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createTaxGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateTaxGroup(id: number, formData: FormData) {
  try {
    await requirePermission("edit_taxes");
    const name = requireString(formData.get("name"), "name");
    const rawTaxIds = formData.getAll("taxIds");
    const parsedTaxIds = rawTaxIds.map((t) => safeId(t));
    if (parsedTaxIds.some((id) => id === null) || parsedTaxIds.length === 0) throw new Error("Kelompok pajak wajib berisi minimal satu pajak yang valid");
    const taxIds = [...new Set(parsedTaxIds as number[])];
    const foundTaxes = await prisma.tax.findMany({ where: { id: { in: taxIds }, deletedAt: null }, select: { id: true } });
    if (foundTaxes.length !== taxIds.length) throw new Error("Pajak dalam kelompok tidak ditemukan atau nonaktif");
    await prisma.$transaction([
      prisma.taxGroupTax.deleteMany({ where: { taxGroupId: id } }),
      prisma.taxGroup.update({
        where: { id },
        data: {
          name,
          slug: await nextSlug("taxGroup", name, { excludeId: id }),
          taxes: { create: taxIds.map((taxId) => ({ taxId })) },
        },
      }),
    ]);
    revalidatePath("/master/kelompok-pajak");
    await logActivity("update", "TaxGroup", id, "Memperbarui kelompok pajak");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateTaxGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PAYMENT TERM ACTIONS ====================

export async function createPaymentTerm(formData: FormData) {
  try {
    const user = await requirePermission("create_payment_terms");

    const rawNamePT = (formData.get("name") as string | null)?.trim()
    if (rawNamePT) {
      const existing = await prisma.paymentTerm.findFirst({ where: { name: rawNamePT }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const paymentTerm = await prisma.paymentTerm.create({
      data: {
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("paymentTerm", requireString(formData.get("name"), "name")),
        code: formData.get("code") as string,
        days: safeNumber(formData.get("days")) ?? 0,
        isActive: true,
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/syarat-pembayaran");
    await logActivity(
      "create",
      "PaymentTerm",
      paymentTerm.id,
      "Membuat syarat pembayaran",
    );
    return { success: true, id: paymentTerm.id, slug: paymentTerm.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPaymentTerm]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePaymentTerm(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_payment_terms");

    await prisma.paymentTerm.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("paymentTerm", requireString(formData.get("name"), "name"), { excludeId: id }),
        code: formData.get("code") as string,
        days: safeNumber(formData.get("days")) ?? 0,
      },
    });

    revalidatePath("/master/syarat-pembayaran");
    await logActivity(
      "update",
      "PaymentTerm",
      id,
      "Memperbarui syarat pembayaran",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePaymentTerm]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deletePaymentTerm(id: number) {
  try {
    await requirePermission("delete_payment_terms");

    // Guard: cannot delete a payment term that is still in use by vendors.
    // Vendor.paymentTermId is an Int? FK with ON DELETE SET NULL (the migration
    // explicitly sets it), so a raw delete would silently null out the
    // paymentTermId on every vendor referencing this term, losing their AP
    // payment-term assignment with no warning. Mirrors the deleteDepartment /
    // deletePosition guards — refuse and let the operator reassign vendors first.
    const vendorCount = await prisma.vendor.count({
      where: { paymentTermId: id, deletedAt: null },
    });
    if (vendorCount > 0) {
      throw new Error(
        `Syarat pembayaran masih digunakan oleh ${vendorCount} vendor`,
      );
    }

    await prisma.paymentTerm.delete({ where: { id } });

    revalidatePath("/master/syarat-pembayaran");
    await logActivity(
      "delete",
      "PaymentTerm",
      id,
      "Menghapus syarat pembayaran",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePaymentTerm]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVendor(id: number) {
  try {
    const user = await requirePermission("delete_vendors");

    await hardDeleteOrSoftDelete(
      () => prisma.vendor.delete({ where: { id } }),
      () =>
        prisma.vendor.update({
          where: { id },
          data: {
        updatedBy: Number(user.id), deletedAt: new Date(), isActive: false },
        }),
    );

    revalidatePath("/master/vendor");
    await logActivity("delete", "Vendor", id, "Menghapus vendor");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVendor]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteItem(id: number) {
  try {
    await requirePermission("delete_items");

    await hardDeleteOrSoftDelete(
      () => prisma.item.delete({ where: { id } }),
      () =>
        prisma.item.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    );

    revalidatePath("/master/barang");
    await logActivity("delete", "Item", id, "Menghapus barang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteItem]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteWarehouse(id: number) {
  try {
    await requirePermission("delete_warehouses");

    await hardDeleteOrSoftDelete(
      () => prisma.warehouse.delete({ where: { id } }),
      () =>
        prisma.warehouse.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        }),
    );

    revalidatePath("/master/gudang");
    await logActivity("delete", "Warehouse", id, "Menghapus gudang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteWarehouse]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteEmployee(id: number) {
  try {
    await requirePermission("delete_employees");

    // Capture the linked login account (if any) before deleting.
    const existing = await prisma.employee.findUnique({
      where: { id },
      select: { userId: true },
    });

    // SECURITY-FIRST ORDERING: revoke the linked login BEFORE the employee row
    // is deleted, and commit that on its own.
    //
    // The previous version wrapped both writes in one `$transaction` but handed
    // hardDeleteOrSoftDelete the global prisma client, so the employee delete
    // committed on a separate connection while the transaction was still open. If
    // `tx.user.update` then failed, the transaction rolled back into exactly the
    // state the code claimed to prevent: employee gone, login still authenticating.
    //
    // Deactivating first makes that state unreachable: if deactivation fails the
    // employee row simply remains (an admin retries), and if the delete then fails
    // the login is already revoked - safe and recoverable. The reverse order can
    // never be repaired automatically.
    if (existing?.userId) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      });
    }

    await hardDeleteOrSoftDelete(
      () => prisma.employee.delete({ where: { id } }),
      () =>
        prisma.employee.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        }),
    );

    revalidatePath("/master/karyawan");
    await logActivity(
      "delete",
      "Employee",
      id,
      existing?.userId
        ? "Menghapus karyawan + nonaktifkan akun login"
        : "Menghapus karyawan",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteEmployee]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteDepartment(id: number) {
  try {
    await requirePermission("delete_departments");

    // Guard: cannot delete department with active employees
    const empCount = await prisma.employee.count({
      where: { departmentId: id, deletedAt: null },
    });
    if (empCount > 0) {
      throw new Error(`Departemen masih memiliki ${empCount} karyawan aktif`);
    }

    // Guard: `positions.department_id` is ON DELETE SET NULL, so a raw delete
    // silently detaches every position in the department. Refuse instead.
    const positionCount = await prisma.position.count({
      where: { departmentId: id },
    });
    if (positionCount > 0) {
      throw new Error(
        `Departemen masih memiliki ${positionCount} jabatan. Hapus atau pindahkan jabatan terlebih dahulu.`,
      );
    }

    await prisma.department.delete({ where: { id } });

    revalidatePath("/master/karyawan");
    await logActivity("delete", "Department", id, "Menghapus departemen");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteDepartment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deletePosition(id: number) {
  try {
    await requirePermission("delete_positions");

    // Guard: cannot delete a position with active employees. Mirrors
    // deleteDepartment's guard — Employee.positionId is nullable and the FK has
    // no explicit onDelete, so a raw delete would silently null the positionId
    // on every active employee holding this title, erasing their job-title
    // assignment with no warning. Same data-integrity rationale: refuse and let
    // the operator move/reassign employees first.
    const empCount = await prisma.employee.count({
      where: { positionId: id, deletedAt: null },
    });
    if (empCount > 0) {
      throw new Error(`Jabatan masih memiliki ${empCount} karyawan aktif`);
    }

    await prisma.position.delete({ where: { id } });

    revalidatePath("/master/karyawan");
    await logActivity("delete", "Position", id, "Menghapus jabatan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePosition]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteBank(id: number) {
  try {
    await requirePermission("delete_banks");

    // Guard: BankStatement.bankId menunjuk ke sini (plain Int?, tanpa FK di
    // skema) dan form mutasi bank memvalidasi bankId via bankStatementSchema —
    // hapus mentah meninggalkan bank_id yatim yang tak bisa direkonstruksi.
    const usedByStatements = await prisma.bankStatement.count({ where: { bankId: id } });
    if (usedByStatements > 0) {
      return {
        success: false,
        error: `Bank masih dipakai oleh ${usedByStatements} rekening koran. Hapus atau pindahkan dulu sebelum menghapus.`,
      };
    }

    await prisma.bank.delete({ where: { id } });

    revalidatePath("/master/bank");
    await logActivity("delete", "Bank", id, "Menghapus bank");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteBank]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteTax(id: number) {
  try {
    const user = await requirePermission("delete_taxes");

    // tax_group_taxes.tax_id has NO foreign key (only tax_group_id does), so a
    // hard delete would NOT raise P2003 and would leave the group row pointing at
    // a non-existent tax — the group then renders a blank/broken line. Guard on
    // memberships explicitly before attempting the delete.
    const usedInGroups = await prisma.taxGroupTax.count({ where: { taxId: id } });
    if (usedInGroups > 0) {
      return {
        success: false,
        error: `Pajak masih dipakai di ${usedInGroups} kelompok pajak. Hapus dari kelompok terlebih dahulu.`,
      };
    }

    // Tax has a deletedAt column; fall back to soft-delete on FK conflict
    // (e.g. when referenced by a TaxGroup line) to mirror the convention
    // used by deleteCustomer / deleteVendor / deleteItem.
    //
    // isActive is cleared alongside deletedAt (same as deleteCustomerCategory):
    // the "Kelompok Pajak" pickers load taxes with `where: { isActive: true }`,
    // so without this a soft-deleted tax stayed selectable in new tax groups.
    await hardDeleteOrSoftDelete(
      () => prisma.tax.delete({ where: { id } }),
      () =>
        prisma.tax.update({
          where: { id },
          data: {
        updatedBy: Number(user.id), deletedAt: new Date(), isActive: false },
        }),
    );

    revalidatePath("/master/pajak");
    await logActivity("delete", "Tax", id, "Menghapus pajak");
    redirect("/master/pajak");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteTax]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteTaxGroup(id: number) {
  try {
    await requirePermission("delete_taxes");

    // Keanggotaan dihapus EKSPLISIT dalam satu transaksi, bukan mengandalkan
    // ON DELETE CASCADE: jejaknya jelas dan atomik. Penolakan lama ("keluarkan
    // pajak dulu") membuat grup mustahil dihapus selamanya, karena buat/ubah
    // sama-sama mewajibkan ≥1 pajak — grup tak pernah bisa dikosongkan.
    const memberCount = await prisma.taxGroupTax.count({ where: { taxGroupId: id } });
    await prisma.$transaction([
      prisma.taxGroupTax.deleteMany({ where: { taxGroupId: id } }),
      prisma.taxGroup.delete({ where: { id } }),
    ]);

    revalidatePath("/master/kelompok-pajak");
    await logActivity(
      "delete",
      "TaxGroup",
      id,
      memberCount > 0
        ? `Menghapus kelompok pajak (${memberCount} pajak dikeluarkan dari kelompok)`
        : "Menghapus kelompok pajak",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteTaxGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}



export async function deleteBarcode(id: number) {
  try {
    await requirePermission("delete_barcodes");

    await prisma.barcode.delete({ where: { id } });

    revalidatePath("/master/barcode");
    await logActivity("delete", "Barcode", id, "Menghapus barcode");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteBarcode]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteItemCategory(id: number) {
  try {
    await requirePermission("delete_item_categories");

    // Guard: `items.category_id` and `item_categories.parent_id` are both
    // ON DELETE SET NULL, so a raw delete silently detaches every item in the
    // category AND promotes all sub-categories to roots — no FK error, just
    // quiet data loss. Refuse while either still references this category
    // (mirrors deleteCustomerCategory / deleteTax).
    const [childCount, itemCount] = await Promise.all([
      prisma.itemCategory.count({ where: { parentId: id } }),
      prisma.item.count({ where: { categoryId: id } }),
    ]);
    if (childCount > 0) {
      throw new Error(
        `Kategori masih memiliki ${childCount} sub-kategori. Hapus atau pindahkan sub-kategori terlebih dahulu.`,
      );
    }
    if (itemCount > 0) {
      throw new Error(
        `Kategori masih dipakai oleh ${itemCount} barang. Pindahkan barang ke kategori lain terlebih dahulu.`,
      );
    }

    await prisma.itemCategory.delete({ where: { id } });

    revalidatePath("/master/barang");
    await logActivity(
      "delete",
      "ItemCategory",
      id,
      "Menghapus kategori barang",
    );
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteItemCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ITEM GROUP ACTIONS ====================

export async function createItemGroup(formData: FormData) {
  try {
    const user = await requirePermission("create_item_groups");

    const name = requireString(formData.get("name"), "name");
    // Kode wajib unik; kalau dikosongkan, pakai nama supaya baris tetap bisa dibuat.
    const code = ((formData.get("code") as string) || "").trim() || name;

    const group = await prisma.itemGroup.create({
      data: {
        code,
        name,
        description: (formData.get("description") as string) || null,
        slug: await nextSlug("itemGroup", name),
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/grup-barang");
    await logActivity("create", "ItemGroup", group.id, "Membuat grup barang");
    return { success: true, id: group.id, slug: group.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createItemGroup]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Kode atau nama grup tersebut sudah dipakai." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateItemGroup(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_item_groups");

    const name = requireString(formData.get("name"), "name");
    const code = ((formData.get("code") as string) || "").trim() || name;

    await prisma.itemGroup.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        code,
        name,
        description: (formData.get("description") as string) || null,
        slug: await nextSlug("itemGroup", name, { excludeId: id }),
      },
    });

    revalidatePath("/master/grup-barang");
    await logActivity("update", "ItemGroup", id, "Memperbarui grup barang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateItemGroup]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Kode atau nama grup tersebut sudah dipakai." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteItemGroup(id: number) {
  try {
    await requirePermission("delete_item_groups");

    // `items.group_id` ON DELETE SET NULL, jadi menghapus grup tanpa penjaga akan
    // diam-diam melepas barang dari grupnya (kehilangan data tanpa error FK).
    const itemCount = await prisma.item.count({ where: { groupId: id } });
    if (itemCount > 0) {
      throw new Error(
        `Grup masih dipakai oleh ${itemCount} barang. Pindahkan barang ke grup lain terlebih dahulu.`,
      );
    }

    await prisma.itemGroup.delete({ where: { id } });

    revalidatePath("/master/grup-barang");
    await logActivity("delete", "ItemGroup", id, "Menghapus grup barang");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteItemGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAccount(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_accounts");

    const parsed = parseFormData(accountServerSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Account code is an accounting identifier; silently regenerating it when the
    // user clears the field would corrupt the audit trail and break references
    // to this account in historical journal entries. Read the current code from
    // the DB and preserve it if the form sent nothing usable.
    //
    // normalBalance (report classification) is preserved the same way when the
    // submitted form omits it — nulling it silently misclassifies the account in
    // the trial balance / P&L / balance sheet. Both fallbacks share one lookup.
    const submittedCode = v.code?.trim() || null;
    let code = submittedCode;
    let normalBalance: "DEBIT" | "CREDIT" | null = v.normalBalance ?? null;
    if (!submittedCode || normalBalance == null) {
      const current = await prisma.account.findUnique({
        where: { id },
        select: { code: true, normalBalance: true },
      });
      if (!current) throw new Error("Akun tidak ditemukan");
      if (!submittedCode) code = current.code;
      if (normalBalance == null) {
        normalBalance = (current.normalBalance as "DEBIT" | "CREDIT" | null) ?? null;
      }
    }
    // `code` is always set by this point (submitted, or read from the record).
    const finalCode = code as string;

    const account = await prisma.account.update({
      where: { id },
      data: {
        code: finalCode,
        name: v.name,
        slug: await nextSlug("account", v.name, { excludeId: id }),
        type: v.type,
        parentId: v.parentId ?? null,
        description: v.description ?? null,
        normalBalance,
      },
    });

    revalidatePath("/master/akun");
    await logActivity("update", "Account", account.id, "Memperbarui akun");
    return { success: true, id: account.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAccount]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BRAND ACTIONS ====================

export async function createBrand(formData: FormData) {
  try {
    const user = await requirePermission("create_brands");

    const rawNameBrand = (formData.get("name") as string | null)?.trim()
    if (rawNameBrand) {
      const existing = await prisma.brand.findFirst({ where: { name: rawNameBrand }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    // categoryIds is a comma-separated string of category IDs e.g. "1,3,5"
    const categoryIds = (formData.get("categoryIds") as string || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0)

    const brand = await prisma.brand.create({
      data: {
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("brand", requireString(formData.get("name"), "name")),
        description: (formData.get("description") as string) || null,
        categories: categoryIds.length > 0
          ? { connect: categoryIds.map((id) => ({ id })) }
          : undefined,
        createdBy: Number(user.id),
      },
    });

    revalidatePath("/master/merek");
    await logActivity("create", "Brand", brand.id, "Membuat merek");
    // Quick-add from another form must stay on its own page; only the
    // full-page create form navigates back to the list afterwards.
    if (formData.get("__quickAdd") === "1") return { success: true, id: brand.id, slug: brand.slug };
    redirect("/master/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBrand]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Merek dengan nama tersebut sudah ada." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateBrand(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_brands");

    const categoryIds = (formData.get("categoryIds") as string || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0)

    await prisma.brand.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        name: requireString(formData.get("name"), "name"),
        slug: await nextSlug("brand", requireString(formData.get("name"), "name"), { excludeId: id }),
        description: (formData.get("description") as string) || null,
        // `set` replaces all existing relations with the new list
        categories: { set: categoryIds.map((cid) => ({ id: cid })) },
      },
    });

    revalidatePath("/master/merek");
    await logActivity("update", "Brand", id, "Memperbarui merek");
    redirect("/master/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateBrand]", getErrorMessage(e) || e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Merek dengan nama tersebut sudah ada." };
    }
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteBrand(id: number) {
  try {
    await requirePermission("delete_brands");

    // Penghapusan DITOLAK bila masih dipakai. `Item.brandId` opsional (SET NULL
    // di DB), jadi tanpa penjagaan ini hapus merek diam-diam melepas barang dari
    // mereknya. Kolomnya memang ditulis createItem/updateItem, jadi hitungan hidup.
    const usedByItems = await prisma.item.count({ where: { brandId: id } });
    if (usedByItems > 0) {
      return {
        success: false,
        error: `Merek masih dipakai oleh ${usedByItems} barang. Pindahkan barang ke merek lain terlebih dahulu.`,
      };
    }

    await prisma.brand.delete({ where: { id } });

    revalidatePath("/master/merek");
    await logActivity("delete", "Brand", id, "Menghapus merek");
    redirect("/master/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteBrand]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== UNIT OF MEASURE (SATUAN) ACTIONS ====================

export async function createUom(formData: FormData) {
  try {
    await requirePermission("edit_units");

    const rawNameUom = String(formData.get("name") ?? "").trim()
    if (rawNameUom) {
      const existing = await prisma.unitOfMeasure.findFirst({ where: { name: rawNameUom }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    const parsed = parseFormData(uomServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { name, symbol, category } = parsed.data

    const uom = await prisma.unitOfMeasure.create({
      data: {
        name,
        slug: await nextSlug("unitOfMeasure", name),
        symbol,
        category,
        isActive: true,
      },
    });
    await logActivity("create", "UnitOfMeasure", uom.id, "Membuat satuan");
    revalidatePath("/master/satuan");
    return { success: true, id: uom.id, slug: uom.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createUom]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateUom(id: number, formData: FormData) {
  try {
    await requirePermission("edit_units");
    const parsed = parseFormData(uomServerSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { name, symbol, category } = parsed.data

    await prisma.unitOfMeasure.update({
      where: { id },
      data: {
        name,
        slug: await nextSlug("unitOfMeasure", name, { excludeId: id }),
        symbol,
        category,
      },
    });
    await logActivity("update", "UnitOfMeasure", id, "Memperbarui satuan");
    revalidatePath("/master/satuan");
    return { success: true, id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateUom]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteUom(id: number) {
  try {
    await requirePermission("edit_units");

    const uom = await prisma.unitOfMeasure.findUnique({ where: { id } });
    if (!uom) return { success: false, error: "Satuan tidak ditemukan" };

    // Referential safety: items store the unit as a free string (matched by
    // symbol/name) and other units may derive from this one via baseUnitId.
    // There is no FK, so a blind delete would orphan those references.
    const [usedByItems, derivedUnits] = await Promise.all([
      prisma.item.count({
        where: { OR: [{ unitOfMeasure: uom.symbol }, { unitOfMeasure: uom.name }] },
      }),
      prisma.unitOfMeasure.count({ where: { baseUnitId: id } }),
    ]);
    if (usedByItems > 0) {
      return {
        success: false,
        error: `Satuan dipakai oleh ${usedByItems} barang — tidak dapat dihapus`,
      };
    }
    if (derivedUnits > 0) {
      return {
        success: false,
        error: `Satuan menjadi basis ${derivedUnits} satuan lain — tidak dapat dihapus`,
      };
    }

    await prisma.unitOfMeasure.delete({ where: { id } });
    await logActivity("delete", "UnitOfMeasure", id, "Menghapus satuan");
    revalidatePath("/master/satuan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteUom]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Opsi kategori pelanggan untuk dialog quick-add (dipakai form Penawaran, Faktur
 * Penjualan, Retur Penjualan, dan Tiket). Dibaca saat dialog dibuka supaya daftarnya
 * tidak pernah kedaluwarsa dan form pemanggil tidak perlu menyiapkannya.
 */
export async function listCustomerCategoryOptions(): Promise<{ value: string; label: string }[]> {
  await requirePermission("view_customers");
  const rows = await prisma.customerCategory.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ value: String(row.id), label: row.name }));
}

export async function listCustomerDuplicateCandidates(): Promise<{
  success: boolean;
  error?: string;
  groups?: CustomerDuplicateGroup[];
}> {
  try {
    await requirePermission("view_customers");
    const groups = await loadCustomerDuplicateGroups();
    return { success: true, groups };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[listCustomerDuplicateCandidates]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createCustomerCategory(formData: FormData) {
  try {
    await requirePermission("create_customers");

    // upsert: return existing active category with same name
    const rawNameCC = (formData.get("name") as string | null)?.trim()
    if (rawNameCC) {
      const existing = await prisma.customerCategory.findFirst({ where: { name: rawNameCC, deletedAt: null }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const parsed = parseFormData(customerCategorySchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const category = await prisma.customerCategory.create({
      data: {
        name: v.name,
        slug: await nextSlug("customerCategory", v.name),
        downPaymentPercent: v.downPaymentPercent ?? 0,
        isActive: true,
      },
    });

    revalidatePath("/master/kategori-pelanggan");
    await logActivity("create", "CustomerCategory", category.id, "Membuat kategori pelanggan");
    return { success: true, id: category.id, slug: category.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createCustomerCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateCustomerCategory(id: number, formData: FormData) {
  try {
    await requirePermission("edit_customers");

    const parsed = parseFormData(customerCategorySchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    await prisma.customerCategory.update({
      where: { id },
      data: {
        name: v.name,
        slug: await nextSlug("customerCategory", v.name, { excludeId: id }),
        downPaymentPercent: v.downPaymentPercent ?? 0,
      },
    });

    revalidatePath("/master/kategori-pelanggan");
    await logActivity("update", "CustomerCategory", id, "Memperbarui kategori pelanggan");
    return { success: true, id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateCustomerCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteCustomerCategory(id: number) {
  try {
    const user = await requirePermission("delete_customers");

    await prisma.$transaction([
      prisma.customer.updateMany({
        where: { customerCategoryId: id },
        data: {
        updatedBy: Number(user.id), customerCategoryId: null },
      }),
      prisma.customerCategory.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      }),
    ]);

    revalidatePath("/master/kategori-pelanggan");
    await logActivity("delete", "CustomerCategory", id, "Menghapus kategori pelanggan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteCustomerCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ── F-2026-10-25-036-S: histori tarif komisi per kategori pelanggan ──
// Izin existing master kategori (BR-KT36-10, tanpa izin baru): tambah =
// create_customers, ubah/tutup masa/hapus = edit_customers. Penjaga murni
// (tolak tumpang tindih + baris sumber snapshot beku) di
// customer-commission-rate.service; cek rujukan snapshot dalam tx yang sama.

function parseCommissionRateForm(formData: FormData) {
  const customerCategoryId = Number(formData.get("customerCategoryId"))
  const commissionPercent = Number(formData.get("commissionPercent"))
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "")
  const effectiveToRaw = String(formData.get("effectiveTo") ?? "").trim()
  if (!Number.isInteger(customerCategoryId) || customerCategoryId <= 0) {
    return { error: "Kategori pelanggan wajib dipilih" } as const
  }
  if (!Number.isFinite(commissionPercent)) {
    return { error: "Persen komisi tidak valid" } as const
  }
  const effectiveFrom = wibDateToUtcMidnight(effectiveFromRaw)
  if (!effectiveFrom) return { error: "Tanggal mulai berlaku tarif tidak valid" } as const
  let effectiveTo: Date | null = null
  if (effectiveToRaw) {
    effectiveTo = wibDateToUtcMidnight(effectiveToRaw)
    if (!effectiveTo) return { error: "Tanggal berakhir masa tarif tidak valid" } as const
  }
  return { customerCategoryId, commissionPercent, effectiveFrom, effectiveTo } as const
}

async function loadCommissionRateRows(
  tx: Prisma.TransactionClient,
  customerCategoryId: number,
) {
  const rows = await tx.customerCommissionRate.findMany({
    where: { customerCategoryId },
    select: { id: true, customerCategoryId: true, commissionPercent: true, effectiveFrom: true, effectiveTo: true },
  })
  return rows.map((r) => ({ ...r, commissionPercent: Number(r.commissionPercent) }))
}

export async function createCustomerCommissionRate(formData: FormData) {
  try {
    const user = await requirePermission("create_customers")
    const parsed = parseCommissionRateForm(formData)
    if ("error" in parsed) return { success: false, error: parsed.error }

    const created = await prisma.$transaction(async (tx) => {
      const category = await tx.customerCategory.findFirst({
        where: { id: parsed.customerCategoryId, deletedAt: null },
        select: { id: true },
      })
      if (!category) return { error: "Kategori pelanggan tidak ditemukan" } as const
      const existing = await loadCommissionRateRows(tx, parsed.customerCategoryId)
      const guardError = validateCommissionRateWrite({
        existing,
        targetId: null,
        customerCategoryId: parsed.customerCategoryId,
        commissionPercent: parsed.commissionPercent,
        effectiveFrom: parsed.effectiveFrom,
        effectiveTo: parsed.effectiveTo,
        targetIsSnapshotSource: false,
      })
      if (guardError) return { error: guardError } as const
      const rate = await tx.customerCommissionRate.create({
        data: {
          customerCategoryId: parsed.customerCategoryId,
          commissionPercent: new Prisma.Decimal(parsed.commissionPercent.toFixed(2)),
          effectiveFrom: parsed.effectiveFrom,
          effectiveTo: parsed.effectiveTo,
          createdBy: Number(user.id),
        },
      })
      return { id: rate.id } as const
    })
    if ("error" in created) return { success: false, error: created.error }

    revalidatePath("/master/kategori-pelanggan")
    await logActivity("create", "CustomerCommissionRate", created.id, "Menambah tarif komisi kategori pelanggan")
    return { success: true, id: created.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createCustomerCommissionRate]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateCustomerCommissionRate(id: number, formData: FormData) {
  try {
    await requirePermission("edit_customers")
    const parsed = parseCommissionRateForm(formData)
    if ("error" in parsed) return { success: false, error: parsed.error }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.customerCommissionRate.findUnique({ where: { id } })
      if (!target) return { error: "Baris tarif komisi tidak ditemukan" } as const
      const existing = await loadCommissionRateRows(tx, target.customerCategoryId)
      const snapshotSource = await tx.salesInvoice.findFirst({
        where: { commissionRateId: id },
        select: { id: true },
      })
      const guardError = validateCommissionRateWrite({
        existing,
        targetId: id,
        customerCategoryId: target.customerCategoryId,
        commissionPercent: parsed.commissionPercent,
        effectiveFrom: parsed.effectiveFrom,
        effectiveTo: parsed.effectiveTo,
        targetIsSnapshotSource: snapshotSource !== null,
      })
      if (guardError) return { error: guardError } as const
      await tx.customerCommissionRate.update({
        where: { id },
        data: {
          commissionPercent: new Prisma.Decimal(parsed.commissionPercent.toFixed(2)),
          effectiveFrom: parsed.effectiveFrom,
          effectiveTo: parsed.effectiveTo,
        },
      })
      return { ok: true } as const
    })
    if ("error" in result) return { success: false, error: result.error }

    revalidatePath("/master/kategori-pelanggan")
    await logActivity("update", "CustomerCommissionRate", id, "Mengubah tarif komisi kategori pelanggan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateCustomerCommissionRate]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteCustomerCommissionRate(id: number) {
  try {
    await requirePermission("edit_customers")

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.customerCommissionRate.findUnique({ where: { id } })
      if (!target) return { error: "Baris tarif komisi tidak ditemukan" } as const
      const snapshotSource = await tx.salesInvoice.findFirst({
        where: { commissionRateId: id },
        select: { id: true },
      })
      const guardError = validateCommissionRateWrite({
        existing: [],
        targetId: id,
        customerCategoryId: target.customerCategoryId,
        commissionPercent: Number(target.commissionPercent),
        effectiveFrom: target.effectiveFrom,
        effectiveTo: target.effectiveTo,
        targetIsSnapshotSource: snapshotSource !== null,
        isDelete: true,
      })
      if (guardError) return { error: guardError } as const
      await tx.customerCommissionRate.delete({ where: { id } })
      return { ok: true } as const
    })
    if ("error" in result) return { success: false, error: result.error }

    revalidatePath("/master/kategori-pelanggan")
    await logActivity("delete", "CustomerCommissionRate", id, "Menghapus tarif komisi kategori pelanggan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteCustomerCommissionRate]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Daftar histori tarif komisi satu kategori (read-only, untuk layar master). */
export async function getCustomerCommissionRates(customerCategoryId: number) {
  await requirePermission("view_customers")
  const rows = await prisma.customerCommissionRate.findMany({
    where: { customerCategoryId },
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    select: {
      id: true,
      customerCategoryId: true,
      commissionPercent: true,
      effectiveFrom: true,
      effectiveTo: true,
      createdBy: true,
      createdAt: true,
    },
  })
  return rows.map((r) => ({ ...r, commissionPercent: Number(r.commissionPercent) }))
}
