"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { safeMultiply, safeAdd, safeSubtract } from "@/lib/utils/math";
import { slugify } from "@/lib/utils/slug";
import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumber, generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services/activity-log.service";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  createProductSchema,
  updateProductSchema,
  createProductionOrderSchema,
  updateProductionOrderSchema,
  parseMaterialRows,
  createBomRevisionSchema,
  updateBomRevisionSchema,
  parseRevisionRows,
} from "@/lib/validations/manufacturing.schemas";
import { computeProjectStatus } from "@/lib/services/project-status";
import { resolveEffectiveBom } from "@/lib/services/bom-revision.service";
import {
  assertWorkOrderQcCleared,
  assertProductionOrderQcCleared,
  assertWorkOrderVehicleIntakeRecorded,
} from "@/lib/services/qc.service";
import { recordProductionGenealogy } from "@/lib/services/production-genealogy.service";
import { createWarrantyCoveragesForWorkOrder } from "@/lib/services/warranty.service";
import { createInstalledPartsForWorkOrder } from "@/lib/services/installed-part.service";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import { resolveMaterialIssueScrapSnapshots } from "@/lib/hooks/material-issue.hook";
import {
  classifyScrapLine,
  validateScrapInput,
} from "@/lib/services/scrap-classification";
import { scrapReviewStatusAfterComplete } from "@/lib/services/scrap-physical";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import {
  assertJobCostMutable,
  productionOrderCloseBlocker,
  validateCancelReason,
  validateCloseReason,
  validateReopenReason,
} from "@/lib/services/job-closeout.service";
import {
  createReservationsForWorkOrderStartTx,
  expireOverdueReservationsTx,
  releaseActiveReservationsForWorkOrderTx,
  releaseStockReservationTx,
} from "@/lib/services/stock-reservation.service";
import { assertWarehouseAccess, getWarehouseScope } from "@/lib/auth/warehouse-scope";
import {
  evaluateWorkOrderOperationTransition,
  parseWorkOrderStageNames,
  shouldAutoCompleteWorkOrder,
} from "@/lib/reports/work-order-progress";
import { nextSlug } from "@/lib/utils/slug-db";
import { reservationExpiresAt } from "@/lib/reports/stock-reservation";
import { reservationReleaseNotice } from "@/lib/reports/stock-reservation-release";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { Prisma } from "@prisma/client";

// ==================== PRODUCT (BOM) ACTIONS ====================

// itemId baris BOM hanya tanpa relasi Prisma (ProductMaterial/BomRevisionMaterial
// itemId polos, tanpa FK DB): id fiktif lolos format-only -> baris yatim masuk
// hitungan biaya/PO. Cek eksistensi aktif pra-tulis satu titik untuk semua jalur.
async function bomRefsError(itemIds: number[], vehicleBrandId?: number | null, vehicleModelId?: number | null): Promise<string | null> {
  if (itemIds.length > 0) {
    const found = await prisma.item.findMany({
      where: { id: { in: itemIds }, isActive: true, deletedAt: null },
      select: { id: true },
    })
    const ok = new Set(found.map((i) => i.id))
    const missing = itemIds.find((id) => !ok.has(id))
    if (missing !== undefined) return `Item material #${missing} tidak ditemukan atau tidak aktif`
  }
  if (vehicleBrandId != null) {
    const brand = await prisma.vehicleBrand.findFirst({ where: { id: vehicleBrandId }, select: { id: true } })
    if (!brand) return "Merek kendaraan tidak ditemukan"
  }
  if (vehicleModelId != null) {
    const model = await prisma.vehicleModel.findFirst({ where: { id: vehicleModelId }, select: { vehicleBrandId: true } })
    if (!model) return "Model kendaraan tidak ditemukan"
    if (vehicleBrandId != null && model.vehicleBrandId !== vehicleBrandId) return "Model kendaraan bukan milik merek yang dipilih"
  }
  return null
}

/** Normalise a Json column that holds an array of strings into `string[]`. */
function toStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
}

/** Concatenate two lists, dropping duplicates while preserving order. */
function mergeUnique(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b].map((v) => v.trim()).filter((v) => v.length > 0)));
}

export async function createProduct(formData: FormData) {
  try {
    await requirePermission("create_products");

    const parsed = parseFormData(createProductSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.inventoryItemId) {
      const outputItem = await prisma.item.findFirst({
        where: { id: v.inventoryItemId, isActive: true, deletedAt: null, isProduct: true },
        select: { id: true },
      });
      if (!outputItem) return { success: false, error: "Pilih item persediaan aktif yang ditandai sebagai produk jadi." };
      if (await prisma.product.findFirst({ where: { inventoryItemId: v.inventoryItemId }, select: { id: true } })) {
        return { success: false, error: "Item persediaan tersebut sudah terhubung ke produk manufaktur lain." };
      }
    }

    let code = v.code ?? null;
    if (!code) {
      code = await generateDocumentNumber("PRD", "simple");
    }

    // Parse dynamic material rows. These are parallel arrays posted via
    // formData.append (captured by getAll — NOT by parseFormData's forEach, which
    // only keeps the last value per key). Validate them with parseMaterialRows
    // so a malformed row (negative qty, non-existent itemId, non-integer id) is
    // a hard error rather than crashing Prisma with a FK violation or, worse,
    // silently corrupting the BOM totals that propagate to production-order
    // material consumption.
    const itemIds = formData.getAll("materialItemId") as string[];
    const qtys = formData.getAll("materialQty") as string[];
    const materialsParsed = parseMaterialRows(itemIds, qtys);
    if (!materialsParsed.success) {
      return { success: false, error: materialsParsed.error };
    }
    const refsError = await bomRefsError(materialsParsed.data.map((m) => m.itemId), v.vehicleBrandId, v.vehicleModelId);
    if (refsError) return { success: false, error: refsError };

    const product = await prisma.product.create({
      data: {
        name: v.name,
        code,
        slug: await nextSlug("product", v.name),
        description: v.description ?? null,
        vehicleBrandId: v.vehicleBrandId,
        vehicleModelId: v.vehicleModelId,
        inventoryItemId: v.inventoryItemId ?? null,
        materials: {
          create: materialsParsed.data.map((m) => ({
            itemId: m.itemId,
            qty: m.qty,
          })),
        },
      },
    });

    await logActivity(
      "create",
      "Product",
      product.id,
      `Membuat produk #${product.id}`,
    );
    revalidatePath("/produksi/products");
    return { success: true, id: product.id, slug: product.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createProduct]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateProduct(id: number, formData: FormData) {
  try {
    await requirePermission("edit_products");

    const parsed = parseFormData(updateProductSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    if (v.inventoryItemId) {
      const outputItem = await prisma.item.findFirst({
        where: { id: v.inventoryItemId, isActive: true, deletedAt: null, isProduct: true },
        select: { id: true },
      });
      if (!outputItem) return { success: false, error: "Pilih item persediaan aktif yang ditandai sebagai produk jadi." };
      if (await prisma.product.findFirst({
        where: { inventoryItemId: v.inventoryItemId, id: { not: id } },
        select: { id: true },
      })) return { success: false, error: "Item persediaan tersebut sudah terhubung ke produk manufaktur lain." };
    }

    // Parse dynamic material rows (see createProduct for the rationale — the
    // legacy `Number(itemId) > 0 && Number(qty) > 0` filter let partially-malicious
    // payloads through). parseMaterialRows also de-dupes by itemId.
    const itemIds = formData.getAll("materialItemId") as string[];
    const qtys = formData.getAll("materialQty") as string[];
    const materialsParsed = parseMaterialRows(itemIds, qtys);
    if (!materialsParsed.success) {
      return { success: false, error: materialsParsed.error };
    }
    const refsError = await bomRefsError(materialsParsed.data.map((m) => m.itemId), v.vehicleBrandId, v.vehicleModelId);
    if (refsError) return { success: false, error: refsError };

    // Atomic BOM swap: deleteMany + createMany must commit together. Without
    // a $transaction, a transient error on the createMany leaves the product
    // with NO materials — production orders that auto-derive from the BOM
    // then run with an empty list (qty 0), silently producing empty
    // production orders.
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: v.name,
          slug: await nextSlug("product", v.name, { excludeId: id }),
          code: v.code ?? null,
          description: v.description ?? null,
          vehicleBrandId: v.vehicleBrandId,
          vehicleModelId: v.vehicleModelId,
          inventoryItemId: v.inventoryItemId ?? null,
          materials: {
            deleteMany: {},
            create: materialsParsed.data.map((m) => ({
              itemId: m.itemId,
              qty: m.qty,
            })),
          },
        },
      });
    });

    await logActivity("update", "Product", id, `Memperbarui produk #${id}`);
    revalidatePath("/produksi/products");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateProduct]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PRODUCTION ORDER ACTIONS ====================

/**
 * Recompute a product's standard cost from its BOM:
 *   standardCost = Σ (material.qty × item.standardCost)
 * Mirrors Laravel Product::calculateStandardCost. Persists onto Product.standardCost.
 * ProductMaterial has no item relation (itemId only), so item costs are fetched
 * in one batched query and mapped.
 */
export async function calculateStandardCost(productId: number) {
  try {
    await requirePermission("edit_products");

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { materials: true },
    });

    const itemIds = product.materials.map((m) => m.itemId);
    const items = itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, standardCost: true },
        })
      : [];
    const costMap = new Map(items.map((i) => [i.id, Number(i.standardCost)]));

    const total = product.materials.reduce(
      (sum, m) =>
        safeAdd(sum, safeMultiply(costMap.get(m.itemId) ?? 0, Number(m.qty), 2), 2),
      0,
    );

    await prisma.product.update({
      where: { id: productId },
      data: { standardCost: total },
    });

    // Persisted rollup is rendered by the product pages, so refresh them. Wired
    // to the product detail page's "Hitung Ulang HPP Standar" button; the
    // production-order flows still derive the rollup inline (see
    // createProductionOrder) to avoid this action's `edit_products` check.
    revalidatePath("/produksi/products");
    revalidatePath(`/produksi/products/${productId}`);

    return { success: true, standardCost: total };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[calculateStandardCost]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BOM REVISION ACTIONS ====================

/**
 * Create a new BOM revision for a product by snapshotting its current working
 * BOM (`Product.materials`). The revision starts as `draft` and its lines can
 * be edited until it is released. revisionNo is the next integer for the
 * product. This does not touch the working BOM or any released revision.
 */
