"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { safeMultiply, safeAdd, safeSubtract } from "@/lib/utils/math";
import { prisma } from "@/lib/db/prisma";
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
} from "@/lib/validations/manufacturing.schemas";
import { computeProjectStatus } from "@/lib/services/project-status";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { assertWarehouseAccess, getWarehouseScope } from "@/lib/auth/warehouse-scope";
import { Prisma } from "@prisma/client";

// ==================== PRODUCT (BOM) ACTIONS ====================

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

    const product = await prisma.product.create({
      data: {
        name: v.name,
        code,
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
    return { success: true, id: product.id };
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

    // Persisted rollup is rendered by the product pages, so refresh them. (This
    // action is not wired to any UI yet: production-order flows deliberately
    // derive the rollup inline - see createProductionOrder - to avoid this
    // action's `edit_products` check. Revalidating here keeps a future
    // "recalculate" button from leaving the pages stale.)
    revalidatePath("/produksi/products");
    revalidatePath(`/produksi/products/${productId}`);

    return { success: true, standardCost: total };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[calculateStandardCost]", getErrorMessage(e) || e);
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

    // Get product materials (BOM) to auto-populate production order materials
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      include: { materials: true },
    });

    // Per-item standard cost for each BOM line (stamped on the order material).
    const bomItemIds = product.materials.map((m) => m.itemId);
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
    if (productStdCost <= 0 && product.materials.length > 0) {
      productStdCost = product.materials.reduce(
        (sum, m) => safeAdd(sum, safeMultiply(bomCostMap.get(m.itemId) ?? 0, Number(m.qty), 2), 2),
        0,
      );
    }

    const productionOrder = await prisma.productionOrder.create({
      data: {
        documentNo,
        productId: v.productId,
        qty: v.qty,
        startDate: v.startDate ? new Date(v.startDate) : null,
        endDate: v.endDate ? new Date(v.endDate) : null,
        notes: v.notes ?? null,
        status: "draft",
        // total_standard_cost = product standard cost × order qty
        totalStandardCost: safeMultiply(productStdCost, v.qty, 2),
        createdBy: Number(user.id),
        materials: {
          create: product.materials.map((m) => ({
            itemId: m.itemId,
            qty: safeMultiply(Number(m.qty), v.qty, 4),
            standardCost: bomCostMap.get(m.itemId) ?? 0,
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
    revalidatePath("/produksi/production-orders");
    return { success: true, id: productionOrder.id };
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
 * Issue material against a confirmed/in-progress production order. Posts FIFO
 * stock out and a WIP/inventory journal in the same transaction, then rolls up
 * actual material cost on the order.
 */
export async function issueMaterial(
  productionOrderId: number,
  items: { itemId: number; qty: number }[],
) {
  try {
    const user = await requirePermission("edit_production_orders");
    if (!items?.length) throw new Error("Tidak ada material yang dikeluarkan");

    const requested = new Map<number, number>();
    for (const row of items) {
      const itemId = Number(row.itemId);
      const qty = Number(row.qty);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Item dan kuantitas material harus valid dan lebih dari 0");
      }
      requested.set(itemId, safeAdd(requested.get(itemId) ?? 0, qty, 2));
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
        select: { id: true, documentNo: true, status: true, totalActualCost: true },
      });
      if (order.status !== "confirmed" && order.status !== "in_progress") {
        throw new Error(
          `Material hanya bisa dikeluarkan untuk perintah berstatus 'confirmed' atau 'in_progress' (saat ini '${order.status}')`,
        );
      }
      if (order.status === "confirmed") {
        await tx.productionOrder.update({
          where: { id: productionOrderId },
          data: { status: "in_progress" },
        });
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
        const { consumedCost } = await consumeFifoLayers(tx, {
          itemId,
          warehouseId,
          qty,
          label: `perintah produksi ${order.documentNo}`,
        });
        const unitCost = qty > 0 ? consumedCost / qty : resolveItemCost(itm);
        const lineCost = safeMultiply(qty, unitCost, 2);
        movementLines.push({ itemId, qty, cost: unitCost, warehouseId });

        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${itemId}`;

        const existing = await tx.productionOrderMaterial.findFirst({
          where: { productionOrderId, itemId },
          select: { id: true, actualQty: true, actualCost: true },
        });
        if (existing) {
          await tx.productionOrderMaterial.update({
            where: { id: existing.id },
            data: {
              actualQty: safeAdd(Number(existing.actualQty ?? 0), qty, 2),
              actualCost: safeAdd(Number(existing.actualCost), lineCost, 2),
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
            },
          });
        }
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

/** Complete production, receive the finished item into inventory, and settle WIP. */
export async function completeProductionOrder(id: number, serialNumbers: string[] = []) {
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
          totalActualCost: true,
          totalStandardCost: true,
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

      const qty = Number(order.qty);
      const actualCost = Number(order.totalActualCost);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(actualCost) || actualCost < 0) {
        throw new Error("Kuantitas hasil atau biaya aktual produksi tidak valid.");
      }
      const unitCost = Math.round((actualCost / qty) * 100) / 100;
      const inventoryValue = safeMultiply(qty, unitCost, 2);
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
        batchNumber: outputItem.trackBatch ? order.documentNo : null,
        stockMoveId: move.id,
        qty,
        unitCost,
      });
      if (outputItem.trackBatch) {
        await tx.itemBatch.create({
          data: {
            itemId: outputItem.id,
            batchNumber: order.documentNo,
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
      );
      await stockJournalService.onProductionOrderCostRoundingVariance(
        tx,
        safeSubtract(actualCost, inventoryValue, 2),
        order.documentNo,
        id,
        Number(user.id),
      );

      const claim = await tx.productionOrder.updateMany({
        where: { id, status: "in_progress" },
        data: { status: "completed" },
      });
      if (claim.count === 0) throw new Error("Perintah produksi sudah diproses oleh pengguna lain.");
      const variance = safeSubtract(
        Number(order.totalActualCost),
        Number(order.totalStandardCost),
        2,
      );
      await tx.productionOrder.update({ where: { id }, data: { variance } });
      return { variance, totalActualCost: actualCost, totalStandardCost: Number(order.totalStandardCost) };
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
    await requirePermission("edit_work_orders");

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { items: true },
    });

    if (wo.status !== "pending" && wo.status !== "draft") {
      throw new Error(
        `Work Order tidak bisa dimulai dari status '${wo.status}'. Status harus pending/draft.`,
      );
    }

    if (wo.items.length === 0) {
      throw new Error(
        "Work Order tidak bisa dimulai tanpa item. Tambahkan item terlebih dahulu.",
      );
    }

    // ATOMICITY: the WO header status flip + the per-item status flip must
    // commit together. Previously they were two separate prisma calls — a
    // failure on the second (e.g. a transient DB error) would leave the WO
    // header "in_progress" with all items still "pending", a half-started WO
    // that the UI then refuses to re-start (status guard). Operators would
    // have to flip items by hand. Wrapping both in one tx guarantees the
    // header and its items are always in sync.
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          status: "in_progress",
          startDate: wo.startDate || new Date(),
        },
      });

      // Update all WO items to in_progress
      await tx.workOrderItem.updateMany({
        where: { workOrderId, status: "pending" },
        data: { status: "in_progress" },
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
      throw new Error("Work Order tidak bisa diselesaikan tanpa item.");
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

    // NOTE: Material consumption (stock-out + Dr Material Expense / Cr Inventory) is
    // performed exclusively by the mandatory Material Issue above. The Work Order
    // completion must NOT consume stock or credit inventory again, otherwise the
    // same materials would leave inventory twice and Inventory would be credited
    // twice. WO completion here is a status/fulfilment milestone only.

    // ATOMICITY: the WO claim + WO item flip + autoCreateDeliveryOrder +
    // syncProjectStatus must be a single atomic unit. Previously they were
    // three sequential non-transactional calls — a mid-sequence failure (e.g.
    // DO creation error) would leave a "completed" WO with no DeliveryOrder
    // for downstream shipping, and the project's status flip would be missing
    // even though the WO says it is done. Wrapping all four in one tx closes
    // that gap. (autoCreateDeliveryOrder and syncProjectStatus don't accept
    // a txClient parameter — they internally use the global prisma client, so
    // this transaction still wraps their writes (the in-flight claim update
    // is rolled back on a later failure) but the nested writes themselves
    // run as separate auto-commits. Documented as a known limitation; the
    // most important invariant — the claim + item flip — IS atomic.)
    await prisma.$transaction(async (tx) => {
      // Atomically claim completion: only the request that flips status away from
      // in_progress/pending wins. Without this, two concurrent "selesai" clicks
      // could both pass the status guard above and each run autoCreateDeliveryOrder
      // → duplicate Delivery Orders. The conditional updateMany serializes it.
      const claim = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: { in: ["in_progress", "pending"] } },
        data: {
          status: "completed",
          endDate: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new Error("Work Order sudah diselesaikan atau sedang diproses.");
      }

      // Update all WO items to completed
      await tx.workOrderItem.updateMany({
        where: { workOrderId },
        data: { status: "completed" },
      });

      // Auto-create DeliveryOrder for parts if applicable (runs once — guarded by
      // the atomic claim above so only the winning request reaches here).
      // NOTE: autoCreateDeliveryOrder does not accept a txClient; it uses the
      // global prisma client. Its writes are therefore not part of this
      // transaction — a failure here would still leave a "completed" WO row.
      // Documented as a known limitation; refactoring that helper to accept
      // a txClient is the next step if this proves brittle.
      await autoCreateDeliveryOrder(workOrderId, Number(user.id));

      // Sync linked Project status (same caveat: helper uses global prisma).
      if (wo.projectId) {
        await syncProjectStatus(wo.projectId);
      }
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
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[completeWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Auto-create DeliveryOrder from completed WorkOrder.
 * Only creates DO if WO has items with quantity > 0.
 */
async function autoCreateDeliveryOrder(workOrderId: number, userId: number) {
  const wo = await prisma.workOrder.findUniqueOrThrow({
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
  const salesOrder = await prisma.salesOrder.findFirst({
    where: { quotationId: wo.quotationId },
  });
  if (!salesOrder) return;

  const doDocNo = await generateDocumentNumber("DO");

  const deliveryOrder = await prisma.deliveryOrder.create({
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
  await prisma.deliveryOrderItem.createMany({
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
async function syncProjectStatus(projectId: number) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true, endDate: true },
  });
  const stages = await prisma.projectStage.findMany({
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

  await prisma.project.update({
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

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: {
        items: true,
        customer: true,
        quotation: { include: { customerVehicle: true } },
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
      const licensePlate = wo.quotation?.customerVehicle?.licensePlate ?? "-";
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

      // Auto-create MI items from WO items (same tx).
      await tx.materialIssueItem.createMany({
        data: wo.items
          .filter((i) => Number(i.qty) > 0)
          .map((i) => ({
            materialIssueId: created.id,
            itemId: i.itemId,
            qty: i.qty,
            cost: i.cost,
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
        licensePlate: wo.quotation?.customerVehicle?.licensePlate ?? null,
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
        `Tidak bisa menghapus Production Order dengan status '${po.status}'. Hanya status 'draft' atau 'pending' yang bisa dihapus.`,
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
        error: `Tidak bisa memperbarui Production Order dengan status '${po.status}'. Hanya status 'draft' atau 'pending' yang bisa diubah.`,
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

    const productionOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.productionOrder.update({
        where: { id },
        data: {
          productId: v.productId,
          qty: v.qty,
          startDate: v.startDate ? new Date(v.startDate) : null,
          endDate: v.endDate ? new Date(v.endDate) : null,
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
    return { success: true, id: productionOrder.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateProductionOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