export async function createBomRevision(formData: FormData) {
  try {
    const user = await requirePermission("manage_bom_revisions");

    const parsed = parseFormData(createBomRevisionSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      include: { materials: true },
    });

    const revision = await prisma.$transaction(async (tx) => {
      // Serialize concurrent creates for the same product so two parallel
      // calls cannot read the same latest revisionNo and collide on the
      // (productId, revisionNo) unique constraint.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId} FOR UPDATE`;
      const latest = await tx.bomRevision.findFirst({
        where: { productId: v.productId },
        orderBy: { revisionNo: "desc" },
        select: { revisionNo: true },
      });
      const nextNo = (latest?.revisionNo ?? 0) + 1;

      return tx.bomRevision.create({
        data: {
          productId: v.productId,
          revisionNo: nextNo,
          slug: await nextSlug("bomRevision", String(nextNo)),
          status: "draft",
          effectiveDate: v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : new Date(),
          notes: v.notes ?? null,
          createdBy: Number(user.id),
          materials: {
            create: product.materials.map((m) => ({ itemId: m.itemId, qty: m.qty })),
          },
        },
      });
    });

    await logActivity(
      "create",
      "BomRevision",
      revision.id,
      `Membuat revisi BOM #${revision.revisionNo} untuk produk #${v.productId}`,
    );
    revalidatePath("/produksi/bom-revisi");
    revalidatePath(`/produksi/products/${v.productId}`);
    return { success: true, id: revision.id, slug: revision.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBomRevision]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Edit a DRAFT or REJECTED revision: replace its lines and/or metadata. A
 * pending/approved/released (or superseded) revision is immutable — editing
 * it must go through a new revision.
 */
export async function updateBomRevision(id: number, formData: FormData) {
  try {
    await requirePermission("manage_bom_revisions");

    const parsed = parseFormData(updateBomRevisionSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const itemIds = formData.getAll("revisionItemId") as string[];
    const qtys = formData.getAll("revisionQty") as string[];
    const scrapPercents = formData.getAll("revisionScrapPercent") as string[];
    const linesParsed = parseRevisionRows(itemIds, qtys, scrapPercents);
    if (!linesParsed.success) return { success: false, error: linesParsed.error };
    const refsError = await bomRefsError(linesParsed.data.map((m) => m.itemId));
    if (refsError) return { success: false, error: refsError };

    const existing = await prisma.bomRevision.findUnique({
      where: { id },
      select: { id: true, status: true, productId: true },
    });
    if (!existing) return { success: false, error: "Revisi BOM tidak ditemukan" };
    if (existing.status !== "draft" && existing.status !== "rejected") {
      return {
        success: false,
        error: `Revisi berstatus '${existing.status}' tidak dapat diubah; buat revisi baru.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.bomRevision.update({
        where: { id },
        data: {
          effectiveDate: v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : undefined,
          notes: v.notes ?? null,
          materials: {
            deleteMany: {},
            create: linesParsed.data.map((m) => ({ itemId: m.itemId, qty: m.qty, scrapPercent: m.scrapPercent })),
          },
        },
      });
    });

    await logActivity("update", "BomRevision", id, `Memperbarui revisi BOM #${id}`);
    revalidatePath("/produksi/bom-revisi");
    revalidatePath(`/produksi/products/${existing.productId}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateBomRevision]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

type BomTransitionResult = { success: boolean; error?: string }

/**
 * Shared atomic state-guarded BOM revision transition (ACC-15901).
 * `guard` runs after load, before the claim (e.g. SoD); claim lost → `claimError`.
 */
async function transitionBomRevision(opts: {
  id: number
  userId: number
  from: string[]
  data: (userId: number) => Record<string, unknown>
  claimError: string
  activity: string
  guard?: (revision: { createdBy: number | null }, userId: number) => string | null
}): Promise<BomTransitionResult> {
  try {
    const revision = await prisma.bomRevision.findUnique({
      where: { id: opts.id },
      select: { id: true, productId: true, revisionNo: true, createdBy: true },
    })
    if (!revision) return { success: false, error: "Revisi BOM tidak ditemukan" }
    const guardError = opts.guard?.(revision, opts.userId)
    if (guardError) return { success: false, error: guardError }

    const claimed = await prisma.bomRevision.updateMany({
      where: { id: opts.id, status: { in: opts.from } },
      data: opts.data(opts.userId),
    })
    if (claimed.count === 0) return { success: false, error: opts.claimError }

    await logActivity(opts.activity, "BomRevision", opts.id, `Revisi BOM #${revision.revisionNo}`)
    revalidatePath("/produksi/bom-revisi")
    revalidatePath(`/produksi/products/${revision.productId}`)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[transitionBomRevision]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

const sodGuard = (verb: string) => (revision: { createdBy: number | null }, userId: number) =>
  revision.createdBy != null && revision.createdBy === userId
    ? `Pembuat revisi tidak dapat ${verb} revisinya sendiri.`
    : null

/**
 * Submit a draft/rejected revision for approval: → pending_approval
 * (Accurate ACC-15901). Resubmitting clears the previous rejection audit so
 * the UI never shows stale rejected state.
 */
export async function submitBomRevisionForApproval(id: number) {
  const user = await requirePermission("manage_bom_revisions")
  return transitionBomRevision({
    id,
    userId: Number(user.id),
    from: ["draft", "rejected"],
    data: (userId) => ({
      status: "pending_approval",
      submittedAt: new Date(),
      submittedBy: userId,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
    }),
    claimError: "Hanya revisi draft/ditolak yang dapat diajukan untuk persetujuan.",
    activity: "submit",
  })
}

/**
 * Approve a pending revision: pending_approval → approved. Approver must hold
 * `approve_bom_revisions` and must not be the revision creator (SoD).
 */
export async function approveBomRevision(id: number) {
  const user = await requirePermission("approve_bom_revisions")
  return transitionBomRevision({
    id,
    userId: Number(user.id),
    from: ["pending_approval"],
    data: (userId) => ({ status: "approved", approvedAt: new Date(), approvedBy: userId }),
    claimError: "Hanya revisi menunggu persetujuan yang dapat disetujui.",
    activity: "approve",
    guard: sodGuard("menyetujui"),
  })
}

/**
 * Reject a pending revision: pending_approval → rejected, reason wajib.
 * Creator may then edit and resubmit. SoD sama seperti approve.
 */
export async function rejectBomRevision(id: number, reason: string) {
  const trimmed = reason?.trim()
  if (!trimmed) return { success: false, error: "Alasan penolakan wajib diisi." }
  const user = await requirePermission("approve_bom_revisions")
  return transitionBomRevision({
    id,
    userId: Number(user.id),
    from: ["pending_approval"],
    data: (userId) => ({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: trimmed,
    }),
    claimError: "Hanya revisi menunggu persetujuan yang dapat ditolak.",
    activity: "reject",
    guard: sodGuard("menolak"),
  })
}

/**
 * Release an APPROVED revision: approved → released (Accurate ACC-15901 —
 * draft tidak bisa langsung dirilis). The previously released revision for
 * the same product is marked `superseded` in the same transaction so at most
 * one revision is ever `released` at a time. Releasing an empty revision is
 * rejected — an order later pinned to it would consume nothing.
 */
export async function releaseBomRevision(id: number) {
  try {
    const user = await requirePermission("manage_bom_revisions");

    const revision = await prisma.bomRevision.findUnique({
      where: { id },
      include: { materials: true },
    });
    if (!revision) return { success: false, error: "Revisi BOM tidak ditemukan" };
    if (revision.materials.length === 0) {
      return { success: false, error: "Revisi BOM tidak boleh kosong sebelum dirilis." };
    }

    // Claim + supersede atomically: the draft→released claim and the
    // supersede of the previously released revision run in ONE transaction so
    // a crash between them can never leave zero or two released revisions.
    const releaseResult = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bomRevision.updateMany({
        where: { id, status: "approved" },
        data: { status: "released", releasedAt: new Date(), releasedBy: Number(user.id) },
      });
      if (claimed.count === 0) {
        return { success: false as const, error: "Hanya revisi berstatus disetujui yang dapat dirilis." };
      }

      // Supersede any other released revision for the same product.
      await tx.bomRevision.updateMany({
        where: { productId: revision.productId, status: "released", id: { not: id } },
        data: { status: "superseded" },
      });
      return { success: true as const };
    });
    if (!releaseResult.success) {
      return { success: false, error: releaseResult.error };
    }

    await logActivity(
      "release",
      "BomRevision",
      id,
      `Merilis revisi BOM #${revision.revisionNo} (produk #${revision.productId})`,
    );
    revalidatePath("/produksi/bom-revisi");
    revalidatePath(`/produksi/products/${revision.productId}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[releaseBomRevision]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Delete a DRAFT revision only. Released/superseded revisions are historical
 * records that orders may point at — they must not be deleted, so this rejects
 * anything not in `draft`. Also refuses when a production order already pins it.
 */
export async function deleteBomRevision(id: number) {
  try {
    await requirePermission("manage_bom_revisions");

    const revision = await prisma.bomRevision.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        productId: true,
        _count: { select: { productionOrders: true, workOrders: true, fitmentRules: true } },
      },
    });
    if (!revision) return { success: false, error: "Revisi BOM tidak ditemukan" };
    if (revision.status !== "draft") {
      return { success: false, error: "Hanya revisi draft yang dapat dihapus." };
    }
    // VehicleFitmentRule.bomRevisionId opsional SetNull: tanpa hitungan ini
    // hapus draft diam-diam melepas aturan kompatibilitas dari revisi BOM-nya.
    if (revision._count.productionOrders > 0 || revision._count.workOrders > 0 || revision._count.fitmentRules > 0) {
      return {
        success: false,
        error: "Revisi BOM sudah dipakai oleh perintah kerja/produksi atau aturan kompatibilitas kendaraan dan tidak dapat dihapus.",
      };
    }

    await prisma.bomRevision.delete({ where: { id } });
    await logActivity("delete", "BomRevision", id, `Menghapus revisi BOM #${id}`);
    revalidatePath("/produksi/bom-revisi");
    revalidatePath(`/produksi/products/${revision.productId}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteBomRevision]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Resolve a per-item standard cost for production: prefer item.standardCost,
 * fall back to purchasePrice (mirrors Laravel issueMaterial cost resolution).
 */
function resolveItemCost(item: { standardCost: unknown; purchasePrice: unknown }): number {
  const std = Number(item.standardCost);
  return std > 0 ? std : Number(item.purchasePrice);
}

export async function createProductionOrder(formData: FormData) {
  try {
    const user = await requirePermission("create_production_orders");

    const parsed = parseFormData(createProductionOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("MO");

    // Dokumen sumber: FK `ProductionOrder.workOrderId` ada di skema tetapi tak
    // pernah diisi karena form-nya tak punya input WO — akibatnya backlink
    // `workOrder.productionOrders` selalu kosong dan laporan Job Order tak pernah
    // menghitung perintah produksi. Nilainya di sini divalidasi ke baris nyata
    // (bukan hanya `Number()`), supaya WO salah/typo ditolak dengan pesan yang
    // berguna alih-alih galat FK.
    const workOrder = v.workOrderId
      ? await prisma.workOrder.findUnique({
          where: { id: v.workOrderId },
          select: { id: true, documentNo: true, bomRevisionId: true },
        })
      : null;
    if (v.workOrderId && !workOrder) {
      return { success: false, error: `Perintah Kerja #${v.workOrderId} tidak ditemukan.` };
    }

    // Snapshot the BOM in force right now. Prefer the latest *released* revision
    // (frozen lines) and fall back to the working BOM for products that have no
    // released revision yet. Pinning bomRevisionId means later edits to the
    // master BOM cannot change the basis of this order (PRD FAB-02).
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      select: { id: true, standardCost: true },
    });
    const effectiveBom = await resolveEffectiveBom(v.productId);
    const bomLines = effectiveBom.lines;

    // Per-item standard cost for each BOM line (stamped on the order material).
    const bomItemIds = bomLines.map((m) => m.itemId);
    const bomItems = bomItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: bomItemIds } },
          select: { id: true, standardCost: true },
        })
      : [];
    const bomCostMap = new Map(bomItems.map((i) => [i.id, Number(i.standardCost)]));

    // Product standard cost: use the stored rollup, but if it was never computed
    // (<= 0) derive it INLINE from the BOM here. Computing inline (rather than
    // calling calculateStandardCost) avoids its nested requirePermission("edit_products")
    // check — a user holding only create_production_orders would otherwise have
    // that throw silently swallowed, leaving totalStandardCost = 0 and a bogus
    // full-actual variance at completion.
    let productStdCost = Number(product.standardCost);
    if (productStdCost <= 0 && bomLines.length > 0) {
      productStdCost = bomLines.reduce(
        (sum, m) => safeAdd(sum, safeMultiply(bomCostMap.get(m.itemId) ?? 0, m.qtyPerUnit, 2), 2),
        0,
      );
    }

    const productionOrder = await prisma.productionOrder.create({
      data: {
        documentNo,
        slug: await nextSlug("productionOrder", documentNo),
        productId: v.productId,
        bomRevisionId: effectiveBom.revisionId,
        workOrderId: workOrder?.id ?? null,
        qty: v.qty,
        startDate: v.startDate ? wibDateToUtcMidnight(v.startDate) : null,
        endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
        notes: v.notes ?? null,
        status: "draft",
        // total_standard_cost = product standard cost × order qty
        totalStandardCost: safeMultiply(productStdCost, v.qty, 2),
        createdBy: Number(user.id),
        materials: {
          create: bomLines.map((m) => ({
            itemId: m.itemId,
            qty: safeMultiply(m.qtyPerUnit, v.qty, 4),
            standardCost: bomCostMap.get(m.itemId) ?? 0,
            // F-008: beku allowance revisi ter-pin saat PO dibuat (null =
            // belum kalibrasi). Tanpa kolom ini jalur PO tak pernah bisa
            // klasifikasi normal — complete dilarang baca BOM hidup.
            scrapPercentSnapshot: m.scrapPercent ?? null,
          })),
        },
      },
    });

    await logActivity(
      "create",
      "ProductionOrder",
      productionOrder.id,
      `Membuat perintah produksi #${productionOrder.id}`,
    );

    // WO ← BOM: `WorkOrder.bomRevisionId` tak pernah diisi jalur mana pun (form WO
    // tidak punya pilihan BOM) padahal detail WO sudah menampilkan kolomnya.
    // Revisi BOM yang baru di-snapshot order ini dipinjamkan ke WO-nya — hanya
    // bila WO belum punya revisi, supaya pilihan yang sudah ada tidak ditimpa.
    if (workOrder && workOrder.bomRevisionId == null && effectiveBom.revisionId != null) {
      await prisma.workOrder.updateMany({
        where: { id: workOrder.id, bomRevisionId: null },
        data: { bomRevisionId: effectiveBom.revisionId },
      });
      revalidatePath("/produksi/perintah-kerja");
    }

    revalidatePath("/produksi/production-orders");
    return { success: true, id: productionOrder.id, slug: productionOrder.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Confirm a draft production order (draft → confirmed). Required before
 * material can be issued (mirrors Laravel CONFIRMED gate on issueMaterial).
 */
export async function confirmProductionOrder(id: number) {
  try {
    await requirePermission("edit_production_orders");
    const claim = await prisma.productionOrder.updateMany({
      where: { id, status: "draft" },
      data: { status: "confirmed" },
    });
    if (claim.count === 0) {
      const cur = await prisma.productionOrder.findUnique({
        where: { id },
        select: { status: true },
      });
      throw new Error(
        cur
          ? `Perintah produksi sudah berstatus '${cur.status}', hanya draft yang bisa dikonfirmasi`
          : "Perintah produksi tidak ditemukan",
      );
    }
    await logActivity("confirm", "ProductionOrder", id, `Konfirmasi perintah produksi #${id}`);
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[confirmProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Start a confirmed production order (confirmed → in_progress) WITHOUT issuing
 * material.
 *
 * Gate buntu yang ditutup di sini: `in_progress` dulu hanya bisa dicapai lewat
 * `issueMaterial`, dan daftar item issue diambil dari material BOM. Order tanpa
 * material BOM (jasa/impor kosong) karena itu tersangkut permanen di `confirmed`
 * — tak bisa di-issue (tak ada item) sekaligus tak bisa diselesaikan
 * (`completeProductionOrder` hanya menerima `in_progress`). Aksi ini memberi
 * jalan maju yang eksplisit tanpa memaksa pengeluaran material.
 */
export async function startProductionOrder(id: number) {
  try {
    await requirePermission("edit_production_orders");
    // Claim atomik: hanya satu request yang boleh memindahkan confirmed → in_progress.
    const claim = await prisma.productionOrder.updateMany({
      where: { id, status: "confirmed" },
      data: { status: "in_progress" },
    });
    if (claim.count === 0) {
      const cur = await prisma.productionOrder.findUnique({
        where: { id },
        select: { status: true },
      });
      throw new Error(
        cur
          ? `Perintah produksi berstatus '${cur.status}', hanya 'confirmed' yang bisa dimulai`
          : "Perintah produksi tidak ditemukan",
      );
    }
    await logActivity("start", "ProductionOrder", id, `Memulai perintah produksi #${id}`);
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[startProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Issue material against a confirmed/in-progress production order. Posts FIFO
 * stock out and a WIP/inventory journal in the same transaction, then rolls up
 * actual material cost on the order.
 */
export async function issueMaterial(
  productionOrderId: number,
  items: {
    itemId: number
    qty: number
    /** F-008: scrap kejadian ini per baris (opsional — nol scrap sah). */
    scrapQty?: number
    scrapReasonCode?: string | null
    scrapNote?: string | null
  }[],
) {
  try {
    const user = await requirePermission("edit_production_orders");
    if (!items?.length) throw new Error("Tidak ada material yang dikeluarkan");

    const requested = new Map<number, number>();
    const scrapInputs = new Map<
      number,
      { scrapQty: number; scrapReasonCode: string | null; scrapNote: string | null }
    >();
    for (const row of items) {
      const itemId = Number(row.itemId);
      const qty = Number(row.qty);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Item dan kuantitas material harus valid dan lebih dari 0");
      }
      // F-008: validasi scrap kejadian ini SEBELUM stok bergerak. Dua baris
      // item sama dengan scrap berbeda ditolak — gabungan per item tidak
      // bisa diputuskan tanpa menebak.
      const sr = scrapInputs.get(itemId);
      const rowScrap = {
        scrapQty: Number(row.scrapQty ?? 0),
        scrapReasonCode: row.scrapReasonCode ?? null,
        scrapNote: row.scrapNote ?? null,
      };
      if (sr) {
        const same =
          sr.scrapQty === rowScrap.scrapQty &&
          sr.scrapReasonCode === rowScrap.scrapReasonCode &&
          sr.scrapNote === rowScrap.scrapNote;
        if (!same) {
          throw new Error(
            `Baris duplikat item #${itemId} dengan scrap berbeda — satukan menjadi satu baris per item.`,
          );
        }
      } else {
        scrapInputs.set(itemId, rowScrap);
      }
      requested.set(itemId, safeAdd(requested.get(itemId) ?? 0, qty, 2));
    }
    for (const [itemId, qty] of requested) {
      const s = scrapInputs.get(itemId)!;
      const err = validateScrapInput({
        issueQty: qty,
        scrapQty: s.scrapQty,
        scrapReasonCode: s.scrapReasonCode,
        scrapNote: s.scrapNote,
      });
      if (err) throw new Error(`Item #${itemId}: ${err}`);
    }
    const warehouseScope = await getWarehouseScope(user);
    if (warehouseScope.kind === "none") throw new Error("Anda tidak memiliki akses ke gudang mana pun.");

    await prisma.$transaction(async (tx) => {
      // Lock the order row so concurrent issueMaterial calls serialise — without
      // this, two calls read the same totalActualCost and the later write
      // overwrites the earlier (lost update), dropping a batch's cost.
      await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`;
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id: productionOrderId },
        select: { id: true, documentNo: true, status: true, totalActualCost: true, workOrderId: true, startDate: true, createdAt: true },
      });
      if (order.status !== "confirmed" && order.status !== "in_progress") {
        throw new Error(
          `Material hanya bisa dikeluarkan untuk perintah berstatus 'confirmed' atau 'in_progress' (saat ini '${order.status}')`,
        );
      }
      // F-009-V: WO induk closed membekukan issueMaterial walau PO masih live.
      await assertJobCostMutable({ productionOrderId }, "dikeluarkan", tx);
      if (order.status === "confirmed") {
        await tx.productionOrder.update({
          where: { id: productionOrderId },
          data: { status: "in_progress" },
        });
      }

      // P1-4: guard silang antar-jalur konsumsi. PO tertaut WO yang sudah
      // dikonsumsi via Material Issue resmi (completed/processing) tidak
      // boleh dikonsumsi lagi via issueMaterial — material sama keluar dua
      // kali tanpa guard ini. Pilih satu jalur per WO.
      if (order.workOrderId != null) {
        const consumedViaMI = await tx.materialIssue.count({
          where: {
            workOrderId: order.workOrderId,
            status: { in: ["processing", "completed"] },
          },
        });
        if (consumedViaMI > 0) {
          throw new Error(
            `WO ${order.documentNo} sudah dikonsumsi via Pengeluaran Material — gunakan jalur itu, bukan pengeluaran PO langsung.`,
          );
        }
      }

      const itemIds = [...requested.keys()].sort((a, b) => a - b);
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(itemIds)}) FOR UPDATE`;
      const itemRows = await tx.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, standardCost: true, purchasePrice: true, defaultWarehouseId: true },
      });
      const itemMap = new Map(itemRows.map((i) => [i.id, i]));

      const fallbackWarehouseWhere: Prisma.WarehouseWhereInput = {
        isActive: true,
        deletedAt: null,
        ...(warehouseScope.kind === "assigned"
          ? { id: { in: warehouseScope.warehouseIds } }
          : {}),
      };
      const fallbackWarehouse = await tx.warehouse.findFirst({
        where: fallbackWarehouseWhere,
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (!fallbackWarehouse) throw new Error("Tidak ada gudang aktif yang dapat digunakan.");

      const defaultWarehouseIds = itemRows
        .map((item) => item.defaultWarehouseId)
        .filter((id): id is number => id !== null);
      const validDefaultWarehouses = defaultWarehouseIds.length
        ? await tx.warehouse.findMany({
            where: { id: { in: defaultWarehouseIds }, isActive: true, deletedAt: null },
            select: { id: true },
          })
        : [];
      const validWarehouseIds = new Set(validDefaultWarehouses.map((warehouse) => warehouse.id));

      let runningActual = 0;
      let runningAbnormalValue = 0;
      const movementLines: { itemId: number; qty: number; cost: number; warehouseId: number }[] = [];
      for (const [itemId, qty] of requested) {
        const itm = itemMap.get(itemId);
        if (!itm) throw new Error(`Item #${itemId} tidak ditemukan`);
        const warehouseId = itm.defaultWarehouseId && validWarehouseIds.has(itm.defaultWarehouseId)
          ? itm.defaultWarehouseId
          : fallbackWarehouse.id;
        assertWarehouseAccess(warehouseScope, warehouseId);
        if (itm.defaultWarehouseId && !validWarehouseIds.has(itm.defaultWarehouseId)) {
          throw new Error(`Gudang default item #${itemId} tidak aktif.`);
        }
        const { consumedCost, consumedSerials, consumedBatches } = await consumeFifoLayers(tx, {
          itemId,
          warehouseId,
          qty,
          label: `perintah produksi ${order.documentNo}`,
          // F-2026-10-21-011: issueMaterial PO juga jalur keluar — lot
          // kedaluwarsa ditolak per tanggal terbit order (startDate bila ada).
          documentDate: order.startDate ?? order.createdAt ?? new Date(),
        });
        const unitCost = qty > 0 ? consumedCost / qty : resolveItemCost(itm);
        const lineCost = safeMultiply(qty, unitCost, 2);
        movementLines.push({ itemId, qty, cost: unitCost, warehouseId });

        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${itemId}`;

        // Lot/serial attribution of what this issue actually consumed, merged into
        // the material line so the production genealogy can trace source lots
        // (PRD line 369 / REP-13).
        const newSerials = (consumedSerials ?? []).filter((s) => String(s).trim().length > 0);
        const newBatchNumbers = Array.from(
          new Set((consumedBatches ?? []).map((b) => b.batchNumber).filter((b) => String(b).trim().length > 0)),
        );

        const existing = await tx.productionOrderMaterial.findFirst({
          where: { productionOrderId, itemId },
          select: {
            id: true,
            actualQty: true,
            actualCost: true,
            serialNumbers: true,
            batchNumbers: true,
            qty: true,
            scrapPercentSnapshot: true,
            scrapQty: true,
            scrapNormalQtySnapshot: true,
            scrapAbnormalQtySnapshot: true,
            scrapNormalValueSnapshot: true,
            scrapAbnormalValueSnapshot: true,
            scrapReviewStatus: true,
          },
        });
        // F-008: klasifikasi scrap kejadian ini dari cost FIFO kejadian
        // ini (bukan snapshot lama). Allowance dari snapshot PO beku;
        // baris unplanned qty=0 → seluruh scrap abnormal. Akumulasi
        // dibekukan per kejadian — PO yang sama terbit berkali-kali.
        const scrapIn = scrapInputs.get(itemId)!;
        const classification = classifyScrapLine({
          issueQty: qty,
          plannedQty: existing ? Number(existing.qty) : 0,
          scrapQty: scrapIn.scrapQty,
          scrapReasonCode: scrapIn.scrapReasonCode,
          scrapNote: scrapIn.scrapNote,
          scrapPercentSnapshot:
            existing?.scrapPercentSnapshot != null ? Number(existing.scrapPercentSnapshot) : null,
          unitCost,
        });
        const cumulativeScrap =
          scrapIn.scrapQty > 0
            ? {
                scrapQty: safeAdd(Number(existing?.scrapQty ?? 0), scrapIn.scrapQty, 2),
                scrapReasonCode: scrapIn.scrapReasonCode,
                scrapNote: scrapIn.scrapNote,
                scrapClassifiedAt: new Date(),
                scrapNormalQtySnapshot: safeAdd(Number(existing?.scrapNormalQtySnapshot ?? 0), classification.normalQty, 2),
                scrapAbnormalQtySnapshot: safeAdd(Number(existing?.scrapAbnormalQtySnapshot ?? 0), classification.abnormalQty, 2),
                scrapUnitCostSnapshot: unitCost,
                scrapNormalValueSnapshot: safeAdd(Number(existing?.scrapNormalValueSnapshot ?? 0), classification.normalValue, 2),
                scrapAbnormalValueSnapshot: safeAdd(Number(existing?.scrapAbnormalValueSnapshot ?? 0), classification.abnormalValue, 2),
                // F-098-S: abnormal kumulatif > 0 masuk antrean; tinjau selesai tidak dibuka ulang oleh issue berikut.
                scrapReviewStatus: existing?.scrapReviewStatus ?? scrapReviewStatusAfterComplete(
                  safeAdd(Number(existing?.scrapAbnormalQtySnapshot ?? 0), classification.abnormalQty, 2),
                ),
              }
            : {};
        if (existing) {
          const prevSerials = toStringArray(existing.serialNumbers);
          const prevBatches = toStringArray(existing.batchNumbers);
          await tx.productionOrderMaterial.update({
            where: { id: existing.id },
            data: {
              actualQty: safeAdd(Number(existing.actualQty ?? 0), qty, 2),
              actualCost: safeAdd(Number(existing.actualCost), lineCost, 2),
              serialNumbers: mergeUnique(prevSerials, newSerials),
              batchNumbers: mergeUnique(prevBatches, newBatchNumbers),
              ...cumulativeScrap,
            },
          });
        } else {
          // Unplanned material (not in BOM): bom qty = 0.
          await tx.productionOrderMaterial.create({
            data: {
              productionOrderId,
              itemId,
              qty: 0,
              standardCost: resolveItemCost(itm),
              actualQty: qty,
              actualCost: lineCost,
              serialNumbers: newSerials.length ? newSerials : undefined,
              batchNumbers: newBatchNumbers.length ? newBatchNumbers : undefined,
              ...cumulativeScrap,
            },
          });
        }
        runningAbnormalValue = safeAdd(runningAbnormalValue, classification.abnormalValue, 2);
        runningActual = safeAdd(runningActual, lineCost, 2);
      }

      await assertPeriodOpen(new Date(), tx);
      const stockMoveDocumentNos = await generateDocumentNumberBatch("SM", movementLines.length);
      const postedMoves = [];
      for (let index = 0; index < movementLines.length; index++) {
        const line = movementLines[index];
        const move = await tx.stockMove.create({
          data: {
            documentNo: stockMoveDocumentNos[index],
            slug: slugify(stockMoveDocumentNos[index]),
            itemId: line.itemId,
            warehouseId: line.warehouseId,
            qty: line.qty,
            cost: line.cost,
            impact: "OUT",
            status: "posted",
            moveType: "production_issue",
            referenceType: "ProductionOrder",
            referenceId: productionOrderId,
            notes: `Pemakaian material perintah produksi ${order.documentNo}`,
            createdBy: Number(user.id),
          },
          select: { id: true },
        });
        postedMoves.push(move);
      }
      if (postedMoves[0]) {
        await stockJournalService.onProductionOrderMaterialIssue(
          tx,
          movementLines,
          order.documentNo,
          postedMoves[0].id,
          Number(user.id),
        );
        // F-008 P2(b): jurnal abnormal kejadian ini DALAM tx yang sama —
        // fail-closed saat flag ON (throw = rollback total). Flag OFF:
        // no-op, nilai abnormal hidup di snapshot + laporan.
        await stockJournalService.onProductionOrderAbnormalScrap(
          tx,
          runningAbnormalValue,
          order.documentNo,
          postedMoves[0].id,
          Number(user.id),
        );
      }

      await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: {
          totalActualCost: safeAdd(Number(order.totalActualCost), runningActual, 2),
        },
      });
    });

    await logActivity(
      "issue_material",
      "ProductionOrder",
      productionOrderId,
      `Pengeluaran material perintah produksi #${productionOrderId}`,
    );
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[issueMaterial]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Complete production, receive the finished item into inventory, and settle WIP.
 *
 * Supports partial completion (PRD FAB-09): pass `qtyToComplete` to release only
 * part of the order's output. The released units carry their equivalent share of
 * cost (unitCost = totalActualCost / order.qty); the remainder stays as WIP on the
 * order (still `in_progress`) until the full quantity is released. Omitting the
 * argument completes the whole remaining quantity.
 */
export async function completeProductionOrder(
  id: number,
  serialNumbers: string[] = [],
  qtyToComplete?: number,
) {
  try {
    const user = await requirePermission("edit_production_orders");
    const warehouseScope = await getWarehouseScope(user);
    if (warehouseScope.kind === "none") throw new Error("Anda tidak memiliki akses ke gudang mana pun.");

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          documentNo: true,
          status: true,
          qty: true,
          completedQty: true,
          totalActualCost: true,
          totalStandardCost: true,
          variance: true,
          releasedCost: true,
          workOrderId: true,
          product: {
            select: {
              inventoryItem: {
                select: {
                  id: true,
                  isActive: true,
                  deletedAt: true,
                  defaultWarehouseId: true,
                  trackBatch: true,
                  trackSerial: true,
                  isProduct: true,
                },
              },
            },
          },
        },
      });
      if (order.status !== "in_progress") {
        throw new Error(`Perintah produksi berstatus '${order.status}', hanya 'in_progress' yang bisa diselesaikan`);
      }

      // P1-2: gate QC konsisten dengan Work Order. PO yang diinspeksi
      // langsung (referenceType ProductionOrder) dicek; bila tertaut WO,
      // WO induk ikut dicek — FG tak boleh release dengan NCR terbuka atau
      // inspeksi akhir gagal di kedua sisi. Tanpa QC records = lolos
      // (opt-in, sama seperti WO).
      await assertProductionOrderQcCleared(id, tx);
      if (order.workOrderId != null) {
        await assertWorkOrderQcCleared(order.workOrderId, tx);
      }
      const outputItem = order.product.inventoryItem;
      if (!outputItem || !outputItem.isProduct || !outputItem.isActive || outputItem.deletedAt) {
        throw new Error("Hubungkan produk manufaktur ke item persediaan aktif sebelum menyelesaikan order.");
      }

      let warehouseId = outputItem.defaultWarehouseId;
      if (warehouseId == null) {
        const fallbackWarehouse = await tx.warehouse.findFirst({
          where: {
            isActive: true,
            deletedAt: null,
            ...(warehouseScope.kind === "assigned" ? { id: { in: warehouseScope.warehouseIds } } : {}),
          },
          orderBy: { id: "asc" },
          select: { id: true },
        });
        if (!fallbackWarehouse) throw new Error("Item hasil produksi belum memiliki gudang default dan tidak ada gudang aktif yang dapat digunakan.");
        warehouseId = fallbackWarehouse.id;
      }
      assertWarehouseAccess(warehouseScope, warehouseId);
      const validWarehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!validWarehouse) throw new Error("Gudang default item hasil produksi tidak aktif.");

      const orderQty = Number(order.qty);
      const alreadyCompleted = Number(order.completedQty ?? 0);
      const actualCost = Number(order.totalActualCost);
      if (!Number.isFinite(orderQty) || orderQty <= 0 || !Number.isFinite(actualCost) || actualCost < 0) {
        throw new Error("Kuantitas hasil atau biaya aktual produksi tidak valid.");
      }
      const remaining = Math.round((orderQty - alreadyCompleted) * 100) / 100;
      if (remaining <= 0) {
        throw new Error("Seluruh kuantitas order sudah diselesaikan.");
      }
      // Release quantity: default to the whole remainder (legacy behaviour).
      const qty = qtyToComplete != null ? Math.round(Number(qtyToComplete) * 100) / 100 : remaining;
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Kuantitas yang diselesaikan harus lebih dari 0.");
      }
      if (qty > remaining + 1e-9) {
        throw new Error(`Kuantitas melebihi sisa order. Sisa yang belum selesai: ${remaining}.`);
      }
      const isFinal = qty >= remaining - 1e-9;
      // A partial release needs a distinct batch/lot per step (the batch table is
      // unique per item+batch); the final release keeps the plain document number
      // for continuity with existing single-pass orders.
      const releaseBatch = isFinal && alreadyCompleted === 0 ? order.documentNo : `${order.documentNo}-R${alreadyCompleted + qty}`;

      // Equivalent unit cost: the remaining WIP cost spread over the REMAINING
      // planned qty (not the whole order qty). `actualCost` is the WIP cost still
      // held for the order — it is trimmed on each partial release (see the
      // order.update below) — so dividing it by the ORIGINAL order qty would
      // understate the unit cost from the second release onward and let the
      // released cost never sum back to the full actual WIP. Using the remaining
      // quantity keeps `releaseCost` a clean proportional share, so a full
      // sequence of partial releases releases exactly `actualCost` in total
      // (FAB-09: "Produksi parsial membagi biaya berdasarkan hasil/ekuivalen").
      const remainingBefore = orderQty - alreadyCompleted;
      const share =
        remainingBefore > 0 ? Math.min(1, Math.round((qty / remainingBefore) * 1e6) / 1e6) : 1;
      const releaseCost = safeMultiply(actualCost, share, 2);
      const unitCost = qty > 0 ? Math.round((releaseCost / qty) * 100) / 100 : 0;
      const serials = serialNumbers.map((serial) => String(serial).trim()).filter(Boolean);
      if (outputItem.trackSerial) {
        if (!Number.isInteger(qty) || serials.length !== qty) {
          throw new Error(`Masukkan tepat ${qty} serial number unik untuk hasil produksi.`);
        }
        if (new Set(serials).size !== serials.length) throw new Error("Serial number tidak boleh duplikat.");
        const duplicateSerials = await tx.itemSerial.findMany({
          where: { serialNumber: { in: serials } },
          select: { serialNumber: true },
        });
        if (duplicateSerials.length) {
          throw new Error(`Serial number sudah digunakan: ${duplicateSerials.map((row) => row.serialNumber).join(", ")}`);
        }
      } else if (serials.length) {
        throw new Error("Serial number hanya dapat dikirim untuk item yang melacak serial.");
      }
      await assertPeriodOpen(new Date(), tx);
      const moveNo = await generateDocumentNumber("SM");
      const move = await tx.stockMove.create({
        data: {
          documentNo: moveNo,
          slug: slugify(moveNo),
          itemId: outputItem.id,
          warehouseId,
          qty,
          cost: unitCost,
          impact: "IN",
          status: "posted",
          moveType: "production_receipt",
          referenceType: "ProductionOrder",
          referenceId: id,
          notes: `Penerimaan hasil produksi ${order.documentNo}`,
          createdBy: Number(user.id),
        },
        select: { id: true },
      });
      await createInLayer(tx, {
        itemId: outputItem.id,
        warehouseId,
        batchNumber: outputItem.trackBatch ? releaseBatch : null,
        stockMoveId: move.id,
        qty,
        unitCost,
      });
      if (outputItem.trackBatch) {
        await tx.itemBatch.create({
          data: {
            itemId: outputItem.id,
            batchNumber: releaseBatch,
            manufacturingDate: new Date(),
            qty,
            warehouseId,
            notes: `Hasil perintah produksi ${order.documentNo}`,
          },
        });
      }
      if (outputItem.trackSerial) {
        await tx.itemSerial.createMany({
          data: serials.map((serialNumber) => ({
            itemId: outputItem.id,
            serialNumber,
            status: "available",
            warehouseId,
            notes: `Hasil perintah produksi ${order.documentNo}`,
          })),
        });
      }
      await tx.item.update({
        where: { id: outputItem.id },
        data: { qtyOnHand: { increment: qty } },
      });
      await stockJournalService.onProductionOrderCompleted(
        tx,
        [{ qty, cost: unitCost }],
        order.documentNo,
        id,
        Number(user.id),
        undefined,
        move.id,
      );
      // Rounding variance for THIS release: what we carried into inventory
      // (qty × unitCost) vs the slice of WIP cost released (releaseCost).
      await stockJournalService.onProductionOrderCostRoundingVariance(
        tx,
        safeSubtract(releaseCost, safeMultiply(qty, unitCost, 2), 2),
        order.documentNo,
        id,
        Number(user.id),
        undefined,
        move.id,
      );

      // Advance the completed quantity and release the equivalent share of WIP
      // cost. On a partial release the order stays `in_progress` with the
      // remaining cost still held as WIP (PRD FAB-09).
      const newCompleted = Math.round((alreadyCompleted + qty) * 100) / 100;
      const remainingCost = Math.max(0, safeSubtract(actualCost, releaseCost, 2));
      // Production variance = cost actually carried into finished goods minus
      // the STANDARD cost of the same produced quantity. Compute it for THIS
      // release and ACCUMULATE into the order's running variance.
      //
      // Computing it as `order.totalActualCost - order.totalStandardCost` was
      // wrong under partial completion: `totalActualCost` is reduced as WIP is
      // released, so the final step compared the *remaining* cost slice against
      // the *whole* order's standard cost (e.g. 40 000 - 90 000 = -50 000 for a
      // fully-completed 10-unit order), and the per-step figures never summed to
      // the true whole-order variance.
      const orderQtyForStd = orderQty > 0 ? orderQty : 1;
      const releasedStandardCost = safeMultiply(
        Number(order.totalStandardCost),
        Math.round((qty / orderQtyForStd) * 1e6) / 1e6,
        2,
      );
      const varianceThisRound = safeSubtract(releaseCost, releasedStandardCost, 2);
      const variance = safeAdd(Number(order.variance ?? 0), varianceThisRound, 2);
      await tx.productionOrder.update({
        where: { id },
        data: {
          completedQty: newCompleted,
          totalActualCost: isFinal ? 0 : remainingCost,
          variance,
          // P1-3: akumulasi biaya aktual yang di-release — sumber total biaya
          // genealogi final (totalActualCost di-nol-kan saat final).
          releasedCost: safeAdd(Number(order.releasedCost ?? 0), releaseCost, 2),
          ...(isFinal ? { status: "completed", endDate: new Date() } : {}),
        },
      });

      // Production genealogy (PRD line 369 / REP-13) is recorded once, on the
      // FINAL release, so the unique-per-order record still holds under partial
      // completion. P1-3: record final adalah AGREGAT semua release — bukan
      // slice terakhir. Sebelumnya outputQty=orderQty dipasangkan serial
      // final saja + batch documentNo + biaya slice final (urutan 4 lalu 6:
      // qty catat 10, serial hanya 6 terakhir, biaya hanya slice 6).
      if (isFinal) {
        const materialRows = await tx.productionOrderMaterial.findMany({
          where: { productionOrderId: id },
          select: {
            itemId: true,
            actualQty: true,
            actualCost: true,
            serialNumbers: true,
            batchNumbers: true,
          },
        });
        // Semua serial/batch hasil order ini (semua release), bukan hanya
        // release final. Dicatat dengan notes persis per order.
        const releaseNote = `Hasil perintah produksi ${order.documentNo}`;
        const allSerials = outputItem.trackSerial
          ? (
              await tx.itemSerial.findMany({
                where: { itemId: outputItem.id, notes: releaseNote },
                select: { serialNumber: true },
                orderBy: { id: "asc" },
              })
            ).map((r) => r.serialNumber)
          : [];
        const allBatches = outputItem.trackBatch
          ? (
              await tx.itemBatch.findMany({
                where: { itemId: outputItem.id, notes: releaseNote },
                select: { batchNumber: true },
                orderBy: { id: "asc" },
              })
            ).map((r) => r.batchNumber)
          : [];
        // Total biaya aktual = akumulasi release sebelumnya + release ini.
        // (totalActualCost sudah di-nol-kan untuk final, jadi tak bisa jadi
        // sumber.)
        const totalReleasedCost = safeAdd(Number(order.releasedCost ?? 0), releaseCost, 2);
        const genealogyUnitCost = orderQty > 0 ? Math.round((totalReleasedCost / orderQty) * 100) / 100 : 0;
        await recordProductionGenealogy(tx, {
          productionOrderId: id,
          documentNo: order.documentNo,
          outputItemId: outputItem.id,
          outputQty: orderQty,
          outputSerials: allSerials,
          outputBatch: outputItem.trackBatch ? allBatches.join(", ") : null,
          unitCost: genealogyUnitCost,
          totalCost: totalReleasedCost,
          completedBy: Number(user.id),
          materials: materialRows.map((m) => {
            const mq = Number(m.actualQty ?? 0);
            const mc = Number(m.actualCost ?? 0);
            return {
              itemId: m.itemId,
              qty: mq,
              unitCost: mq > 0 ? Math.round((mc / mq) * 100) / 100 : 0,
              totalCost: mc,
              // Source lot/serial attribution captured at issue time.
              serialNumbers: toStringArray(m.serialNumbers),
              batchNumbers: toStringArray(m.batchNumbers),
            };
          }),
        });
      }

      return {
        variance,
        totalActualCost: actualCost,
        totalStandardCost: Number(order.totalStandardCost),
        releasedQty: qty,
        completedQty: newCompleted,
        isFinal,
        remainingWipCost: isFinal ? 0 : remainingCost,
      };
    });

    await logActivity("complete", "ProductionOrder", id, `Menyelesaikan perintah produksi #${id}`);
    revalidatePath("/produksi/production-orders");
    return { success: true, ...result };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[completeProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== WORK ORDER LIFECYCLE ACTIONS ====================

/**
 * Start a Work Order: draft → in_progress.
 * Guard: WO must have at least one item.
 * Parity with Laravel: WorkOrderController@start
 */
export async function startWorkOrder(workOrderId: number) {
  try {
    const user = await requirePermission("edit_work_orders");

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { items: true },
    });

    if (wo.status !== "pending" && wo.status !== "draft") {
      throw new Error(
        `Perintah Kerja tidak bisa dimulai dari status '${wo.status}'. Status harus pending/draft.`,
      );
    }

    if (wo.items.length === 0) {
      throw new Error(
        "Perintah Kerja tidak bisa dimulai tanpa item. Tambahkan item terlebih dahulu.",
      );
    }

    // F-50(a): WO kendaraan wajib punya inspeksi vehicle_intake tercatat
    // sebelum mulai; tanpa itu kondisi masuk kendaraan tak terdokumentasi.
    await assertWorkOrderVehicleIntakeRecorded(workOrderId);

    // ATOMICITY: the WO header status flip + the per-item status flip must
    // commit together. Previously they were two separate prisma calls — a
    // failure on the second (e.g. a transient DB error) would leave the WO
    // header "in_progress" with all items still "pending", a half-started WO
    // that the UI then refuses to re-start (status guard). Operators would
    // have to flip items by hand. Wrapping both in one tx guarantees the
    // header and its items are always in sync.
    //
    // The header flip is a conditional claim (updateMany WHERE status IN
    // (pending,draft)); only the request that wins it proceeds to flip items.
    // Two concurrent "mulai" clicks therefore cannot both start the WO.
    await prisma.$transaction(async (tx) => {
      const claim = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: { in: ["pending", "draft"] } },
        data: {
          status: "in_progress",
          startDate: wo.startDate || new Date(),
        },
      });
      if (claim.count === 0) {
        throw new Error(
          "Work Order sudah dimulai atau sedang diproses oleh pengguna lain.",
        );
      }

      // Update all WO items to in_progress
      await tx.workOrderItem.updateMany({
        where: { workOrderId, status: "pending" },
        data: { status: "in_progress" },
      });

      // F-2026-10-21-020 Tahap A: tahap lahir di transaksi yang sama
      // dengan klaim start — start gagal tidak meninggalkan baris yatim,
      // dan hanya pemenang klaim yang menginisialisasi (idempoten).
      await doInitializeWorkOrderOperationsTx(tx, workOrderId);

      // F-2026-10-21-012 inti (BR-RES-01/07): reservasi lahir di tx klaim
      // yang sama, hanya oleh pemenang klaim (AC-RES-9). Kekurangan stok
      // TIDAK menolak start — baris parsial + shortageQty tercatat.
      await createReservationsForWorkOrderStartTx(tx, {
        workOrderId,
        createdBy: Number(user.id),
      });
    });

    await logActivity(
      "start",
      "WorkOrder",
      workOrderId,
      `Memulai perintah kerja #${workOrderId}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[startWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Complete a Work Order: in_progress → completed.
 * Guards:
 *  - Must be in_progress status
 *  - Must have items
 *  - MaterialIssue must exist and be completed for this WO
 * Then: stock move OUT, journal, auto-create DeliveryOrder.
 * Parity with Laravel: ProjectStageProgressController@updateProjectProgress
 */
export async function completeWorkOrder(workOrderId: number) {
  try {
    const user = await requirePermission("complete_work_orders");

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { items: true },
    });

    // Guard: must be in_progress or pending
    if (wo.status !== "in_progress" && wo.status !== "pending") {
      throw new Error(
        `Work Order tidak bisa diselesaikan dari status '${wo.status}'.`,
      );
    }
    if (wo.items.length === 0) {
      throw new Error("Perintah Kerja tidak bisa diselesaikan tanpa item.");
    }

    // Guard: check if MaterialIssue exists and is completed for this WO
    const mi = await prisma.materialIssue.findFirst({
      where: { workOrderId: workOrderId, status: "completed" },
    });
    if (!mi) {
      throw new Error(
        "Material Issue belum diselesaikan untuk Work Order ini. Selesaikan Material Issue terlebih dahulu.",
      );
    }

    // Guard QC (PRD FAB-11/FAB-13): a final inspection that failed, or any open
    // nonconformance, blocks handover. WO with no QC records passes (opt-in QC),
    // so simple/legacy jobs stay completable.
    await assertWorkOrderQcCleared(workOrderId);

    // NOTE: konsumsi material (stok keluar + jurnal) hanya oleh Material
    // Issue wajib di atas — penyelesaian WO milestone status/fulfilment
    // saja, tanpa konsumsi stok ganda.
    const releasedCount = await completeWorkOrderTx(prisma, workOrderId, Number(user.id), {
      claimStatuses: ["in_progress", "pending"],
      projectId: wo.projectId,
    });

    await logActivity(
      "complete",
      "WorkOrder",
      workOrderId,
      `Menyelesaikan perintah kerja #${workOrderId}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    revalidatePath("/inventaris/mutasi-stok");
    revalidatePath("/pengiriman");
    // F-2026-10-22-057-S §1: kata rilis verbatim; null = tak ada sisa aktif.
    return { success: true, releaseNotice: reservationReleaseNotice("complete", releasedCount) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[completeWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Inti penyelesaian WO dalam SATU transaksi (dipakai jalur manual
 * completeWorkOrder dan auto-close tahap F-020 — satu sumber kebenaran,
 * jangan duplikasi efek turunan di pemanggil lain):
 * klaim kondisional updateMany (hanya pemenang count===1 yang lanjut;
 * count===0 melempar supaya pemanggil manual menolak, sedangkan auto-close
 * menangkapnya sebagai no-op), flip item, lepas reservasi aktif, coverage
 * garansi, registri part terpasang, DeliveryOrder otomatis, sinkron status
 * proyek. Semua commit atau
 * rollback bersama — WO "completed" tanpa DeliveryOrder tidak mungkin lahir.
 * client boleh prisma global (dibungkus $transaction di sini) atau tx
 * pemanggil yang sudah memegang kunci baris WO (FOR UPDATE).
 * NOTE: konsumsi material (stok keluar + jurnal) hanya oleh Material Issue
 * wajib di pemanggil — penyelesaian WO di sini milestone status/fulfilment
 * saja, tidak mengonsumsi stok atau mengkredit inventaris kedua kali.
 */
async function completeWorkOrderTx(
  client: TxClient | typeof prisma,
  workOrderId: number,
  userId: number,
  opts: { claimStatuses: string[]; projectId?: number | null },
): Promise<number> {
  const run = async (tx: TxClient): Promise<number> => {
    const claim = await tx.workOrder.updateMany({
      where: { id: workOrderId, status: { in: opts.claimStatuses } },
      data: {
        status: "completed",
        endDate: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new Error("Perintah Kerja sudah diselesaikan atau sedang diproses.");
    }

    // Update all WO items to completed
    await tx.workOrderItem.updateMany({
      where: { workOrderId },
      data: { status: "completed" },
    });

    // F-2026-10-21-012 inti (BR-RES-10): sisa reservasi aktif lepas di
    // tx penyelesaian yang sama; rollback completion (QC/DO gagal)
    // ikut menggulung pelepasan ini (AC-RES-4).
    const released = await releaseActiveReservationsForWorkOrderTx(tx, {
      workOrderId,
      releasedBy: userId,
      reason: "Perintah kerja selesai",
    });

    // F-2026-10-21-021 tahap 1: coverage garansi pasang lahir otomatis
    // dari baris terpasang ber-warrantyMonths (MaterialIssue completed di
    // atas). Satu transaksi dengan klaim status WO: coverage gagal dibuat
    // = completion rollback. Tanpa jurnal/provisi (tahap 3 ditahan).
    await createWarrantyCoveragesForWorkOrder(workOrderId, new Date(), tx);

    // F-2026-10-22-072-S: registri part terpasang lahir di tx yang sama
    // untuk SEMUA baris issue (bukan hanya bergaransi), menaut coverage
    // yang baru lahir di atas. Tanpa kendaraan: nol baris (BR-IP-07),
    // WO tetap completed — hasil skipped tidak menggagalkan klaim ini.
    await createInstalledPartsForWorkOrder(workOrderId, new Date(), tx);

    // Auto-create DeliveryOrder for parts if applicable (runs once — guarded by
    // the atomic claim above so only the winning request reaches here).
    await autoCreateDeliveryOrder(workOrderId, userId, tx);

    // Sync linked Project status (same tx so status never diverges).
    if (opts.projectId) {
      await syncProjectStatus(opts.projectId, tx);
    }
    return released;
  };

  if (client === prisma) {
    return prisma.$transaction(run);
  }
  return run(client as TxClient);
}

/**
 * Auto-create DeliveryOrder from completed WorkOrder.
 * Only creates DO if WO has items with quantity > 0.
 * Accepts an optional txClient so the caller can include the DO creation in
 * its own transaction (WO completion); falls back to the global client.
 */
async function autoCreateDeliveryOrder(workOrderId: number, userId: number, txClient?: TxClient) {
  const db = txClient ?? prisma;
  const wo = await db.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true, customer: true },
  });

  // Only create DO if there are items to deliver
  const deliverableItems = wo.items.filter((i) => Number(i.qty) > 0);
  if (deliverableItems.length === 0) return;

  // Guard: a DeliveryOrder must be attached to a SalesOrder derived from the WO's
  // quotation. If the WO has no linked quotation we cannot safely pick an SO
  // (Prisma treats `where: { quotationId: undefined }` as "no filter", which
  // would silently attach the DO to the first SalesOrder in the table). Refuse
  // to create a DO in that case rather than corrupt the linkage.
  if (!wo.quotationId) return;

  // Find linked SalesOrder to attach DO to
  const salesOrder = await db.salesOrder.findFirst({
    where: { quotationId: wo.quotationId },
  });
  if (!salesOrder) return;

  const doDocNo = await generateDocumentNumber("DO");

  const deliveryOrder = await db.deliveryOrder.create({
    data: {
      documentNo: doDocNo,
      doNumber: doDocNo,
      salesOrderId: salesOrder.id,
      customerId: wo.customerId,
      date: new Date(),
      deliveryDate: new Date(),
      status: "draft",
      notes: `Otomatis dibuat dari Work Order ${wo.documentNo}`,
      createdBy: userId,
    },
  });

  // Create DO items from WO items
  await db.deliveryOrderItem.createMany({
    data: deliverableItems.map((item) => ({
      deliveryOrderId: deliveryOrder.id,
      itemId: item.itemId,
      qty: item.qty,
      notes: item.description || null,
    })),
  });
}

/**
 * Helper: sync linked Project status based on its stage completion.
 *
 * Delegates to the pure `computeProjectStatus` helper so the transition
 * rules (and the endDate-preservation guard for re-runs on an already-
 * completed project) are unit-tested without Prisma. endDate is only
 * stamped on the forward transition to completed; subsequent calls while
 * the project is still completed leave it untouched (fixes the historical
 * completion-date drift bug that fired every time a new WO completed for
 * the same project, e.g. warranty follow-up work).
 */
async function syncProjectStatus(projectId: number, txClient?: TxClient) {
  const db = txClient ?? prisma;
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true, endDate: true },
  });
  const stages = await db.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { status: true },
  });
  if (stages.length === 0) return;

  const result = computeProjectStatus(
    stages,
    project.status,
    project.endDate,
    new Date(),
  );
  if (!result.changed) return;

  await db.project.update({
    where: { id: projectId },
    data: { status: result.status, endDate: result.endDate },
  });
}

/**
 * Create Material Issue from Work Order.
 * Auto-populates MI items from WO items, resolves customer + plat nomor.
 */
export async function createMaterialIssueFromWorkOrder(
  workOrderId: number,
  warehouseId: number,
) {
  try {
    const user = await requirePermission("create_material_issues");

    // Scope gudang: MI hanya boleh dibuat untuk gudang yang boleh diakses user. Jalur
    // ini tidak lewat `issueMaterial` (yang sudah ter-scope), jadi tanpa cek di sini
    // draft MI bisa menunjuk gudang di luar wewenang pembuatnya.
    assertWarehouseAccess(await getWarehouseScope(user), warehouseId);

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: {
        items: true,
        customer: true,
        quotation: { include: { customerVehicle: { include: { vehicle: true } } } },
      },
    });

    // Idempotency + create + items must be atomic. The early `findFirst` check
    // is a TOCTOU window: two concurrent "create MI for WO#N" calls both see
    // existingMi=null, both insert, and the WO ends up with two MIs (double
    // stock-out). Wrap the check + create + items in a single $transaction
    // with a row lock on the WO, and re-check inside the tx.
    const issue = await prisma.$transaction(async (tx) => {
      // Lock the WO row so a concurrent create call for the same WO waits
      // for this one to commit before its own check runs.
      await tx.$executeRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;

      // F-009-V: WO closed tidak boleh melahirkan Material Issue baru.
      await assertJobCostMutable({ workOrderId }, "dibuatkan pengeluaran materialnya", tx);

      const existingMi = await tx.materialIssue.findFirst({
        where: { workOrderId },
        select: { id: true, documentNo: true },
      });
      if (existingMi) {
        throw new Error(
          `Material Issue sudah pernah dibuat untuk Work Order ini (No: ${existingMi.documentNo}).`,
        );
      }

      if (wo.items.length === 0) {
        throw new Error(
          "Work Order tidak memiliki item. Tambahkan item terlebih dahulu.",
        );
      }

      const miDocNo = await generateDocumentNumber("MI");
      const customerName = wo.customer?.name ?? "Unknown";
      const licensePlate = wo.quotation?.customerVehicle?.plateNumber ?? "-";
      const notes = `Pengeluaran material untuk WO ${wo.documentNo}\nPelanggan: ${customerName}\nPlat Nomor: ${licensePlate}`;

      const created = await tx.materialIssue.create({
        data: {
          documentNo: miDocNo,
          warehouseId,
          workOrderId,
          projectId: wo.projectId,
          date: new Date(),
          notes,
          status: "draft",
          createdBy: Number(user.id),
        },
      });

      // Auto-create MI items from WO items (same tx). F-2026-10-20-39(a):
      // simpan baris WO asal tiap baris issue supaya guard revisi bisa
      // memutuskan per baris WO, bukan menebak dari itemId yang sama.
      // F-008: beku allowance scrap dari revisi BOM ter-pin WO (bila ada) —
      // tanpa pin, snapshot null = belum kalibrasi (klasifikasi abnormal
      // jujur, bukan tebakan dari master hidup saat complete). Snapshot
      // LENGKAP: baris di luar revisi ikut null.
      const snapshotByItem = await resolveMaterialIssueScrapSnapshots(
        tx,
        wo.items.map((i) => ({ itemId: i.itemId, workOrderItemId: i.id })),
        workOrderId,
      );

      await tx.materialIssueItem.createMany({
        data: wo.items
          .filter((i) => Number(i.qty) > 0)
          .map((i) => ({
            materialIssueId: created.id,
            itemId: i.itemId,
            workOrderItemId: i.id,
            qty: i.qty,
            cost: i.cost,
            scrapPercentSnapshot: snapshotByItem.get(i.itemId) ?? null,
          })),
      });

      return created;
    });

    await logActivity(
      "create",
      "MaterialIssue",
      issue.id,
      `Membuat pengeluaran material #${issue.id} dari perintah kerja #${workOrderId}`,
    );
    revalidatePath("/inventaris/pengeluaran-material");
    return { success: true, id: issue.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error(
      "[createMaterialIssueFromWorkOrder]",
      getErrorMessage(e) || e,
    );
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Get WorkOrder with customer + vehicle info for display.
 */
export async function getWorkOrderWithCustomerInfo(workOrderId: number) {
  try {
    await requirePermission("view_work_orders");

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: {
        customer: true,
        quotation: {
          include: {
            customerVehicle: {
              include: { vehicle: { include: { variant: true } } },
            },
          },
        },
        items: true,
        project: true,
      },
    });

    // WorkOrderItem has no `item` relation; fetch names by itemId for display.
    const woItemIds = wo.items
      .map((i) => i.itemId)
      .filter((id): id is number => id != null);
    const itemNameRows = woItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: woItemIds } },
          select: { id: true, name: true },
        })
      : [];
    const itemNameMap = new Map(itemNameRows.map((r) => [r.id, r.name]));

    return {
      success: true,
      data: {
        id: wo.id,
        documentNo: wo.documentNo,
        status: wo.status,
        date: wo.date,
        startDate: wo.startDate,
        endDate: wo.endDate,
        notes: wo.notes,
        customerId: wo.customerId,
        customerName: wo.customer?.name ?? null,
        customerVehicleId: wo.customerVehicleId,
        licensePlate: wo.quotation?.customerVehicle?.plateNumber ?? null,
        vehicleName:
          wo.quotation?.customerVehicle?.vehicle?.variant?.name ?? null,
        projectId: wo.projectId,
        items: wo.items.map((i) => ({
          id: i.id,
          itemId: i.itemId,
          itemName:
            i.itemId != null ? (itemNameMap.get(i.itemId) ?? null) : null,
          qty: i.qty,
          cost: i.cost,
          description: i.description,
          status: i.status,
        })),
      },
    };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getWorkOrderWithCustomerInfo]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProduct(id: number) {
  try {
    await requirePermission("delete_products");

    // Guard: BomRevision.productId Cascade (hapus produk ikut hapus semua
    // revisi BOM + material diam-diam), QcChecklist.productId SetNull
    // (checklist kehilangan tautan produk), ProductionOrder Restrict
    // (P2003 mentah). Tolak berpesan jumlah, pola deleteBomRevision.
    const [productionOrderCount, bomCount, qcCount] = await Promise.all([
      prisma.productionOrder.count({ where: { productId: id } }),
      prisma.bomRevision.count({ where: { productId: id } }),
      prisma.qcChecklist.count({ where: { productId: id } }),
    ]);
    if (productionOrderCount > 0 || bomCount > 0 || qcCount > 0) {
      return {
        success: false,
        error:
          `Produk masih dipakai oleh ${productionOrderCount + bomCount + qcCount} data ` +
          `(perintah produksi: ${productionOrderCount}, revisi BOM: ${bomCount}, checklist QC: ${qcCount}) ` +
          `dan tidak bisa dihapus. Hapus atau lepaskan data terkait terlebih dahulu.`,
      };
    }

    await prisma.product.delete({ where: { id } });

    await logActivity("delete", "Product", id, `Menghapus produk #${id}`);
    revalidatePath("/produksi/products");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteProduct]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteWorkOrder(id: number) {
  try {
    await requirePermission("delete_work_orders");

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
    if (wo.status !== "pending" && wo.status !== "draft") {
      throw new Error(
        `Tidak bisa menghapus Work Order dengan status '${wo.status}'. Hanya status 'pending' atau 'draft' yang bisa dihapus.`,
      );
    }

    await prisma.workOrder.delete({ where: { id } });

    await logActivity(
      "delete",
      "WorkOrder",
      id,
      `Menghapus perintah kerja #${id}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteProductionOrder(id: number) {
  try {
    await requirePermission("delete_production_orders");

    const po = await prisma.productionOrder.findUniqueOrThrow({
      where: { id },
    });
    if (po.status !== "draft" && po.status !== "pending") {
      throw new Error(
        `Tidak bisa menghapus Perintah Produksi dengan status '${po.status}'. Hanya status 'draft' atau 'pending' yang bisa dihapus.`,
      );
    }

    await prisma.productionOrder.delete({ where: { id } });

    await logActivity(
      "delete",
      "ProductionOrder",
      id,
      `Menghapus perintah produksi #${id}`,
    );
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateProductionOrder(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_production_orders");

    const parsed = parseFormData(updateProductionOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Fix #34: Recalculate materials based on new qty
    const po = await prisma.productionOrder.findUniqueOrThrow({
      where: { id },
    });
    if (po.status !== "draft" && po.status !== "pending") {
      return {
        success: false,
        error: `Tidak bisa memperbarui Perintah Produksi dengan status '${po.status}'. Hanya status 'draft' atau 'pending' yang bisa diubah.`,
      };
    }

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      include: { materials: true },
    });

    // Per-item standard cost map for stamping BOM lines (no more hardcoded 0).
    const updBomItemIds = product.materials.map((m) => m.itemId);
    const updBomItems = updBomItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: updBomItemIds } },
          select: { id: true, standardCost: true },
        })
      : [];
    const updBomCostMap = new Map(updBomItems.map((i) => [i.id, Number(i.standardCost)]));
    const updProductStdCost = Number(product.standardCost);
    const poDocumentNo = po.documentNo;

    const productionOrder = await prisma.$transaction(async (tx) => {
      // Lock + re-check status INSIDE the transaction. The pre-check above is a
      // fast path only; without this, an approve/issue that lands between the
      // read and the update would let this call wipe the order's materials
      // (deleteMany/createMany below) while the order is already in progress.
      await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${id} FOR UPDATE`;
      const current = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== "draft" && current.status !== "pending") {
        throw new Error(
          `Tidak bisa memperbarui Perintah Produksi dengan status '${current.status}'. Hanya status 'draft' atau 'pending' yang bisa diubah.`,
        );
      }

      const po = await tx.productionOrder.update({
        where: { id },
        data: {
          slug: await nextSlug("productionOrder", poDocumentNo, { excludeId: id }),
          productId: v.productId,
          qty: v.qty,
          // Field ini kini muncul di form (Combobox "Perintah Kerja"), jadi nilainya
          // adalah maksud pengguna: kosong berarti tautan dilepas sengaja. Sebelumnya
          // form tak pernah mengirimnya sehingga setiap penyimpanan menghapus tautan
          // WO yang sudah ada.
          workOrderId: v.workOrderId ?? null,
          startDate: v.startDate ? wibDateToUtcMidnight(v.startDate) : null,
          endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
          notes: v.notes ?? null,
          totalStandardCost: safeMultiply(updProductStdCost, v.qty, 2),
        },
      });

      // Recalculate materials: delete old, create new based on BOM * qty
      await tx.productionOrderMaterial.deleteMany({
        where: { productionOrderId: id },
      });

      if (product.materials.length > 0) {
        await tx.productionOrderMaterial.createMany({
          data: product.materials.map((m) => ({
            productionOrderId: id,
            itemId: m.itemId,
            qty: safeMultiply(Number(m.qty), v.qty, 4),
            standardCost: updBomCostMap.get(m.itemId) ?? 0,
          })),
        });
      }

      return po;
    });

    await logActivity(
      "update",
      "ProductionOrder",
      productionOrder.id,
      `Memperbarui perintah produksi #${productionOrder.id}`,
    );
    revalidatePath("/produksi/production-orders");
    return { success: true, id: productionOrder.id, slug: productionOrder.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== JOB CLOSE-OUT (F-2026-10-21-009-V) ====================
// Vonis BOT 4: completed != closed. Tutup = kunci akuntansi tanpa jurnal
// baru; reopen = izin existing + alasan wajib, kembali ke completed, jejak
// tutup->reopen->tutup utuh di kolom + ActivityLog (tidak di-overwrite).

export async function closeProductionOrder(id: number, reason?: string) {
  try {
    const user = await requirePermission("edit_production_orders");
    const parsed = validateCloseReason(reason);
    if (typeof parsed !== "string") return { success: false, error: parsed.error };

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        select: { id: true, documentNo: true, status: true, qty: true, completedQty: true, totalActualCost: true, workOrderId: true },
      });
      const blocker = productionOrderCloseBlocker(order);
      if (!blocker.ok) throw new Error(blocker.error);
      await assertProductionOrderQcCleared(id, tx);
      if (order.workOrderId != null) await assertWorkOrderQcCleared(order.workOrderId, tx);
      await assertPeriodOpen(new Date(), tx);
      const claim = await tx.productionOrder.updateMany({
        where: { id, status: "completed" },
        data: { status: "closed", closedAt: new Date(), closedBy: Number(user.id), closedReason: parsed },
      });
      if (claim.count === 0) throw new Error("Perintah produksi sudah ditutup atau sedang diproses pengguna lain.");
    });

    await logActivity("close", "ProductionOrder", id, `Menutup perintah produksi #${id}: ${parsed}`);
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[closeProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function reopenProductionOrder(id: number, reason?: string) {
  try {
    const user = await requirePermission("edit_production_orders");
    const parsed = validateReopenReason(reason);
    if (typeof parsed !== "string") return { success: false, error: parsed.error };

    const prev = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        select: { id: true, status: true, closedAt: true, closedBy: true, closedReason: true },
      });
      if (order.status !== "closed") {
        throw new Error(`Perintah produksi hanya dapat dibuka kembali dari status 'closed' (saat ini '${order.status}').`);
      }
      const claim = await tx.productionOrder.updateMany({
        where: { id, status: "closed" },
        data: { status: "completed", reopenedAt: new Date(), reopenedBy: Number(user.id), reopenReason: parsed },
      });
      if (claim.count === 0) throw new Error("Perintah produksi sudah dibuka kembali atau sedang diproses pengguna lain.");
      return order;
    });

    // Jejak reopen ditulis SESUDAH commit (logActivity non-tx, pola existing)
    // dan memuat snapshot tutup sebelumnya — tutup berikutnya tidak menimpanya.
    await logActivity(
      "reopen",
      "ProductionOrder",
      id,
      `Membuka kembali perintah produksi #${id}: ${parsed} (tutup sebelumnya: ${prev.closedAt?.toISOString() ?? "-"} oleh #${prev.closedBy ?? "-"}: ${prev.closedReason ?? "-"})`,
    );
    revalidatePath("/produksi/production-orders");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reopenProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== WORK ORDER OPERATIONS (F-2026-10-21-020 Tahap A) ====================

/** Init tahap WO di tx pemanggil (FOR UPDATE, idempoten, tanpa backfill). */
async function doInitializeWorkOrderOperationsTx(
  tx: TxClient,
  workOrderId: number,
  createdBy?: number | null,
): Promise<{ initialized: boolean }> {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE
  `;
  if (rows.length === 0) throw new Error("Perintah kerja tidak ditemukan");

  const existing = await tx.workOrderOperation.findMany({
    where: { workOrderId },
    select: { id: true },
  });
  if (existing.length > 0) return { initialized: false };

  const settings = await tx.systemSetting.findFirst();
  const stageNames = parseWorkOrderStageNames(settings?.defaultWorkOrderStages);
  await tx.workOrderOperation.createMany({
    data: stageNames.map((name, index) => ({
      workOrderId,
      name,
      sortOrder: index + 1,
      status: "pending",
      createdBy: createdBy ?? null,
    })),
  });
  return { initialized: true };
}

/** Init manual tahap WO (WO lama in_progress); klik kedua no-op. */
export async function initializeWorkOrderOperations(workOrderId: number) {
  try {
    const user = await requirePermission("edit_work_orders");
    const res = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { id: true, status: true },
      });
      if (wo.status !== "in_progress") {
        throw new Error(
          `Tahap hanya dapat diinisialisasi saat perintah kerja berstatus 'in_progress' (saat ini '${wo.status}').`,
        );
      }
      return doInitializeWorkOrderOperationsTx(tx, workOrderId, Number(user.id));
    });
    if (!res.initialized) return { success: true, message: "Tahap sudah terinisialisasi" };
    await logActivity("initialize", "WorkOrderOperation", workOrderId, "Inisialisasi tahapan perintah kerja");
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[initializeWorkOrderOperations]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Transisi tahap WO; guard murni evaluateWorkOrderOperationTransition (Q1-Q4). */
export async function updateWorkOrderOperationStatus(
  workOrderId: number,
  operationId: number,
  status: string,
  notes?: string,
) {
  try {
    const user = await requirePermission("edit_work_orders");

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { id: true, status: true, projectId: true },
      });
      const operation = await tx.workOrderOperation.findUniqueOrThrow({
        where: { id: operationId },
      });
      if (operation.workOrderId !== workOrderId) {
        throw new Error("Tahap tidak ditemukan pada perintah kerja ini.");
      }
      const operations = await tx.workOrderOperation.findMany({
        where: { workOrderId },
        select: { sortOrder: true, status: true, name: true },
      });
      const verdict = evaluateWorkOrderOperationTransition({
        workOrderStatus: wo.status,
        operations,
        targetSortOrder: operation.sortOrder,
        targetStatus: status,
        notes,
      });
      if (!verdict.ok) throw new Error(verdict.error);

      const updateData: Record<string, unknown> = { status };
      if (status === "in_progress") {
        if (!operation.startedAt) updateData.startedAt = new Date();
        updateData.completedAt = null;
      } else if (status === "completed" || status === "skipped") {
        if (!operation.startedAt) updateData.startedAt = new Date();
        updateData.completedAt = new Date();
      } else if (status === "pending") {
        updateData.startedAt = null;
        updateData.completedAt = null;
      }
      if (notes !== undefined) updateData.notes = notes;

      await tx.workOrderOperation.update({
        where: { id: operationId },
        data: updateData,
      });

      // F-020 lanjutan: auto-close WO saat tahap terakhir tuntas, dalam
      // transaksi + kunci baris WO yang sama. Vonis guard (butir 2 kartu):
      // auto-close memakai guard completeWorkOrder PERSIS (items ada,
      // MaterialIssue completed, QC bersih) — TIDAK melewati guard secara
      // diam-diam. Guard belum terpenuhi -> WO tetap in_progress dan
      // transisi tahap tetap sukses; operator menyelesaikan manual lewat
      // completeWorkOrder sesudah guard beres (pesan guard tampil di sana).
      const after = operations.map((o) =>
        o.sortOrder === operation.sortOrder ? { status } : o,
      );
      if (!shouldAutoCompleteWorkOrder({ operations: after })) {
        return { autoCompleted: false };
      }
      const items = await tx.workOrderItem.findMany({
        where: { workOrderId },
        select: { id: true },
      });
      if (items.length === 0) return { autoCompleted: false };
      const mi = await tx.materialIssue.findFirst({
        where: { workOrderId, status: "completed" },
        select: { id: true },
      });
      if (!mi) return { autoCompleted: false };
      // QC belum bersih = guard belum terpenuhi (sama items/MaterialIssue):
      // tahap tetap commit, WO tetap in_progress, operator menyelesaikan
      // manual lewat completeWorkOrder (pesan guard tampil di sana).
      try {
        await assertWorkOrderQcCleared(workOrderId, tx);
      } catch {
        return { autoCompleted: false };
      }
      // Klaim kondisional di completeWorkOrderTx: hanya status in_progress
      // yang boleh menang; count===0 melempar di sana dan ditangkap di sini
      // sebagai no-op — WO sudah ditutup proses lain, tanpa error dan tanpa
      // efek turunan ganda (klaim kalah tidak menyentuh DO/item/reservasi).
      try {
        await completeWorkOrderTx(tx, workOrderId, Number(user.id), {
          claimStatuses: ["in_progress"],
          projectId: wo.projectId,
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes("sudah diselesaikan")) {
          return { autoCompleted: false };
        }
        throw e;
      }
      return { autoCompleted: true };
    });

    await logActivity("update", "WorkOrderOperation", operationId, "Memperbarui progres tahapan perintah kerja");
    if (outcome.autoCompleted) {
      await logActivity(
        "complete",
        "WorkOrder",
        workOrderId,
        `Menyelesaikan perintah kerja #${workOrderId} (otomatis: semua tahap tuntas)`,
      );
      revalidatePath("/inventaris/mutasi-stok");
      revalidatePath("/pengiriman");
    }
    revalidatePath("/produksi/perintah-kerja");
    return { success: true, autoCompleted: outcome.autoCompleted };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateWorkOrderOperationStatus]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function closeWorkOrder(workOrderId: number, reason?: string) {
  try {
    const user = await requirePermission("complete_work_orders");
    const parsed = validateCloseReason(reason);
    if (typeof parsed !== "string") return { success: false, error: parsed.error };

    const releasedCount = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { id: true, documentNo: true, status: true },
      });
      if (wo.status !== "completed") {
        throw new Error(`Perintah kerja hanya dapat ditutup dari status 'completed' (saat ini '${wo.status}').`);
      }
      const openChild = await tx.productionOrder.findFirst({
        where: { workOrderId, status: { notIn: ["completed", "cancelled", "closed"] } },
        select: { id: true, documentNo: true, status: true },
      });
      if (openChild) {
        throw new Error(`Perintah kerja belum dapat ditutup: perintah produksi #${openChild.id} (${openChild.documentNo}) masih berstatus '${openChild.status}'. Tutup/selesaikan PO anak terlebih dahulu.`);
      }
      const openMi = await tx.materialIssue.findFirst({
        where: { workOrderId, status: { in: ["draft", "processing"] } },
        select: { id: true, documentNo: true, status: true },
      });
      if (openMi) {
        throw new Error(`Perintah kerja belum dapat ditutup: pengeluaran material #${openMi.id} (${openMi.documentNo}) masih berstatus '${openMi.status}'.`);
      }
      const unposted = await tx.productionCost.findFirst({
        where: { postedAt: null, OR: [{ workOrderId }, { productionOrder: { workOrderId } }] },
        select: { id: true },
      });
      if (unposted) {
        throw new Error(`Perintah kerja belum dapat ditutup: biaya produksi #${unposted.id} belum terposting (postedAt kosong).`);
      }
      await assertWorkOrderQcCleared(workOrderId, tx);
      await assertPeriodOpen(new Date(), tx);
      const claim = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: "completed" },
        data: { status: "closed", closedAt: new Date(), closedBy: Number(user.id), closedReason: parsed },
      });
      if (claim.count === 0) throw new Error("Perintah kerja sudah ditutup atau sedang diproses pengguna lain.");
      // F-2026-10-21-012 inti (BR-RES-10): tutup job ikut melepas sisa
      // aktif (biasanya sudah released saat complete — updateMany no-op).
      const released = await releaseActiveReservationsForWorkOrderTx(tx, {
        workOrderId,
        releasedBy: Number(user.id),
        reason: "Perintah kerja ditutup",
      });
      return released;
    });

    await logActivity("close", "WorkOrder", workOrderId, `Menutup perintah kerja #${workOrderId}: ${parsed}`);
    revalidatePath("/produksi/perintah-kerja");
    // F-2026-10-22-057-S §1: no-op lazim sesudah complete → notice null.
    return { success: true, releaseNotice: reservationReleaseNotice("close", releasedCount) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[closeWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function reopenWorkOrder(workOrderId: number, reason?: string) {
  try {
    const user = await requirePermission("complete_work_orders");
    const parsed = validateReopenReason(reason);
    if (typeof parsed !== "string") return { success: false, error: parsed.error };

    const prev = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { id: true, status: true, closedAt: true, closedBy: true, closedReason: true },
      });
      if (wo.status !== "closed") {
        throw new Error(`Perintah kerja hanya dapat dibuka kembali dari status 'closed' (saat ini '${wo.status}').`);
      }
      const claim = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: "closed" },
        data: { status: "completed", reopenedAt: new Date(), reopenedBy: Number(user.id), reopenReason: parsed },
      });
      if (claim.count === 0) throw new Error("Perintah kerja sudah dibuka kembali atau sedang diproses pengguna lain.");
      return wo;
    });

    await logActivity(
      "reopen",
      "WorkOrder",
      workOrderId,
      `Membuka kembali perintah kerja #${workOrderId}: ${parsed} (tutup sebelumnya: ${prev.closedAt?.toISOString() ?? "-"} oleh #${prev.closedBy ?? "-"}: ${prev.closedReason ?? "-"})`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reopenWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== STOCK RESERVATION ACTIONS (F-2026-10-21-012 inti) ====================

/**
 * Batalkan WO in_progress (BR-RES-11, vonis Lead F-045-S): izin existing
 * complete_work_orders (TANPA izin baru), alasan wajib tercatat, sisa
 * reservasi aktif lepas di transaksi yang sama. Status tujuan memakai
 * konstanta existing `cancelled`. Reservasi yang sudah consumed tetap
 * consumed — riwayat tak diubah (BR-RES-10).
 */
export async function cancelWorkOrder(workOrderId: number, reason?: string) {
  try {
    const user = await requirePermission("complete_work_orders");
    const parsed = validateCancelReason(reason);
    if (typeof parsed !== "string") return { success: false, error: parsed.error };

    const releasedCount = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { id: true, status: true },
      });
      if (wo.status !== "in_progress") {
        throw new Error(
          `Perintah kerja hanya dapat dibatalkan dari status 'in_progress' (saat ini '${wo.status}').`,
        );
      }
      const claim = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: "in_progress" },
        data: { status: "cancelled" },
      });
      if (claim.count === 0) {
        throw new Error("Perintah kerja sudah dibatalkan atau sedang diproses pengguna lain.");
      }
      const released = await releaseActiveReservationsForWorkOrderTx(tx, {
        workOrderId,
        releasedBy: Number(user.id),
        reason: `Perintah kerja dibatalkan: ${parsed}`,
      });
      return released;
    });

    await logActivity(
      "cancel",
      "WorkOrder",
      workOrderId,
      `Membatalkan perintah kerja #${workOrderId}: ${parsed}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    // F-2026-10-22-057-S §1: kata rilis verbatim; null = tak ada sisa aktif.
    return { success: true, releaseNotice: reservationReleaseNotice("cancel", releasedCount) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[cancelWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Lepas manual satu reservasi aktif (BR-RES-09): hanya
 * complete_work_orders + alasan wajib; jejak siapa/kapan/alasan di baris
 * reservasi + ActivityLog. Tanpa keduanya → ditolak server (AC-RES-6).
 */
export async function releaseStockReservation(reservationId: number, reason?: string) {
  try {
    const user = await requirePermission("complete_work_orders");
    const parsed = validateCancelReason(reason);
    if (typeof parsed !== "string") {
      return { success: false, error: "Alasan pelepasan reservasi wajib diisi." };
    }

    const released = await prisma.$transaction(async (tx) => {
      await expireOverdueReservationsTx(tx, {});
      return releaseStockReservationTx(tx, {
        reservationId,
        releasedBy: Number(user.id),
        reason: parsed,
      });
    });
    if (!released) {
      return { success: false, error: "Reservasi tidak ditemukan atau sudah tidak aktif." };
    }

    await logActivity(
      "release",
      "StockReservation",
      reservationId,
      `Melepas reservasi stok #${reservationId}: ${parsed}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[releaseStockReservation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Reservasi ulang/manual (BR-RES-06, §2b): edit_work_orders + akses gudang
 * sumber; hanya untuk WO in_progress; melahirkan baris active BARU
 * (baris expired/released lama tak dihidupkan). Idempoten per
 * (workOrderId,itemId,warehouseId) aktif — baris aktif yang ada ditolak.
 */
export async function reserveStockForWorkOrder(input: {
  workOrderId: number;
  workOrderItemId: number;
  warehouseId: number;
  qty: number;
}) {
  try {
    const user = await requirePermission("edit_work_orders");
    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      return { success: false, error: "Qty reservasi harus lebih dari 0." };
    }
    assertWarehouseAccess(await getWarehouseScope(user), input.warehouseId);

    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${input.workOrderId} FOR UPDATE`;
      const wo = await tx.workOrder.findUniqueOrThrow({
        where: { id: input.workOrderId },
        select: { id: true, status: true, startDate: true, endDate: true },
      });
      if (wo.status !== "in_progress") {
        throw new Error(
          `Reservasi hanya dapat dibuat untuk perintah kerja 'in_progress' (saat ini '${wo.status}').`,
        );
      }
      const line = await tx.workOrderItem.findFirst({
        where: { id: input.workOrderItemId, workOrderId: input.workOrderId },
        select: { id: true, itemId: true, qty: true, status: true },
      });
      if (!line || line.itemId <= 0 || line.status === "replaced") {
        throw new Error("Baris perintah kerja tidak ditemukan atau tidak dapat direservasi.");
      }
      await expireOverdueReservationsTx(tx, { workOrderId: input.workOrderId });
      const existing = await tx.stockReservation.findFirst({
        where: {
          workOrderId: input.workOrderId,
          itemId: line.itemId,
          warehouseId: input.warehouseId,
          status: "active",
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error("Reservasi aktif untuk item dan gudang ini sudah ada pada perintah kerja ini.");
      }
      const issued = await tx.materialIssueItem.aggregate({
        where: {
          workOrderItemId: line.id,
          materialIssue: { workOrderId: input.workOrderId, status: "completed" },
        },
        _sum: { qty: true },
      });
      const remainingNeed = Math.max(0, Number(line.qty) - Number(issued._sum.qty ?? 0));
      if (input.qty > remainingNeed + 1e-9) {
        throw new Error("Qty reservasi melebihi sisa kebutuhan baris perintah kerja.");
      }
      return tx.stockReservation.create({
        data: {
          workOrderId: input.workOrderId,
          workOrderItemId: line.id,
          itemId: line.itemId,
          warehouseId: input.warehouseId,
          qtyReserved: new Prisma.Decimal(input.qty),
          qtyConsumed: new Prisma.Decimal(0),
          shortageQty: new Prisma.Decimal(0),
          status: "active",
          expiresAt: reservationExpiresAt(wo.startDate ?? new Date(), wo.endDate),
          createdBy: Number(user.id),
        },
      });
    });

    await logActivity(
      "reserve",
      "StockReservation",
      created.id,
      `Reservasi stok manual perintah kerja #${input.workOrderId}: ${input.qty} item #${created.itemId} gudang #${input.warehouseId}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true, id: created.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reserveStockForWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
