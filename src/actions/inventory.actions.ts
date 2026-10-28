"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { safeSubtract, safeMultiply } from "@/lib/utils/math";
import { prisma } from "@/lib/db/prisma";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { assertJobCostMutable } from "@/lib/services/job-closeout.service";
import { releaseReservationsForReplacedItemsTx } from "@/lib/services/stock-reservation.service";
import { stampWorkOrderFitmentSnapshot } from "@/lib/services/vehicle-fitment.service";
import { reservationReleaseNotice } from "@/lib/reports/stock-reservation-release";
import {
  assertApproved,
  requestApprovalIfConfigured,
} from "@/lib/services/approval-workflow.service";
import { getWarehouseScope, assertWarehouseAccess, assertWarehouseAccessMulti } from "@/lib/auth/warehouse-scope";
import { onStockAdjustmentProcessed as onStockAdjustmentStock } from "@/lib/hooks/stock-adjustment.hook";
import {
  onTransferProcessed as onInventoryTransferProcessed,
  onTransferReceived as onInventoryTransferReceived,
} from "@/lib/hooks/inventory-transfer.hook";
import { onMaterialIssueCompleted as onMaterialIssueStock, resolveMaterialIssueScrapSnapshots } from "@/lib/hooks/material-issue.hook";
import { refreshMaterialRequestFulfillmentTx } from "@/lib/services/material-request.service";
import {
  TRANSFER_SHORTAGE_REASON,
  buildShortageLines,
  carriedCostMapFromOutMoves,
  groupReceivedSerialsByLine,
  parseStoredSerials,
  type ReceiptLineInput,
  type TransferLineState,
} from "@/lib/services/inventory-transfer-receipt.service";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { createInstalledPartsForMaterialIssue } from "@/lib/services/installed-part.service";
import { validateScrapInput } from "@/lib/services/scrap-classification";
import {
  SCRAP_REVIEW_STATUS_DONE,
  SCRAP_REVIEW_STATUS_PENDING,
  validateScrapReview,
  validateScrapWeightKg,
  validateUsableRemnant,
} from "@/lib/services/scrap-physical";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { statusLabel } from "@/lib/utils/status-labels";
import { safeJsonParse } from "@/lib/utils/safe-parse";
import { logActivity } from "@/lib/services/activity-log.service";
import { parseFormData } from "@/lib/validations/parse-form";
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money";
import {
  stockAdjustmentSchema,
  inventoryTransferSchema,
  materialIssueSchema,
  workOrderSchema,
  reviseWorkOrderItemsSchema,
  WORK_ORDER_END_DATE_REASONS,
  type WorkOrderEndDateReasonCode,
  rackSchema,
  rackRowSchema,
} from "@/lib/validations/inventory.schemas";
import { nextSlug } from "@/lib/utils/slug-db";
import { dateOnly } from "@/lib/validations/finance.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

type WarehouseActionUser = { id: number | string; roles: string[] };

type QtyItemInput = {
  itemId: number | string;
  qty?: number | string;
};

/**
 * Normalisasi baris qty dokumen stok dari JSON `items` (transfer inventaris +
 * pengeluaran material). `qty` wajib parser repo (`parseLocaleNumber`) —
 * `Number("2.000")` = 2 merusak qty diam-diam (pola sama StockAdjustment).
 * qty tak terbaca/tidak > 0/itemId tak valid ditolak berpesan, bukan dibuang
 * diam-diam via `.filter()`. Baris itemId = 0/negatif tetap placeholder form
 * (dibuang) — form resmi prefilters itemId > 0; baris tak lengkap selain itu
 * adalah payload rusak, bukan baris kosong.
 */
function normalizeQtyItem(it: QtyItemInput): { itemId: number; qty: number } {
  const itemId = parseLocaleNumber(it.itemId as string | number);
  if (itemId === null || !Number.isInteger(itemId))
    throw new Error("Item tidak valid");
  if (itemId <= 0) return { itemId: 0, qty: 0 };
  const qty = parseLocaleNumber(it.qty as string | number);
  if (qty === null || qty <= 0) throw new Error("Kuantitas tidak valid");
  return { itemId, qty };
}

/** Daftar baris qty dari JSON `items`; placeholder itemId <= 0 dibuang. */
function normalizeQtyItems(
  raw: string | null | undefined,
): { itemId: number; qty: number }[] {
  return (safeJsonParse<QtyItemInput[]>(raw) ?? [])
    .map(normalizeQtyItem)
    .filter((it) => it.itemId > 0);
}

type WorkOrderItemInput = QtyItemInput & {
  cost?: number | string;
  description?: string;
  status?: string;
};

/**
 * Daftar baris perintah kerja dari JSON `items` (create+update, satu sumber).
 * `qty` -> `parseLocaleNumber`, `cost` (nominal uang) -> `parseMoneyAmount`;
 * cost kosong tetap 0, tak terbaca/negatif ditolak berpesan. Placeholder
 * itemId <= 0 tetap dibuang; description/status diteruskan apa adanya.
 */
function normalizeWorkOrderItems(
  raw: string | null | undefined,
): {
  itemId: number;
  qty: number;
  cost: number;
  description?: string;
  status?: string;
}[] {
  return (safeJsonParse<WorkOrderItemInput[]>(raw) ?? []).flatMap((it) => {
    const base = normalizeQtyItem(it);
    if (base.itemId === 0) return [];
    const cost =
      it.cost === undefined || it.cost === null || it.cost === ""
        ? 0
        : parseMoneyAmount(it.cost as string | number);
    if (cost === null || cost < 0)
      throw new Error("Biaya satuan tidak valid");
    return [
      {
        ...base,
        cost,
        ...(it.description !== undefined ? { description: it.description } : {}),
        ...(it.status !== undefined ? { status: it.status } : {}),
      },
    ];
  });
}

async function warehouseScopeFor(user: WarehouseActionUser) {
  return getWarehouseScope({ id: String(user.id), roles: user.roles });
}

async function assertRackIdInScope(user: WarehouseActionUser, rackId: number) {
  if (!Number.isSafeInteger(rackId) || rackId <= 0) throw new Error("Rak tidak valid");
  const scope = await warehouseScopeFor(user);
  if (scope.kind === "all") return;
  const rack = await prisma.rack.findUnique({
    where: { id: rackId },
    select: { warehouseId: true },
  });
  if (!rack) throw new Error("Rak tidak ditemukan");
  assertWarehouseAccess(scope, rack.warehouseId);
}

async function assertRackRowIdInScope(user: WarehouseActionUser, rowId: number) {
  if (!Number.isSafeInteger(rowId) || rowId <= 0) throw new Error("Baris rak tidak valid");
  const scope = await warehouseScopeFor(user);
  if (scope.kind === "all") return;
  const rackRow = await prisma.rackRow.findUnique({
    where: { id: rowId },
    select: { rack: { select: { warehouseId: true } } },
  });
  if (!rackRow) throw new Error("Baris rak tidak ditemukan");
  assertWarehouseAccess(scope, rackRow.rack.warehouseId);
}

async function assertWarehouseIdInScope(user: WarehouseActionUser, warehouseId: number) {
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) throw new Error("Gudang tidak valid");
  assertWarehouseAccess(await warehouseScopeFor(user), warehouseId);
}

function assertUniqueAdjustmentItems(items: { itemId: number }[]) {
  const seen = new Set<number>();
  for (const item of items) {
    const itemId = Number(item.itemId);
    if (seen.has(itemId)) {
      throw new Error(`Item #${itemId} hanya boleh dicantumkan satu kali dalam penyesuaian.`);
    }
    seen.add(itemId);
  }
}

// ID desimal murni saja — pola repo (/^[0-9]+$/ di route workflow/print/
// attachments/notifications + invoice-exchange.actions.ts parseId). Number()
// mentah menerima "0x10"->16, "1e3"->1000, "0b101"->5, " 5"->5: ID tak
// terduga lolos ke query.
function parseStrictId(raw: FormDataEntryValue | string | null): number | null {
  const str = String(raw ?? "");
  if (!/^[0-9]+$/.test(str)) return null;
  const value = Number(str);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Qty desimal wajar dari form — tolak kosong/NaN/tak hingga (keputusan: pesan "Qty tidak valid"). */
function parseStrictQty(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const str = String(raw);
  if (!/^[0-9]+(\.[0-9]+)?$/.test(str)) return null;
  const value = Number(str);
  return Number.isFinite(value) ? value : null;
}

type AdjustmentItemInput = {
  itemId: number;
  currentQty?: number | string;
  newQty: number | string;
  unitCost?: number | string;
  reason?: string;
  serialNumbers?: string[];
};

/**
 * Normalisasi satu baris item penyesuaian stok dari JSON `items`.
 * `unitCost` nominal uang + `newQty` qty: wajib parser repo
 * (`parseMoneyAmount`/`parseLocaleNumber`) — `Number("2.000.000")` = 2 dan
 * `Number("2.000")` = 2 merusak `unitCost`/`totalCost`/`actualQty` diam-diam
 * (pola sama createRemnant di file ini). Kosong/tak terbaca/negatif ditolak
 * berpesan, bukan diam-diam 0; kosong `unitCost` tetap 0 (biaya opsional).
 */
function normalizeAdjustmentItem(it: AdjustmentItemInput): {
  itemId: number;
  actualQty: number;
  unitCost: number;
  reason?: string;
  serialNumbers?: string[];
} {
  // Baris tanpa newQty (fixture/klien lama qty/cost) berperilaku lama: 0.
  const actualQty =
    it.newQty === undefined || it.newQty === null || it.newQty === ""
      ? 0
      : parseLocaleNumber(it.newQty as string | number);
  if (actualQty === null)
    throw new Error("Kuantitas fisik (actual) tidak valid");
  if (actualQty < 0)
    throw new Error("Kuantitas fisik (actual) tidak boleh negatif");
  const unitCost =
    it.unitCost === undefined || it.unitCost === null || it.unitCost === ""
      ? 0
      : parseMoneyAmount(it.unitCost as string | number);
  if (unitCost === null || unitCost < 0)
    throw new Error("Biaya satuan tidak valid");
  return {
    itemId: Number(it.itemId),
    actualQty,
    unitCost,
    reason: it.reason,
    serialNumbers: it.serialNumbers,
  };
}

// ==================== STOCK ADJUSTMENT ACTIONS ====================

export async function createStockAdjustment(formData: FormData) {
  try {
    const user = await requirePermission("create_stock_adjustments");

    const parsed = parseFormData(stockAdjustmentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal penyesuaian harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, v.warehouseId);

    const documentNo = await generateDocumentNumber("ADJ");

    const adjItems = (
      safeJsonParse<AdjustmentItemInput[]>(v.items ?? null) ?? []
    ).filter((it) => Number(it.itemId) > 0);
    assertUniqueAdjustmentItems(adjItems);
    const adjRows = adjItems.map(normalizeAdjustmentItem);

    // Fetch latest system quantity for each item in the warehouse to prevent
    // client-side tampering of 'currentQty'.
    // Since Silengkap calculates stock dynamically from StockMove:
    const itemIds = adjRows.map((it) => it.itemId);
    const stockMoves = await prisma.stockMove.groupBy({
      by: ["itemId", "impact"],
      where: {
        warehouseId: v.warehouseId,
        itemId: { in: itemIds },
        status: "posted",
      },
      _sum: { qty: true },
    });
    const stockMap = new Map<number, number>();
    for (const s of stockMoves) {
      const current = stockMap.get(s.itemId) || 0;
      const change = Number(s._sum.qty || 0);
      stockMap.set(
        s.itemId,
        s.impact === "IN" ? current + change : current - change,
      );
    }

    const adjustment = await prisma.stockAdjustment.create({
      data: {
        documentNo,
        slug: await nextSlug("stockAdjustment", documentNo),
        warehouseId: v.warehouseId,
        date: wibDateToUtcMidnight(v.date),
        reason: v.reason ?? null,
        type: v.type || "increase",
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: adjRows.map((it) => {
            const systemQty = Number(stockMap.get(it.itemId) || 0);
            const difference = safeSubtract(it.actualQty, systemQty, 0);
            return {
              itemId: it.itemId,
              serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers : undefined,
              systemQty,
              actualQty: it.actualQty,
              difference,
              unitCost: it.unitCost,
              totalCost: safeMultiply(difference, it.unitCost, 0),
              notes: it.reason || null,
            };
          }),
        },
      },
    });

    await logActivity(
      "create",
      "StockAdjustment",
      adjustment.id,
      `Membuat penyesuaian stok #${adjustment.id}`,
    );
    // P0-3: ajukan ke alur persetujuan bila workflow StockAdjustment
    // dikonfigurasi. Tanpa baris ini assertApproved di bawah tak pernah
    // bisa menahan (tanpa record = lolos) — pola sama dengan Expense/Asset.
    await requestApprovalIfConfigured("StockAdjustment", adjustment.id, Number(user.id));
    revalidatePath("/inventaris/penyesuaian");
    return { success: true, id: adjustment.id, slug: adjustment.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createStockAdjustment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function processStockAdjustment(adjustmentId: number) {
  try {
    const user = await requirePermission("process_stock_adjustments");

    const adjustment = await prisma.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      include: { items: true },
    });

    // Lapis-2: gagal terlihat bila tanggal dokumen di periode tertutup.
    await assertPeriodOpen(adjustment.date);

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, adjustment.warehouseId);

    if (adjustment.status !== "draft") {
      throw new Error("Adjustment hanya bisa diproses dari status draft");
    }

    // P0-3: proses menuntut persetujuan eksplisit. Tanpa workflow yang
    // dikonfigurasi ini no-op (mundur kompatibel); bila workflow ada dan
    // belum approved → tolak. Menutup lubang self-approve: sebelumnya siapa
    // pun berizin process bisa menulis stok + jurnal tanpa pemeriksa kedua.
    await assertApproved("StockAdjustment", adjustmentId);

    // Atomic conditional claim — serialize concurrent process requests so only
    // one caller creates stock moves and journal; duplicates get a clean error
    // instead of silently doubling stock movement.
    const claim = await prisma.stockAdjustment.updateMany({
      where: { id: adjustmentId, status: "draft" },
      data: { status: "processing" },
    });
    if (claim.count === 0) {
      // Either already processed by another request or not in draft status.
      const current = await prisma.stockAdjustment.findUnique({
        where: { id: adjustmentId },
        select: { status: true },
      });
      throw new Error(
        current
          ? `Penyesuaian stok sudah berstatus ${current.status}`
          : "Penyesuaian stok tidak ditemukan",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // F-2026-10-22-081-S cabang penutupan selisih transfer (Q-TP-3):
        // adjustment tertaut transfer diproses sebagai JURNAL SAJA lewat
        // service existing (akun kosong = throw = rollback, AC-TP-5).
        // Sisa dihitung ULANG server-side dari baris transfer + carried
        // cost OUT di dalam tx — angka baris adjustment tidak dipercaya.
        // Nol StockMove/layer: stok sisa sudah OUT dari sumber dan tidak
        // pernah masuk tujuan. Transfer menjadi received di tx yang sama.
        if (adjustment.inventoryTransferId != null) {
          if (adjustment.reason !== TRANSFER_SHORTAGE_REASON) {
            throw new Error("Penyesuaian tertaut transfer wajib beralasan \"selisih transfer\".");
          }
          const transferId = adjustment.inventoryTransferId;
          await tx.$queryRaw`SELECT id FROM inventory_transfers WHERE id = ${transferId} FOR UPDATE`;
          const transfer = await tx.inventoryTransfer.findUniqueOrThrow({
            where: { id: transferId },
            include: { items: true },
          });
          if (transfer.status !== "processed" && transfer.status !== "partially_received") {
            throw new Error("Transfer tertaut sudah tertutup; penutupan selisih tidak bisa diproses.");
          }
          const [receiptItems, outMoves] = await Promise.all([
            tx.inventoryTransferReceiptItem.findMany({
              where: { receipt: { inventoryTransferId: transferId } },
              select: { inventoryTransferItemId: true, serialNumbers: true },
            }),
            tx.stockMove.findMany({
              where: {
                referenceType: "InventoryTransfer",
                referenceId: transferId,
                impact: "OUT",
                status: "posted",
              },
              select: { itemId: true, cost: true },
            }),
          ]);
          const shortage = buildShortageLines(
            transfer.items.map((it) => ({
              id: it.id,
              itemId: it.itemId,
              qty: Number(it.qty),
              receivedQty: Number(it.receivedQty),
              serialNumbers: parseStoredSerials(it.serialNumbers),
            })),
            groupReceivedSerialsByLine(receiptItems),
            carriedCostMapFromOutMoves(outMoves),
          );
          if (shortage.length === 0) {
            throw new Error("Transfer tertaut tidak lagi memiliki sisa untuk ditutup.");
          }
          await stockJournalService.onStockAdjustment(
            tx,
            shortage.map((line) => ({
              qty: -line.remainingQty,
              cost: line.unitCost,
              difference: -line.remainingQty,
            })),
            adjustment.documentNo,
            adjustmentId,
            Number(user.id),
            adjustment.date,
          );
          const closureJournal = await tx.journal.findFirst({
            where: { referenceType: "StockAdjustment", referenceId: adjustmentId, deletedAt: null },
            orderBy: { id: "desc" },
            select: { id: true },
          });
          if (!closureJournal) {
            throw new Error("Jurnal penutupan selisih tidak terbentuk; penutupan dibatalkan.");
          }
          await tx.stockAdjustment.update({
            where: { id: adjustmentId },
            data: { status: "processed", journalId: closureJournal.id },
          });
          await tx.inventoryTransfer.update({
            where: { id: transferId },
            data: { status: "received" },
          });
          if (transfer.materialRequestId) {
            await refreshMaterialRequestFulfillmentTx(tx, transfer.materialRequestId);
          }
          return;
        }

        // Hook creates Stock Moves IN/OUT per item + Accounting journal
        await onStockAdjustmentStock(adjustmentId, Number(user.id), tx);

        // Hook memposting jurnal dengan referenceType/referenceId=StockAdjustment
        // tetapi tak mengembalikan id-nya, sehingga `StockAdjustment.journalId`
        // (kolomnya ada di skema) tak pernah terisi dan dokumen tak bisa menautkan
        // jurnalnya. Ambil jurnal yang baru dibuat di dalam transaksi yang sama,
        // lalu simpan; kalau hook tidak membuat jurnal (nilai net 0 / akun belum
        // dipetakan) `journalId` dibiarkan apa adanya, bukan ditulis null.
        const journal = await tx.journal.findFirst({
          where: { referenceType: "StockAdjustment", referenceId: adjustmentId, deletedAt: null },
          orderBy: { id: "desc" },
          select: { id: true },
        });

        // Update status from processing → processed
        await tx.stockAdjustment.update({
          where: { id: adjustmentId },
          data: {
            status: "processed",
            ...(journal ? { journalId: journal.id } : {}),
          },
        });
      });
    } catch (e) {
      // Tx failed after the claim flipped draft -> processing. Restore the
      // claim so the user can retry instead of leaving the adjustment
      // permanently stranded in "processing" (where the action refuses to
      // re-process and the UI offers no way to roll back). Mirrors the
      // reverseJournal POSTED -> REVERSING claim rollback.
      await prisma.stockAdjustment.updateMany({
        where: { id: adjustmentId, status: "processing" },
        data: { status: "draft" },
      });
      throw e;
    }

    await logActivity(
      "process",
      "StockAdjustment",
      adjustmentId,
      `Memproses penyesuaian stok #${adjustmentId}`,
    );
    revalidatePath("/inventaris/penyesuaian");
    revalidatePath("/inventaris/mutasi-stok");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[processStockAdjustment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== INVENTORY TRANSFER ACTIONS ====================

export async function createInventoryTransfer(formData: FormData) {
  try {
    const user = await requirePermission("create_inventory_transfers");

    const parsed = parseFormData(inventoryTransferSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal transfer harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccessMulti(warehouseScope, [v.sourceWarehouseId, v.destinationWarehouseId]);

    const documentNo = await generateDocumentNumber("TRF");

    const transferItems = normalizeQtyItems(v.items);

    const transfer = await prisma.inventoryTransfer.create({
      data: {
        documentNo,
        slug: await nextSlug("inventoryTransfer", documentNo),
        sourceWarehouseId: v.sourceWarehouseId,
        destinationWarehouseId: v.destinationWarehouseId,
        date: wibDateToUtcMidnight(v.date),
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: transferItems.map((it) => ({
            itemId: it.itemId,
            qty: it.qty,
          })),
        },
      },
    });

    await logActivity(
      "create",
      "InventoryTransfer",
      transfer.id,
      `Membuat transfer inventaris #${transfer.id}`,
    );
    revalidatePath("/inventaris/transfer");
    return { success: true, id: transfer.id, slug: transfer.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createInventoryTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function processInventoryTransfer(transferId: number) {
  try {
    const user = await requirePermission("edit_inventory_transfers");

    const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id: transferId },
    });

    // Lapis-2: gagal terlihat bila tanggal dokumen di periode tertutup.
    await assertPeriodOpen(transfer.date);

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, transfer.sourceWarehouseId);

    if (transfer.status !== "draft") {
      throw new Error("Transfer hanya bisa diproses dari status draft");
    }

    // Atomic conditional claim — serialize concurrent process requests; only one
    // caller creates OUT stock moves; duplicates get a clean error instead of
    // silently doubling the outbound movement.
    const claim = await prisma.inventoryTransfer.updateMany({
      where: { id: transferId, status: "draft" },
      data: { status: "processing" },
    });
    if (claim.count === 0) {
      const current = await prisma.inventoryTransfer.findUnique({
        where: { id: transferId },
        select: { status: true },
      });
      throw new Error(
        current
          ? `Transfer sudah berstatus ${current.status}`
          : "Transfer tidak ditemukan",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Hook creates OUT stock moves (idempotent); action owns status processed.
        await onInventoryTransferProcessed(transferId, Number(user.id), tx);

        await tx.inventoryTransfer.update({
          where: { id: transferId },
          data: { status: "processed" },
        });
      });
    } catch (e) {
      // Tx failed after the claim flipped draft -> processing. Restore the claim
      // so the transfer can be retried instead of being stranded in "processing"
      // (the action refuses to re-process it and receive requires "processed").
      await prisma.inventoryTransfer.updateMany({
        where: { id: transferId, status: "processing" },
        data: { status: "draft" },
      });
      throw e;
    }

    await logActivity(
      "process",
      "InventoryTransfer",
      transferId,
      `Memproses transfer inventaris #${transferId}`,
    );
    revalidatePath("/inventaris/transfer");
    revalidatePath("/inventaris/mutasi-stok");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[processInventoryTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Payload kejadian terima parsial (F-2026-10-22-081-S). FormData kosong /
 * tanpa field items = perilaku lama terima penuh (kompatibel pemanggil
 * existing). Field: receivedDate (dateOnly, default hari ini),
 * idempotencyKey (wajib per submit), items JSON
 * [{transferItemId, qty, serialNumbers?, batchAllocations?}].
 */
function parseReceiptFormData(formData: FormData | undefined): {
  receivedDate: Date;
  idempotencyKey: string;
  lines: ReceiptLineInput[];
} | null {
  if (!formData) return null;
  const rawItems = formData.get("items");
  const rawKey = formData.get("idempotencyKey");
  if ((rawItems === null || rawItems === "") && (rawKey === null || rawKey === "")) return null;

  const idempotencyKey = String(rawKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 191) {
    throw new Error("Kunci idempotency penerimaan wajib diisi (8-191 karakter).");
  }
  const rawDate = formData.get("receivedDate");
  let receivedDate = new Date();
  if (rawDate !== null && rawDate !== "") {
    const parsedDate = dateOnly.safeParse(String(rawDate));
    if (!parsedDate.success) throw new Error("Tanggal terima tidak valid.");
    receivedDate = wibDateToUtcMidnight(parsedDate.data);
  }
  const parsedItems = safeJsonParse<
    {
      transferItemId?: number | string;
      qty?: number | string;
      serialNumbers?: unknown;
      batchAllocations?: unknown;
    }[]
  >(rawItems === null ? null : String(rawItems));
  if (!Array.isArray(parsedItems)) throw new Error("Baris penerimaan tidak valid.");
  const lines: ReceiptLineInput[] = parsedItems.map((it) => {
    const transferItemId = parseLocaleNumber(it.transferItemId as string | number);
    if (transferItemId === null || !Number.isInteger(transferItemId) || transferItemId <= 0) {
      throw new Error("Baris transfer tidak valid.");
    }
    const qty = parseLocaleNumber(it.qty as string | number);
    if (qty === null) throw new Error("Qty diterima tidak valid.");
    const serialNumbers = Array.isArray(it.serialNumbers)
      ? it.serialNumbers.map((s) => String(s))
      : undefined;
    const batchAllocations = Array.isArray(it.batchAllocations)
      ? it.batchAllocations.map((b) => {
          const alloc = (b ?? {}) as { batchNumber?: unknown; qty?: unknown };
          const batchQty = parseLocaleNumber(alloc.qty as string | number);
          if (batchQty === null) throw new Error("Qty alokasi batch tidak valid.");
          return { batchNumber: String(alloc.batchNumber ?? ""), qty: batchQty };
        })
      : undefined;
    return {
      transferItemId,
      qty,
      ...(serialNumbers ? { serialNumbers } : {}),
      ...(batchAllocations ? { batchAllocations } : {}),
    };
  });
  return { receivedDate, idempotencyKey, lines };
}

export async function receiveInventoryTransfer(transferId: number, formData?: FormData) {
  try {
    const user = await requirePermission("edit_inventory_transfers");

    const receiptInput = parseReceiptFormData(formData);

    const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id: transferId },
    });

    // Retry submit yang sama (BR-TP-06): kejadian sudah tercatat -> sukses
    // idempoten tanpa mutasi ulang. Kunci milik transfer lain = tabrakan.
    if (receiptInput) {
      const prior = await prisma.inventoryTransferReceipt.findUnique({
        where: { idempotencyKey: receiptInput.idempotencyKey },
        select: { inventoryTransferId: true },
      });
      if (prior) {
        if (prior.inventoryTransferId !== transferId) {
          throw new Error("Kunci idempotency sudah dipakai penerimaan transfer lain.");
        }
        return { success: true, idempotent: true };
      }
    }

    // Lapis-2: gagal terlihat bila tanggal KEJADIAN terima (parsial) atau
    // tanggal dokumen (penuh, perilaku existing) di periode tertutup.
    await assertPeriodOpen(receiptInput ? receiptInput.receivedDate : transfer.date);

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, transfer.destinationWarehouseId);

    const receivableStatuses = receiptInput ? ["processed", "partially_received"] : ["processed"];
    if (!receivableStatuses.includes(transfer.status)) {
      throw new Error(
        receiptInput
          ? "Transfer hanya bisa diterima dari status processed atau partially_received"
          : "Transfer hanya bisa di-receive dari status processed",
      );
    }
    const priorStatus = transfer.status;

    // Atomic conditional claim — serialize concurrent receive requests; only one
    // caller creates IN stock moves; duplicates get a clean error instead of
    // silently doubling the inbound movement.
    const claim = await prisma.inventoryTransfer.updateMany({
      where: { id: transferId, status: priorStatus },
      data: { status: "receiving" },
    });
    if (claim.count === 0) {
      const current = await prisma.inventoryTransfer.findUnique({
        where: { id: transferId },
        select: { status: true },
      });
      throw new Error(
        current
          ? `Transfer sudah berstatus ${current.status}`
          : "Transfer tidak ditemukan",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Hook creates IN stock moves/layers; action owns the final status.
        // Both run in one tx so a failed status update rolls back the inbound
        // stock — otherwise stock could be added while the transfer stays
        // "receiving" and gets restored below, allowing a re-receive to
        // double the inbound.
        const nextStatus = await onInventoryTransferReceived(
          transferId,
          Number(user.id),
          tx,
          receiptInput ?? undefined,
        );

        await tx.inventoryTransfer.update({
          where: { id: transferId },
          data: { status: nextStatus ?? "received" },
        });

        // F-078-S BR-MR-04: permintaan tertaut dihitung ulang dari qty
        // DITERIMA kumulatif dalam tx yang sama (bukan dari transfer lahir).
        if (transfer.materialRequestId) {
          await refreshMaterialRequestFulfillmentTx(tx, transfer.materialRequestId);
        }
      });
    } catch (e) {
      // Receiving failed after the claim flipped to "receiving". Restore the
      // claim so the receiving can be retried instead of being stranded in
      // "receiving" (F-081-S: pulihkan ke status sebelum kejadian ini).
      await prisma.inventoryTransfer.updateMany({
        where: { id: transferId, status: "receiving" },
        data: { status: priorStatus },
      });
      // Balapan retry: unique idempotencyKey menabrak di dalam tx berarti
      // kejadian yang sama sudah tercatat oleh request pemenang.
      if (
        receiptInput &&
        e instanceof Error &&
        /idempotency/i.test(e.message) &&
        (await prisma.inventoryTransferReceipt.findUnique({
          where: { idempotencyKey: receiptInput.idempotencyKey },
          select: { inventoryTransferId: true },
        }))?.inventoryTransferId === transferId
      ) {
        return { success: true, idempotent: true };
      }
      throw e;
    }

    await logActivity(
      "receive",
      "InventoryTransfer",
      transferId,
      `Menerima transfer inventaris #${transferId}`,
    );
    revalidatePath("/inventaris/transfer");
    revalidatePath("/inventaris/mutasi-stok");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[receiveInventoryTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Keadaan baris + serial sudah diterima + carried cost OUT untuk penutupan. */
async function loadTransferShortageState(transferId: number) {
  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { items: true },
  });
  const [receiptItems, outMoves] = await Promise.all([
    prisma.inventoryTransferReceiptItem.findMany({
      where: { receipt: { inventoryTransferId: transferId } },
      select: { inventoryTransferItemId: true, serialNumbers: true },
    }),
    prisma.stockMove.findMany({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "OUT",
        status: "posted",
      },
      select: { itemId: true, cost: true },
    }),
  ]);
  const lineStates: TransferLineState[] = transfer.items.map((it) => ({
    id: it.id,
    itemId: it.itemId,
    qty: Number(it.qty),
    receivedQty: Number(it.receivedQty),
    serialNumbers: parseStoredSerials(it.serialNumbers),
  }));
  return {
    transfer,
    shortage: buildShortageLines(lineStates, groupReceivedSerialsByLine(receiptItems), carriedCostMapFromOutMoves(outMoves)),
  };
}

/**
 * Tutup Selisih (F-2026-10-22-081-S §1 langkah 4): lahirkan DRAF
 * StockAdjustment alasan persis "selisih transfer" tertaut transfer ini
 * di gudang tujuan. Transfer menjadi received HANYA saat draf itu
 * diproses (lihat cabang penutupan di processStockAdjustment); jurnal
 * lahir di titik itu saja (BR-TP-05). Satu draf aktif per transfer.
 */
export async function closeInventoryTransferShortage(transferId: number) {
  try {
    const user = await requirePermission("create_stock_adjustments");

    const { transfer, shortage } = await loadTransferShortageState(transferId);

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, transfer.destinationWarehouseId);

    if (transfer.status !== "processed" && transfer.status !== "partially_received") {
      throw new Error("Tutup selisih hanya untuk transfer yang masih dalam perjalanan.");
    }
    if (shortage.length === 0) {
      throw new Error("Transfer ini tidak memiliki sisa belum diterima untuk ditutup.");
    }

    const activeClosure = await prisma.stockAdjustment.findFirst({
      where: {
        inventoryTransferId: transferId,
        status: { in: ["draft", "processing", "processed"] },
        deletedAt: null,
      },
      select: { id: true, documentNo: true, status: true },
    });
    if (activeClosure) {
      throw new Error(
        `Penutupan selisih untuk transfer ini sudah ada (${activeClosure.documentNo}, status ${activeClosure.status}).`,
      );
    }

    const date = new Date();
    await assertPeriodOpen(date);

    // Agregasi per item (penjaga baris adjustment: satu baris per item).
    const byItem = new Map<number, { qty: number; received: number; unitCost: number; serials: string[] }>();
    for (const line of shortage) {
      const agg = byItem.get(line.itemId) ?? { qty: 0, received: 0, unitCost: line.unitCost, serials: [] };
      agg.qty += line.remainingQty;
      agg.serials.push(...line.serialNumbers);
      byItem.set(line.itemId, agg);
    }
    const sentByItem = new Map<number, { qty: number; receivedQty: number }>();
    for (const it of transfer.items) {
      const agg = sentByItem.get(it.itemId) ?? { qty: 0, receivedQty: 0 };
      agg.qty += Number(it.qty);
      agg.receivedQty += Number(it.receivedQty);
      sentByItem.set(it.itemId, agg);
    }

    const documentNo = await generateDocumentNumber("ADJ");
    const adjustment = await prisma.stockAdjustment.create({
      data: {
        documentNo,
        slug: await nextSlug("stockAdjustment", documentNo),
        warehouseId: transfer.destinationWarehouseId,
        date,
        reason: TRANSFER_SHORTAGE_REASON,
        type: "decrease",
        notes: `Penutupan selisih transfer ${transfer.documentNo}`,
        status: "draft",
        createdBy: Number(user.id),
        inventoryTransferId: transferId,
        items: {
          create: Array.from(byItem.entries()).map(([itemId, agg]) => {
            const sent = sentByItem.get(itemId) ?? { qty: agg.qty, receivedQty: 0 };
            return {
              itemId,
              systemQty: sent.qty,
              actualQty: sent.receivedQty,
              difference: -agg.qty,
              unitCost: agg.unitCost,
              totalCost: -agg.qty * agg.unitCost,
              serialNumbers: agg.serials.length > 0 ? agg.serials : undefined,
              notes: TRANSFER_SHORTAGE_REASON,
            };
          }),
        },
      },
    });

    await requestApprovalIfConfigured("StockAdjustment", adjustment.id, Number(user.id));
    await logActivity(
      "create",
      "StockAdjustment",
      adjustment.id,
      `Membuat penutupan selisih transfer #${transferId}`,
    );
    revalidatePath("/inventaris/penyesuaian");
    revalidatePath("/inventaris/transfer");
    return { success: true, id: adjustment.id, slug: adjustment.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[closeInventoryTransferShortage]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== MATERIAL ISSUE ACTIONS ====================


/** F-008: baris payload MI bersama create/update — parse + validasi scrap draft. */
type MaterialIssuePayloadItem = {
  itemId: number; qty: number; unitCost: number; cost: number;
  scrapQty?: number; scrapReasonCode?: string | null; scrapNote?: string | null;
};

function parseMaterialIssuePayloadItems(raw: string | null | undefined): MaterialIssuePayloadItem[] {
  const rawItems = safeJsonParse<{
    itemId: number | string; qty?: number | string;
    unitCost?: number | string; cost?: number | string;
    scrapQty?: number | string; scrapReasonCode?: string | null; scrapNote?: string | null;
  }[]>(raw ?? null) ?? [];
  const items: MaterialIssuePayloadItem[] = [];
  for (const it of rawItems) {
    const base = normalizeQtyItem(it);
    if (base.itemId === 0) continue;
    // unitCost nominal uang -> parseMoneyAmount; kosong tetap 0 (biaya
    // opsional, pola StockAdjustment), tak terbaca/negatif ditolak berpesan.
    const rawCost = it.unitCost ?? it.cost;
    const cost = rawCost === undefined || rawCost === null || rawCost === ""
      ? 0
      : parseMoneyAmount(rawCost as string | number);
    if (cost === null || cost < 0) throw new Error("Biaya satuan tidak valid");
    const scrapQty = it.scrapQty === undefined || it.scrapQty === null || it.scrapQty === ""
      ? 0
      : parseLocaleNumber(it.scrapQty as string | number);
    if (scrapQty === null) throw new Error("Qty scrap tidak valid");
    items.push({
      itemId: base.itemId, qty: base.qty, unitCost: cost, cost,
      scrapQty, scrapReasonCode: it.scrapReasonCode ?? null, scrapNote: it.scrapNote ?? null,
    });
  }
  // Scrap draft divalidasi saat simpan juga (bukan hanya complete).
  for (const it of items) {
    const err = validateScrapInput({
      issueQty: it.qty, scrapQty: it.scrapQty ?? 0,
      scrapReasonCode: it.scrapReasonCode ?? null, scrapNote: it.scrapNote ?? null,
    });
    if (err) throw new Error(`Baris item #${it.itemId}: ${err}`);
  }
  return items;
}

function materialIssueItemCreateData(it: MaterialIssuePayloadItem, scrapPercentSnapshot: number | null) {
  return {
    itemId: it.itemId,
    qty: it.qty,
    cost: it.cost,
    scrapQty: it.scrapQty ?? 0,
    scrapReasonCode: it.scrapReasonCode ?? null,
    scrapNote: it.scrapNote ?? null,
    scrapPercentSnapshot,
  };
}

export async function createMaterialIssue(formData: FormData) {
  try {
    const user = await requirePermission("create_material_issues");

    const parsed = parseFormData(materialIssueSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal pengeluaran harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, v.warehouseId);

    const documentNo = await generateDocumentNumber("MI");

    const miItems = parseMaterialIssuePayloadItems(v.items);

    if (miItems.length === 0) {
      throw new Error(
        "Pengeluaran Material harus memiliki minimal 1 item dengan kuantitas > 0",
      );
    }

    // F-009-V: MI baru ke WO closed ditolak server (draft pun lahir beku).
    if (v.workOrderId) {
      await assertJobCostMutable({ workOrderId: v.workOrderId }, "dibuatkan pengeluaran materialnya")
    }

    const issue = await prisma.$transaction(async (tx) => {
      // WO-BR-004: guard anti-ganda setara jalur buat-dari-WO. Form manual
      // bisa menautkan WO yang sudah punya MI aktif — tanpa cek di sini MI
      // kedua lahir diam-diam (stok keluar dua kali). Batal/terhapus = boleh
      // pengganti; pola sama dgn UI detail WO (aktif = bukan batal).
      if (v.workOrderId) {
        await tx.$executeRaw`SELECT id FROM work_orders WHERE id = ${v.workOrderId} FOR UPDATE`;
        const existingMi = await tx.materialIssue.findFirst({
          where: { workOrderId: v.workOrderId, status: { not: "cancelled" } },
          select: { id: true, documentNo: true },
        });
        if (existingMi) {
          throw new Error(
            `Perintah Kerja ini sudah memiliki Pengeluaran Material (No: ${existingMi.documentNo}).`,
          );
        }
      }
      // F-008: snapshot allowance beku saat baris lahir (resolver bersama).
      const snapshotByItem = await resolveMaterialIssueScrapSnapshots(
        tx, miItems.map((it) => ({ itemId: Number(it.itemId) })), v.workOrderId ?? null,
      );
      return tx.materialIssue.create({
        data: {
          documentNo,
          slug: await nextSlug("materialIssue", documentNo),
          warehouseId: v.warehouseId,
          projectId: v.projectId ?? null,
          workOrderId: v.workOrderId ?? null,
          costCenterId: v.costCenterId ?? null,
          date: wibDateToUtcMidnight(v.date),
          notes: v.notes ?? null,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: miItems.map((it) =>
              materialIssueItemCreateData(it, snapshotByItem.get(Number(it.itemId)) ?? null),
            ),
          },
        },
      });
    });

    await logActivity(
      "create",
      "MaterialIssue",
      issue.id,
      `Membuat pengeluaran material #${issue.id}`,
    );
    revalidatePath("/inventaris/pengeluaran-material");
    return { success: true, id: issue.id, slug: issue.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createMaterialIssue]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function completeMaterialIssue(issueId: number) {
  try {
    const user = await requirePermission("edit_material_issues");

    const issue = await prisma.materialIssue.findUniqueOrThrow({
      where: { id: issueId },
    });

    // Lapis-2: gagal terlihat bila tanggal dokumen di periode tertutup.
    await assertPeriodOpen(issue.date);

    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccess(warehouseScope, issue.warehouseId);

    if (issue.status !== "draft") {
      throw new Error(
        "Pengeluaran Material hanya bisa diselesaikan dari status draf",
      );
    }

    // Atomic conditional claim — serialize concurrent complete requests so only one
    // caller triggers stock moves and journal; duplicates get a clean error.
    const claim = await prisma.materialIssue.updateMany({
      where: { id: issueId, status: "draft" },
      data: { status: "processing" },
    });
    if (claim.count === 0) {
      const current = await prisma.materialIssue.findUnique({
        where: { id: issueId },
        select: { status: true },
      });
      throw new Error(
        current
          ? `Pengeluaran Material sudah berstatus ${statusLabel(current.status)}`
          : "Pengeluaran Material tidak ditemukan",
      );
    }

    // P1-4: guard silang arah sebaliknya. MI tertaut WO yang PO-nya sudah
    // mengonsumsi material (actualQty > 0) tidak boleh diselesaikan — jalur
    // PO sudah mengeluarkan material yang sama. Dicek setelah klaim agar
    // serial dengan complete konkuren. Klaim dikembalikan ke draft sebelum
    // menolak agar bisa dicoba lagi setelah jalur diluruskan.
    const issueWo = await prisma.materialIssue.findUniqueOrThrow({
      where: { id: issueId },
      select: { workOrderId: true },
    });
    if (issueWo.workOrderId != null) {
      // F-009-V: MI draft lama ke WO yang kini closed ikut beku saat complete.
      try {
        await assertJobCostMutable({ workOrderId: issueWo.workOrderId }, "diselesaikan pengeluaran materialnya")
      } catch (closedErr) {
        await prisma.materialIssue.updateMany({
          where: { id: issueId, status: "processing" },
          data: { status: "draft" },
        });
        throw closedErr;
      }
    }
    if (issueWo.workOrderId != null) {
      const poConsumed = await prisma.productionOrderMaterial.aggregate({
        where: {
          productionOrder: { workOrderId: issueWo.workOrderId },
          actualQty: { gt: 0 },
        },
        _sum: { actualQty: true },
      });
      if (Number(poConsumed._sum.actualQty ?? 0) > 0) {
        await prisma.materialIssue.updateMany({
          where: { id: issueId, status: "processing" },
          data: { status: "draft" },
        });
        throw new Error(
          "WO ini sudah dikonsumsi via perintah produksi — batalkan/void MI ini dan gunakan jalur PO.",
        );
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Hook creates Stock Moves OUT per item + Accounting journal
        await onMaterialIssueStock(issueId, Number(user.id), tx);
        // F-2026-10-22-072-S (Q-IP-1): MI proyek tanpa WO melahirkan
        // registri part di tx yang sama bila proyek ber-kendaraan; MI
        // taut WO dilewati service (lahir saat WO selesai), MI bebas
        // tidak ditebak kendaraannya.
        await createInstalledPartsForMaterialIssue(issueId, tx);
      });
    } catch (e) {
      // Complete failed after the claim flipped draft -> processing. The hook
      // updates the status to "completed" inside the same tx, so on failure
      // neither update happened. Restore the claim so the user can retry
      // instead of leaving the material issue permanently stranded in
      // "processing" (where the action refuses to re-process).
      await prisma.materialIssue.updateMany({
        where: { id: issueId, status: "processing" },
        data: { status: "draft" },
      });
      throw e;
    }

    await logActivity(
      "complete",
      "MaterialIssue",
      issueId,
      `Menyelesaikan pengeluaran material #${issueId}`,
    );
    revalidatePath("/inventaris/pengeluaran-material");
    revalidatePath("/inventaris/mutasi-stok");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[completeMaterialIssue]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== WORK ORDER ACTIONS ====================

export async function createWorkOrder(formData: FormData) {
  try {
    const user = await requirePermission("create_work_orders");

    // Migrated to parseFormData(workOrderSchema) — the previous hand-parsed path
    // (safeId/requireId/new Date(...)) bypassed schema validation: blank dates
    // became Invalid Date, required customerId was silently dropped, and the
    // optional startDate/endDate sent by the form were ignored entirely even
    // though the Prisma model has the columns.
    const parsed = parseFormData(workOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("WO");
    const items = normalizeWorkOrderItems(v.items ?? null);

    const wo = await prisma.workOrder.create({
      data: {
        documentNo,
        slug: await nextSlug("workOrder", documentNo),
        quotationId: v.quotationId ?? null,
        projectId: v.projectId ?? null,
        customerId: v.customerId,
        date: wibDateToUtcMidnight(v.date),
        // Persist optional schedule dates the form sends. Previously dropped
        // silently — the column was nullable but the action never read it.
        startDate: v.startDate ? wibDateToUtcMidnight(v.startDate) : null,
        endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: items.map((i) => ({
            itemId: i.itemId,
            qty: i.qty,
            cost: i.cost,
            description: i.description || null,
            status: i.status || "pending",
          })),
        },
      },
    });

    // F-2026-10-22-063-S: snapshot PERINGATAN fitment baris (tak memblokir).
    await stampWorkOrderFitmentSnapshot(prisma, wo.id);

    await logActivity(
      "create",
      "WorkOrder",
      wo.id,
      `Membuat perintah kerja #${wo.id}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true, id: wo.id, slug: wo.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// F-2026-10-21-035: daftar tertutup alasan geser endDate =
// WORK_ORDER_END_DATE_REASONS di inventory.schemas (dipakai juga UI).
const endDateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/**
 * Validasi alasan geser endDate (Q-LEAD-2): wajib HANYA bila nilai lama
 * non-null dan tanggal baru berbeda (maju/mundur/dikosongkan). Pengisian
 * pertama dari null bukan "geser" — tanpa alasan wajib. `other` wajib teks
 * pendamping; 6 kode lain teks opsional. Return pesan error atau null.
 */
function endDateReasonError(
  oldEndDate: Date | null | undefined,
  newEndDate: Date | null,
  reasonCode?: string,
  reasonNote?: string,
): string | null {
  const oldStr = endDateOnly(oldEndDate);
  if (oldStr === null || oldStr === endDateOnly(newEndDate)) return null;
  if (!reasonCode) {
    return "Alasan wajib diisi bila estimasi selesai (endDate) digeser dari tanggal yang sudah ditetapkan";
  }
  if (!(reasonCode in WORK_ORDER_END_DATE_REASONS)) {
    return "Alasan geser estimasi selesai tidak dikenal";
  }
  if (reasonCode === "other" && !reasonNote?.trim()) {
    return "Catatan alasan wajib diisi bila memilih alasan Lainnya";
  }
  return null;
}

/**
 * Tulis SATU baris histori geser endDate: action work_order_end_date_changed,
 * oldValues/newValues hanya {endDate}, metadata {reasonCode, reasonNote?}.
 * Baris pertama yang juga ditulis untuk pengisian dari null (reasonCode
 * kosong). `logActivity` existing tidak bisa dipakai — ia tidak menulis
 * oldValues/newValues.
 *
 * Return { success } berisi penanda eksplisit. Gagal tulis TIDAK melempar
 * ({ success: false } + console.error berkonteks, pola
 * reportPostCommitAuditFailure): update WO yang sudah commit tidak boleh
 * dilaporkan gagal gara-gara jejak audit.
 */
async function writeWorkOrderEndDateLog(args: {
  userId: number;
  workOrderId: number;
  oldEndDate: Date | null | undefined;
  newEndDate: Date | null;
  reasonCode?: string;
  reasonNote?: string;
}): Promise<{ success: boolean }> {
  const oldStr = endDateOnly(args.oldEndDate);
  const newStr = endDateOnly(args.newEndDate);
  const label = args.reasonCode
    ? WORK_ORDER_END_DATE_REASONS[args.reasonCode as WorkOrderEndDateReasonCode]
    : undefined;
  const metadata: Record<string, string> = {};
  if (args.reasonCode) metadata.reasonCode = args.reasonCode;
  if (args.reasonNote?.trim()) metadata.reasonNote = args.reasonNote.trim();
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        action: "work_order_end_date_changed",
        modelType: "WorkOrder",
        modelId: args.workOrderId,
        description: `Estimasi selesai digeser dari ${oldStr ?? "-"} ke ${newStr ?? "-"}${label ? ` — ${label}` : ""}`,
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        oldValues: { endDate: oldStr },
        newValues: { endDate: newStr },
      },
    });
    return { success: true };
  } catch (logError) {
    console.error("[workOrderEndDate] gagal menulis histori endDate", logError);
    return { success: false };
  }
}

export async function updateWorkOrder(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_work_orders");

    // Status guard: only editable in pre-processing states. Without this, a
    // work order that has already been started (`in_progress`) or completed
    // (`completed`) could be silently re-edited — its items get deleted and
    // recreated, breaking the audit trail, the linked Delivery Order, the
    // Material Issue stock movements, and the project stage progress. The
    // companion `updateProductionOrder` enforces the same rule. Status is
    // re-checked inside the transaction to close the TOCTOU window between
    // the initial guard and the actual update (the previous test
    // `update-work-order-guard.test.ts` proves the guard fires).
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
    if (wo.status !== "draft" && wo.status !== "pending") {
      throw new Error(
        `Perintah Kerja tidak bisa diperbarui dengan status '${wo.status}'. Hanya status 'draft' atau 'pending' yang dapat diperbarui.`,
      );
    }

    // Migrated to parseFormData(workOrderSchema) — the previous hand-parsed path
    // bypassed schema validation (required customerId, non-empty date, optional
    // startDate/endDate) and dropped the form's schedule dates silently.
    const parsed = parseFormData(workOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // F-2026-10-21-035: histori geser endDate. Nilai tersimpan dibandingkan
    // dengan nilai form (konversi yang sama persis dengan write path di
    // bawah) dalam date-only YYYY-MM-DD — format yang sama dengan input
    // `v.endDate` dari form. Null ↔ tanggal terisi juga perubahan.
    const newEndDate = v.endDate ? wibDateToUtcMidnight(v.endDate) : null;
    const endDateChanged =
      (wo.endDate?.toISOString().slice(0, 10) ?? null) !==
      (newEndDate?.toISOString().slice(0, 10) ?? null);

    // Vonis Lead Q-LEAD-2: geser dari nilai non-null wajib alasan tertutup.
    // Tolak SEBELUM transaksi — WO tidak berubah sama sekali.
    if (endDateChanged) {
      const reasonError = endDateReasonError(
        wo.endDate,
        newEndDate,
        v.endDateReasonCode,
        v.endDateReasonNote,
      );
      if (reasonError) return { success: false, error: reasonError };
    }

    const items = normalizeWorkOrderItems(v.items ?? null);

    await prisma.$transaction(async (tx) => {
      // Re-verify status inside the transaction (TOCTOU guard): two concurrent
      // edits could each read status=draft, both pass the pre-tx check, and
      // both reach this point. The conditional updateMany serializes them —
      // only the request that still sees the document in draft/pending wins.
      const claim = await tx.workOrder.updateMany({
        where: { id, status: { in: ["draft", "pending"] } },
        data: {
          slug: await nextSlug("workOrder", wo.documentNo, { excludeId: id }),
          customerId: v.customerId,
          quotationId: v.quotationId ?? null,
          // projectId tidak punya input di form WO (ia tautan dari alur proyek),
          // jadi menulis `?? null` memutus tautan itu setiap kali WO disimpan.
          ...(v.projectId !== undefined ? { projectId: v.projectId } : {}),
          date: wibDateToUtcMidnight(v.date),
          // Persist optional schedule dates the form sends. Previously dropped
          // silently — the column was nullable but the action never read it.
          startDate: v.startDate ? wibDateToUtcMidnight(v.startDate) : null,
          endDate: newEndDate,
          notes: v.notes ?? null,
        },
      });
      if (claim.count === 0) {
        throw new Error(
          `Perintah Kerja tidak bisa diperbarui: status sudah berubah menjadi '${wo.status === "draft" || wo.status === "pending" ? "tidak valid" : wo.status}'.`,
        );
      }

      // Recreate items with description and status
      await tx.workOrderItem.deleteMany({ where: { workOrderId: id } });
      if (items.length > 0) {
        await tx.workOrderItem.createMany({
          data: items.map((i) => ({
            workOrderId: id,
            itemId: i.itemId,
            qty: i.qty,
            cost: i.cost,
            description: i.description || null,
            status: i.status || "pending",
          })),
        });
      }

      // F-2026-10-22-063-S: evaluasi ulang snapshot fitment tiap simpan.
      await stampWorkOrderFitmentSnapshot(tx, id);
    });

    // F-2026-10-21-035: endDate berubah → tepat 1 baris histori
    // work_order_end_date_changed (oldValues/newValues kolom Json existing).
    if (endDateChanged) {
      await writeWorkOrderEndDateLog({
        userId: Number(user.id),
        workOrderId: id,
        oldEndDate: wo.endDate,
        newEndDate,
        reasonCode: v.endDateReasonCode,
        reasonNote: v.endDateReasonNote,
      });
    }

    await logActivity(
      "update",
      "WorkOrder",
      id,
      `Memperbarui perintah kerja #${id}`,
    );
    revalidatePath("/produksi/perintah-kerja");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Revisi item WO yang sedang berjalan (F-2026-10-20-06, sub-aman F-02).
 *
 * `updateWorkOrder` menolak WO `in_progress` (delete+recreate item merusak
 * jejak Material Issue). Aksi ini jalur sempit penggantinya: tambah item
 * baru (status pending) dan/atau tandai item lama `replaced` — tanpa migrasi
 * (`WorkOrderItem.status` String existing), tanpa menghapus baris.
 *
 * Guard stok dua arah: item yang sudah keluar lewat Material Issue
 * `completed` untuk WO ini TIDAK boleh ditandai replaced di sini — stoknya
 * sudah OUT (FIFO + jurnal), mengembalikan wajib lewat jalur retur/Material
 * Issue existing agar jurnal baliknya benar. Item belum ter-issue aman
 * diganti karena belum ada pergerakan stok apa pun.
 */
export async function reviseWorkOrderItems(input: {
  workOrderId: number;
  replacedItemIds?: number[];
  newItems?: { itemId: number; qty: number; cost?: number; description?: string }[];
  // F-2026-10-21-035 Q-LEAD-3: geser endDate saja (tanpa revisi item) sah di
  // jalur ini. `newEndDate` string tanggal baru; alasan mengikuti aturan sama.
  newEndDate?: string;
  endDateReasonCode?: string;
  endDateReasonNote?: string;
}) {
  try {
    const user = await requirePermission("edit_work_orders");

    const parsed = reviseWorkOrderItemsSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Data revisi tidak valid",
      };
    }
    const v = parsed.data;
    const replacedIds = [...new Set(v.replacedItemIds)];

    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: v.workOrderId },
      select: { id: true, status: true, endDate: true },
    });
    if (wo.status !== "in_progress") {
      throw new Error(
        `Item hanya bisa direvisi saat Perintah Kerja berjalan. Status saat ini '${wo.status}' — gunakan ubah biasa untuk draft/pending.`,
      );
    }

    // Geser endDate (Q-LEAD-3): hanya endDate + log, tanpa sentuh item/stok.
    // Nilai lama non-null & berubah → alasan wajib (daftar sama Q-LEAD-2).
    const shiftedEndDate =
      v.newEndDate !== undefined ? wibDateToUtcMidnight(v.newEndDate) : undefined;
    const endDateChanged =
      shiftedEndDate !== undefined &&
      endDateOnly(wo.endDate) !== endDateOnly(shiftedEndDate);
    if (endDateChanged) {
      const reasonError = endDateReasonError(
        wo.endDate,
        shiftedEndDate,
        v.endDateReasonCode,
        v.endDateReasonNote,
      );
      if (reasonError) return { success: false, error: reasonError };
    }
    if (replacedIds.length === 0 && v.newItems.length === 0 && !endDateChanged) {
      return {
        success: false,
        error:
          v.newEndDate !== undefined
            ? "Estimasi selesai tidak berubah — tidak ada yang digeser"
            : "Pilih item yang diganti atau tambahkan item baru",
      };
    }

    const releasedCount = await prisma.$transaction(async (tx) => {
      // Klaim kondisional: serialkan revisi konkuren pada WO yang sama.
      const claim = await tx.workOrder.updateMany({
        where: { id: v.workOrderId, status: "in_progress" },
        data: {
          updatedAt: new Date(),
          ...(endDateChanged ? { endDate: shiftedEndDate } : {}),
        },
      });
      if (claim.count === 0) {
        throw new Error("Status Perintah Kerja sudah berubah; muat ulang halaman.");
      }

      let released = 0;
      if (replacedIds.length > 0) {
        const targets = await tx.workOrderItem.findMany({
          where: { id: { in: replacedIds }, workOrderId: v.workOrderId },
          select: { id: true, itemId: true, status: true },
        });
        if (targets.length !== replacedIds.length) {
          throw new Error("Sebagian item yang diganti tidak ditemukan pada Perintah Kerja ini.");
        }
        const alreadyReplaced = targets.filter((t) => t.status === "replaced");
        if (alreadyReplaced.length > 0) {
          throw new Error("Sebagian item sudah pernah diganti.");
        }

        // Item ter-issue (MI completed WO ini) stoknya sudah keluar —
        // tandai replaced di sini akan mengaburkan retur stoknya.
        // F-2026-10-20-39(a): keputusan per BARIS WO lewat workOrderItemId.
        // Guard lama per itemId memblokir baris saudara yang belum ter-issue
        // hanya karena item yang sama ter-issue di baris lain. Baris issue
        // lama (workOrderItemId null, sebelum kolom ini ada) tetap dijaga
        // lewat itemId supaya tidak lolos.
        const issued = await tx.materialIssueItem.findMany({
          where: {
            materialIssue: { workOrderId: v.workOrderId, status: "completed" },
            OR: [
              { workOrderItemId: { in: replacedIds } },
              {
                workOrderItemId: null,
                itemId: { in: targets.map((t) => t.itemId) },
              },
            ],
          },
          select: { itemId: true, workOrderItemId: true },
        });
        if (issued.length > 0) {
          throw new Error(
            "Sebagian item sudah dikeluarkan lewat Pengeluaran Material selesai — kembalikan stoknya lewat jalur retur/pengeluaran material, bukan revisi item.",
          );
        }

        await tx.workOrderItem.updateMany({
          where: { id: { in: replacedIds }, workOrderId: v.workOrderId },
          data: { status: "replaced" },
        });

        // F-2026-10-21-012 inti (AC-RES-8): baris diganti → sisa reservasi
        // aktif baris itu released sejumlah belum terpakai; yang sudah
        // consumed tak berubah (guard di atas menolak baris ter-issue).
        released = await releaseReservationsForReplacedItemsTx(tx, {
          workOrderId: v.workOrderId,
          workOrderItemIds: replacedIds,
        });
      }

      if (v.newItems.length > 0) {
        await tx.workOrderItem.createMany({
          data: v.newItems.map((i) => ({
            workOrderId: v.workOrderId,
            itemId: i.itemId,
            qty: i.qty,
            cost: i.cost || 0,
            description: i.description || null,
            status: "pending",
          })),
        });
      }

      // F-2026-10-22-063-S: snapshot fitment baris baru revisi.
      await stampWorkOrderFitmentSnapshot(tx, v.workOrderId);
      return released;
    });

    // Q-LEAD-3: geser endDate di WO berjalan → baris histori yang sama persis
    // (satu action work_order_end_date_changed untuk semua jalur geser).
    if (endDateChanged && shiftedEndDate !== undefined) {
      await writeWorkOrderEndDateLog({
        userId: Number(user.id),
        workOrderId: v.workOrderId,
        oldEndDate: wo.endDate,
        newEndDate: shiftedEndDate,
        reasonCode: v.endDateReasonCode,
        reasonNote: v.endDateReasonNote,
      });
    }

    await logActivity(
      "update",
      "WorkOrder",
      v.workOrderId,
      `Merevisi item perintah kerja #${v.workOrderId}: ${replacedIds.length} diganti, ${v.newItems.length} baru`,
    );
    revalidatePath("/produksi/perintah-kerja");
    // F-2026-10-22-057-S §1: kata rilis verbatim; null = tak ada baris terdampak terlepas.
    return { success: true, releaseNotice: reservationReleaseNotice("revise", releasedCount) };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reviseWorkOrderItems]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function getNextRackCode(warehouseId: number) {
  const user = await requirePermission("create_warehouses");
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
    throw new Error("Gudang tidak valid");
  }
  assertWarehouseAccess(await getWarehouseScope(user), warehouseId);

  const settings = await prisma.systemSetting.findFirst();
  const prefix = settings?.rackCodePrefix || "RCK-";

  const existingCodes = await prisma.rack.findMany({
    where: { warehouseId, code: { startsWith: prefix } },
    select: { code: true },
  });
  let maxNum = 0;
  for (const r of existingCodes) {
    const num = Number.parseInt(r.code.slice(prefix.length), 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }
  let nextId = maxNum + 1;

  while (
    await prisma.rack.findFirst({
      where: { warehouseId, code: prefix + String(nextId).padStart(4, "0") },
      select: { id: true },
    })
  ) {
    nextId++;
  }
  return { code: prefix + String(nextId).padStart(4, "0") };
}

export async function getNextRowCode(rackId: number) {
  const user = await requirePermission("manage_inventory");
  if (!Number.isSafeInteger(rackId) || rackId <= 0) {
    throw new Error("Rak tidak valid");
  }
  const rack = await prisma.rack.findUnique({
    where: { id: rackId },
    select: { warehouseId: true },
  });
  if (!rack) throw new Error("Rak tidak ditemukan");
  assertWarehouseAccess(await getWarehouseScope(user), rack.warehouseId);

  const settings = await prisma.systemSetting.findFirst();
  const enableAutoCode = settings?.enableAutoRowCode !== false;
  if (!enableAutoCode) return { code: null };

  const prefix = settings?.rowCodePrefix || "ROW-";
  // Match createRackRow: row codes are globally sequenced from the row ID,
  // so the preview must not restart at 1 for each rack.
  const maxId = await prisma.rackRow.aggregate({ _max: { id: true } });
  let nextId = (maxId._max.id ?? 0) + 1;
  while (
    await prisma.rackRow.findFirst({
      where: { code: prefix + String(nextId).padStart(4, "0") },
      select: { id: true },
    })
  ) {
    nextId++;
  }
  return { code: prefix + String(nextId).padStart(4, "0") };
}

// ==================== RACK ACTIONS ====================

export async function createRack(formData: FormData) {
  try {
    const user = await requirePermission("create_warehouses");

    // Migrated to parseFormData(rackSchema) — the previous hand-parsed path
    // (`formData.get("name") as string`) bypassed required-name and positive-id
    // validation: a blank name produced a DB-level NOT NULL error and a 0/NaN
    // warehouseId would reach prisma.rack.create unchecked.
    const parsed = parseFormData(rackSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;
    await assertWarehouseIdInScope(user, v.warehouseId);

    const settings = await prisma.systemSetting.findFirst();
    const enableAutoCode = settings?.enableAutoRackCode !== false;
    const prefix = settings?.rackCodePrefix || "RCK-";

    let code = v.code ?? null;
    if (enableAutoCode || !code) {
      // Derive next code scoped **per warehouse** so every warehouse
      // starts its own counter (RCK-001, RCK-002, …).
      const existingCodes = await prisma.rack.findMany({
        where: { warehouseId: v.warehouseId, code: { startsWith: prefix } },
        select: { code: true },
      });
      let maxNum = 0;
      for (const r of existingCodes) {
        const num = Number.parseInt(r.code.slice(prefix.length), 10);
        if (!Number.isNaN(num) && num > maxNum) maxNum = num;
      }
      let nextId = maxNum + 1;

      while (
        await prisma.rack.findFirst({
          where: { warehouseId: v.warehouseId, code: prefix + String(nextId).padStart(4, "0") },
          select: { id: true },
        })
      ) {
        nextId++;
      }
      code = prefix + String(nextId).padStart(4, "0");
    }

    const rack = await prisma.rack.create({
      data: {
        code,
        name: v.name,
        slug: await nextSlug("rack", v.name),
        warehouseId: v.warehouseId,
      },
    });

    await logActivity("create", "Rack", rack.id, `Membuat rak #${rack.id}`);
    revalidatePath("/inventaris/rak");
    return { success: true, id: rack.id, slug: rack.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createRack]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateRack(id: number, formData: FormData) {
  try {
    const user = await requirePermission("create_warehouses");

    // Migrated to parseFormData(rackSchema) — the previous hand-parsed path
    // (raw `as string` cast + requireId) bypassed schema validation: blank
    // names and missing warehouseId slipped through and produced confusing DB
    // errors. Mirrors the create path for validation parity.
    const parsed = parseFormData(rackSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;
    await assertRackIdInScope(user, id);
    await assertWarehouseIdInScope(user, v.warehouseId);

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        code: v.code ?? "",
        name: v.name,
        slug: await nextSlug("rack", v.name, { excludeId: id }),
        warehouseId: v.warehouseId,
      },
    });

    await logActivity("update", "Rack", id, `Memperbarui rak #${id}`);
    revalidatePath("/inventaris/rak");
    return { success: true, id, slug: rack.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateRack]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteStockAdjustment(id: number) {
  try {
    const user = await requirePermission("delete_stock_adjustments");

    const adjustment = await prisma.stockAdjustment.findUniqueOrThrow({
      where: { id: id },
    });
    assertWarehouseAccess(await getWarehouseScope(user), adjustment.warehouseId);
    if (adjustment.status !== "draft") {
      throw new Error("Hanya stock adjustment draft yang dapat dihapus");
    }

    await prisma.stockAdjustment.delete({ where: { id } });

    await logActivity(
      "delete",
      "StockAdjustment",
      id,
      `Menghapus penyesuaian stok #${id}`,
    );
    revalidatePath("/inventaris/penyesuaian");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteStockAdjustment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteInventoryTransfer(id: number) {
  try {
    const user = await requirePermission("delete_inventory_transfers");

    const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id },
    });
    assertWarehouseAccessMulti(await getWarehouseScope(user), [transfer.sourceWarehouseId, transfer.destinationWarehouseId]);
    if (transfer.status !== "draft") {
      throw new Error("Hanya transfer draft yang dapat dihapus");
    }

    await prisma.inventoryTransfer.delete({ where: { id } });

    await logActivity(
      "delete",
      "InventoryTransfer",
      id,
      `Menghapus transfer inventaris #${id}`,
    );
    revalidatePath("/inventaris/transfer");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteInventoryTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteMaterialIssue(id: number) {
  try {
    const user = await requirePermission("delete_material_issues");

    const issue = await prisma.materialIssue.findUniqueOrThrow({
      where: { id },
    });
    assertWarehouseAccess(await getWarehouseScope(user), issue.warehouseId);
    if (issue.status !== "draft") {
      throw new Error("Hanya material issue draft yang dapat dihapus");
    }

    await prisma.materialIssue.delete({ where: { id } });

    await logActivity(
      "delete",
      "MaterialIssue",
      id,
      `Menghapus pengeluaran material #${id}`,
    );
    revalidatePath("/inventaris/pengeluaran-material");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteMaterialIssue]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteRack(id: number) {
  try {
    const user = await requirePermission("delete_warehouses");
    await assertRackIdInScope(user, id);

    // Guard: prevent hard-delete if Rack is referenced by transactional records.
    const [itemCount, stockMoveCount, rackRowCount] = await Promise.all([
      prisma.item.count({ where: { defaultRackId: id } }),
      prisma.stockMove.count({ where: { rackId: id } }),
      prisma.rackRow.count({ where: { rackId: id } }),
    ]);
    if (itemCount > 0 || stockMoveCount > 0 || rackRowCount > 0) {
      return {
        success: false,
        error: `Rak masih digunakan oleh ${itemCount} barang, ${stockMoveCount} pergerakan stok, dan ${rackRowCount} baris rak. Hapus atau pindahkan referensi terlebih dahulu.`,
      };
    }

    await prisma.rack.delete({ where: { id } });

    await logActivity("delete", "Rack", id, `Menghapus rak #${id}`);
    revalidatePath("/inventaris/rak");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteRack]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateStockAdjustment(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_stock_adjustments");

    // Validate via the same Zod schema as createStockAdjustment. The previous
    // hand-parse (requireId / new Date(formData.get("date")) / raw formData.get)
    // bypassed the schema's warehouseId>=1, non-empty date, and max-length guards
    // on reason/type/notes — an editor could push an empty/garbage date (crashing
    // new Date() into Invalid Date) or oversized strings straight into the DB.
    const parsed = parseFormData(stockAdjustmentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal baru harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const adj = await prisma.stockAdjustment.findUniqueOrThrow({
      where: { id },
    });
    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccessMulti(warehouseScope, [adj.warehouseId, v.warehouseId]);
    if (adj.status !== "draft") {
      throw new Error("Hanya stock adjustment draft yang dapat diedit");
    }

    // Fix #2: Jangan generate documentNo baru saat update
    const adjItems = (
      safeJsonParse<AdjustmentItemInput[]>(v.items ?? null) ?? []
    ).filter((it) => Number(it.itemId) > 0);
    assertUniqueAdjustmentItems(adjItems);
    const adjRows = adjItems.map(normalizeAdjustmentItem);

    const warehouseId = v.warehouseId;
    const itemIds = adjRows.map((it) => it.itemId);
    const stockMoves = await prisma.stockMove.groupBy({
      by: ["itemId", "impact"],
      where: { warehouseId, itemId: { in: itemIds }, status: "posted" },
      _sum: { qty: true },
    });
    const stockMap = new Map<number, number>();
    for (const s of stockMoves) {
      const current = stockMap.get(s.itemId) || 0;
      const change = Number(s._sum.qty || 0);
      stockMap.set(
        s.itemId,
        s.impact === "IN" ? current + change : current - change,
      );
    }

    const adjustment = await prisma.$transaction(async (tx) => {
      await tx.stockAdjustmentItem.deleteMany({
        where: { stockAdjustmentId: id },
      });

      // Re-check status inside transaction (TOCTOU guard)
      const latest = await tx.stockAdjustment.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latest && latest.status !== "draft") {
        throw new Error("Hanya stock adjustment draft yang dapat diedit");
      }

      return tx.stockAdjustment.update({
        where: { id },
        data: {
          slug: await nextSlug("stockAdjustment", adj.documentNo, { excludeId: id }),
          warehouseId,
          date: wibDateToUtcMidnight(v.date),
          reason: v.reason ?? null,
          type: v.type || "increase",
          notes: v.notes ?? null,
          items: {
            create: adjRows.map((it) => {
              const systemQty = Number(stockMap.get(it.itemId) || 0);
              const difference = safeSubtract(it.actualQty, systemQty, 0);
              return {
                itemId: it.itemId,
                systemQty,
                actualQty: it.actualQty,
                difference,
                unitCost: it.unitCost,
                serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers : undefined,
                totalCost: safeMultiply(difference, it.unitCost, 0),
                notes: it.reason || null,
              };
            }),
          },
        },
      });
    });

    await logActivity(
      "update",
      "StockAdjustment",
      adjustment.id,
      `Memperbarui penyesuaian stok #${adjustment.id}`,
    );
    revalidatePath("/inventaris/penyesuaian");
    return { success: true, id: adjustment.id, slug: adjustment.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateStockAdjustment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateMaterialIssue(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_material_issues");

    // Validate via the same Zod schema as createMaterialIssue. The previous
    // hand-parse (requireId / safeId / new Date(formData.get("date"))) bypassed
    // the schema's warehouseId>=1, non-empty date, and max-length guards on
    // notes — an editor could push an empty date (Invalid Date), an arbitrary
    // non-existent warehouseId, or a 5MB notes blob straight into the DB.
    const parsed = parseFormData(materialIssueSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal baru harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const mi = await prisma.materialIssue.findUniqueOrThrow({ where: { id } });
    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccessMulti(warehouseScope, [mi.warehouseId, v.warehouseId]);
    if (mi.status !== "draft") {
      throw new Error("Hanya material issue draft yang dapat diedit");
    }

    // Fix #2: Jangan generate documentNo baru saat update
    const miItems = parseMaterialIssuePayloadItems(v.items);

    const issue = await prisma.$transaction(async (tx) => {
      await tx.materialIssueItem.deleteMany({ where: { materialIssueId: id } });
      // F-008: baris lahir ulang saat update draft -> snapshot beku ulang.
      const snapshotByItem = await resolveMaterialIssueScrapSnapshots(
        tx, miItems.map((it) => ({ itemId: Number(it.itemId) })), mi.workOrderId ?? v.workOrderId ?? null,
      );

      // Re-check status inside transaction (TOCTOU guard)
      const latest = await tx.materialIssue.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latest && latest.status !== "draft") {
        throw new Error("Hanya material issue draft yang dapat diedit");
      }

      return tx.materialIssue.update({
        where: { id },
        data: {
          slug: await nextSlug("materialIssue", mi.documentNo, { excludeId: id }),
          warehouseId: v.warehouseId,
          // projectId & workOrderId tidak punya input di form MI: keduanya tautan
          // yang dipasang alur lain (buat-dari-WO / proyek). Menulis `?? null` di
          // sini memutus tautan itu setiap kali MI disimpan — dan hilangnya
          // workOrderId membuat "Buat Pengeluaran Material" bisa dijalankan lagi
          // untuk WO yang sama (stok keluar dua kali).
          ...(v.projectId !== undefined ? { projectId: v.projectId } : {}),
          ...(v.workOrderId !== undefined ? { workOrderId: v.workOrderId } : {}),
          costCenterId: v.costCenterId ?? null,
          date: wibDateToUtcMidnight(v.date),
          notes: v.notes ?? null,
          items: {
            create: miItems.map((it) =>
              materialIssueItemCreateData(it, snapshotByItem.get(Number(it.itemId)) ?? null),
            ),
          },
        },
      });
    });
    await logActivity(
      "update",
      "MaterialIssue",
      issue.id,
      `Memperbarui pengeluaran material #${issue.id}`,
    );
    revalidatePath("/inventaris/pengeluaran-material");
    return { success: true, id: issue.id, slug: issue.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateMaterialIssue]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateInventoryTransfer(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_inventory_transfers");

    const parsed = parseFormData(inventoryTransferSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    // Lapis-2: tanggal baru harus di periode terbuka, sebelum mutasi.
    await assertPeriodOpen(wibDateToUtcMidnight(v.date));

    const tf = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id },
    });
    const warehouseScope = await getWarehouseScope(user);
    assertWarehouseAccessMulti(warehouseScope, [
      tf.sourceWarehouseId,
      tf.destinationWarehouseId,
      v.sourceWarehouseId,
      v.destinationWarehouseId,
    ]);
    if (tf.status !== "draft") {
      throw new Error("Hanya transfer draft yang dapat diedit");
    }

    // Fix #2: Jangan generate documentNo baru saat update
    const transferItems = normalizeQtyItems(v.items);

    const transfer = await prisma.$transaction(async (tx) => {
      await tx.inventoryTransferItem.deleteMany({
        where: { inventoryTransferId: id },
      });

      // Re-check status inside transaction (TOCTOU guard)
      const latest = await tx.inventoryTransfer.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latest && latest.status !== "draft") {
        throw new Error("Hanya transfer draft yang dapat diedit");
      }

      return tx.inventoryTransfer.update({
        where: { id },
        data: {
          slug: await nextSlug("inventoryTransfer", tf.documentNo, { excludeId: id }),
          sourceWarehouseId: v.sourceWarehouseId,
          destinationWarehouseId: v.destinationWarehouseId,
          date: wibDateToUtcMidnight(v.date),
          notes: v.notes ?? null,
          items: {
            create: transferItems.map((it) => ({
              itemId: it.itemId,
              qty: it.qty,
            })),
          },
        },
      });
    });

    await logActivity(
      "update",
      "InventoryTransfer",
      transfer.id,
      `Memperbarui transfer inventaris #${transfer.id}`,
    );
    revalidatePath("/inventaris/transfer");
    return { success: true, id: transfer.id, slug: transfer.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateInventoryTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== RACK ROW ACTIONS ====================

export async function createRackRow(formData: FormData) {
  try {
    const user = await requirePermission("manage_inventory");

    // Migrated to parseFormData(rackRowSchema) — the previous hand-parsed path
    // bypassed required-rackId and required-name validation, letting empty
    // values reach prisma.rackRow.create and crash with FK / NOT NULL errors.
    const parsed = parseFormData(rackRowSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;
    await assertRackIdInScope(user, v.rackId);

    const settings = await prisma.systemSetting.findFirst();
    const enableAutoCode = settings?.enableAutoRowCode !== false;
    const prefix = settings?.rowCodePrefix || "ROW-";

    let code = v.code ?? null;

    if (enableAutoCode || !code) {
      const maxId = await prisma.rackRow.aggregate({ _max: { id: true } });
      let nextId = (maxId._max.id ?? 0) + 1;
      // RackRow.code has no DB unique constraint — bump past collisions so
      // concurrent creates don't produce duplicate codes.

      while (
        await prisma.rackRow.findFirst({
          where: { code: prefix + String(nextId).padStart(4, "0") },
          select: { id: true },
        })
      ) {
        nextId++;
      }
      code = prefix + String(nextId).padStart(4, "0");
    }

    const rackRow = await prisma.rackRow.create({
      data: {
        rackId: v.rackId,
        code,
        name: v.name,
        slug: await nextSlug("rackRow", code || v.name),
      },
    });

    await logActivity(
      "create",
      "RackRow",
      rackRow.id,
      `Membuat baris rak #${rackRow.id}`,
    );
    revalidatePath("/inventaris/baris-rak");
    return { success: true, id: rackRow.id, slug: rackRow.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createRackRow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateRackRow(id: number, formData: FormData) {
  try {
    const user = await requirePermission("manage_inventory");

    // Migrated to parseFormData(rackRowSchema) — mirrors the create path so
    // the edit route enforces the same required-rackId / required-name
    // guards; previously `formData.get("name") as string` could persist a
    // blank name and `requireId` would surface as a confusing error only
    // after reaching prisma.rackRow.update.
    const parsed = parseFormData(rackRowSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;
    await assertRackRowIdInScope(user, id);
    await assertRackIdInScope(user, v.rackId);

    const rackRow = await prisma.rackRow.update({
      where: { id },
      data: {
        rackId: v.rackId,
        code: v.code ?? null,
        name: v.name,
        slug: await nextSlug("rackRow", v.code || v.name, { excludeId: id }),
      },
    });

    await logActivity("update", "RackRow", id, `Memperbarui baris rak #${id}`);
    revalidatePath("/inventaris/baris-rak");
    return { success: true, id, slug: rackRow.slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateRackRow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteRackRow(id: number) {
  try {
    const user = await requirePermission("manage_inventory");
    await assertRackRowIdInScope(user, id);

    // Guard: prevent hard-delete if RackRow is referenced by transactional
    // records. Item.defaultRackRowId is an FK with onDelete: SetNull (so a raw
    // delete would silently NULL the default row on every assigned item, losing
    // the Item → location linkage that operators use for picking), and
    // StockMove.rackRowId is a plain Int with NO FK (raw delete leaves a
    // dangling int on every historical stock movement, erasing the location
    // tag from the audit log). Refuse if any dependent record exists, mirroring
    // deleteRack's in-use guard. Without this, a manager could destroy the
    // location history of every item assigned to this row in a single click.
    const [itemCount, stockMoveCount] = await Promise.all([
      prisma.item.count({ where: { defaultRackRowId: id } }),
      prisma.stockMove.count({ where: { rackRowId: id } }),
    ]);
    if (itemCount > 0 || stockMoveCount > 0) {
      return {
        success: false,
        error: `Baris rak masih digunakan oleh ${itemCount} barang dan ${stockMoveCount} pergerakan stok. Hapus atau pindahkan referensi terlebih dahulu.`,
      };
    }

    await prisma.rackRow.delete({ where: { id } });

    await logActivity("delete", "RackRow", id, `Menghapus baris rak #${id}`);
    revalidatePath("/inventaris/baris-rak");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteRackRow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== P1-5: STOCKTAKE SESSION ====================
// Sesi opname bertahap: draft → counting (snapshot) → recount → review →
// approved → posted (adjustment). Approval independen: penyetuju ≠ pencacah.
// Posting memakai LIVE qty sebagai basis (delta concurrent tercatat).

import { finalizeCounts } from "@/lib/inventory/stocktake-finalize";

const STOCKTAKE_PATH = "/inventaris/opname";

async function liveQtyByItem(
  warehouseId: number,
  db: Pick<typeof prisma, "inventoryLayer"> = prisma,
): Promise<Map<number, number>> {
  const layers = await db.inventoryLayer.groupBy({
    by: ["itemId"],
    where: { warehouseId, remaining: { gt: 0 } },
    _sum: { remaining: true },
  });
  return new Map(layers.map((l) => [l.itemId, Number(l._sum.remaining ?? 0)]));
}

export async function createStocktakeSession(formData: FormData) {
  try {
    const user = await requirePermission("create_stock_adjustments");
    const warehouseId = parseStrictId(formData.get("warehouseId"));
    if (warehouseId === null) throw new Error("Gudang tidak valid");
    const dateRaw = (formData.get("date") as string | null) ?? "";
    const notesRaw = (formData.get("notes") as string | null) ?? null;
    const notes = notesRaw ? notesRaw.slice(0, 1000) : null;
    await assertWarehouseIdInScope(user, warehouseId);
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });
    if (!warehouse) throw new Error("Gudang tidak ditemukan");
    const parsedDate = dateOnly.safeParse(dateRaw);
    if (!parsedDate.success) throw new Error("Tanggal tidak valid");
    const sessionDate = wibDateToUtcMidnight(parsedDate.data);
    await assertPeriodOpen(sessionDate);

    const documentNo = await generateDocumentNumber("STK");
    const slug = await nextSlug("stocktakeSession", documentNo);
    const session = await prisma.stocktakeSession.create({
      data: {
        documentNo,
        slug,
        warehouseId,
        date: sessionDate,
        status: "draft",
        notes,
        createdBy: Number(user.id),
      },
    });
    await logActivity("create", "StocktakeSession", session.id, `Sesi opname ${documentNo}`);
    revalidatePath(STOCKTAKE_PATH);
    return { success: true as const, id: session.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createStocktakeSession]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Kunci snapshot: salin live qty gudang ke lines, status → counting. */
export async function snapshotStocktakeSession(id: number) {
  try {
    const user = await requirePermission("create_stock_adjustments");
    const session = await prisma.stocktakeSession.findUniqueOrThrow({
      where: { id },
      include: { lines: { select: { id: true } } },
    });
    await assertWarehouseIdInScope(user, session.warehouseId);
    if (session.status !== "draft") throw new Error("Hanya sesi draft yang bisa di-snapshot");

    const live = await liveQtyByItem(session.warehouseId);
    await prisma.$transaction(async (tx) => {
      const locked = await tx.stocktakeSession.findUnique({ where: { id }, select: { status: true } });
      if (!locked || locked.status !== "draft") throw new Error("Sesi sudah berjalan");
      await tx.stocktakeLine.deleteMany({ where: { sessionId: id } });
      if (live.size > 0) {
        await tx.stocktakeLine.createMany({
          data: [...live.entries()].map(([itemId, qty]) => ({
            sessionId: id,
            itemId,
            systemQty: qty,
          })),
        });
      }
      await tx.stocktakeSession.update({
        where: { id },
        data: { status: "counting", snapshotAt: new Date(), countedBy: Number(user.id) },
      });
    });
    await logActivity("update", "StocktakeSession", id, "Snapshot stok sesi opname");
    revalidatePath(STOCKTAKE_PATH);
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[snapshotStocktakeSession]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Simpan hitungan 1/2 per baris (JSON: [{lineId,count1?,count2?,note?}]). */
export async function saveStocktakeCounts(id: number, formData: FormData) {
  try {
    const user = await requirePermission("create_stock_adjustments");
    const session = await prisma.stocktakeSession.findUniqueOrThrow({
      where: { id },
      select: { warehouseId: true, status: true },
    });
    await assertWarehouseIdInScope(user, session.warehouseId);
    if (session.status !== "counting" && session.status !== "recount") {
      throw new Error("Sesi tidak dalam tahap penghitungan");
    }
    const counts = safeJsonParse<{ lineId: number; count1?: number; count2?: number; note?: string }[]>(
      (formData.get("counts") as string | null) ?? null,
    ) ?? [];
    await prisma.$transaction(async (tx) => {
      for (const c of counts) {
        if (!Number.isSafeInteger(c.lineId) || c.lineId <= 0) continue;
        const data: { count1?: number; count2?: number | null; note?: string | null } = {};
        if (c.count1 != null && Number.isFinite(Number(c.count1)) && Number(c.count1) >= 0) {
          data.count1 = Number(c.count1);
        }
        if (c.count2 != null && c.count2 !== ("" as unknown as number) && Number.isFinite(Number(c.count2)) && Number(c.count2) >= 0) {
          data.count2 = Number(c.count2);
        }
        if (c.note !== undefined) data.note = String(c.note).slice(0, 500) || null;
        if (Object.keys(data).length === 0) continue;
        await tx.stocktakeLine.updateMany({ where: { id: c.lineId, sessionId: id }, data });
      }
      // Bila semua baris berselisih sudah di-recount (count2 terisi) → review.
      const lines = await tx.stocktakeLine.findMany({
        where: { sessionId: id },
        select: { systemQty: true, count1: true, count2: true },
      });
      const finals = finalizeCounts(
        lines.map((l) => ({
          itemId: 0,
          systemQty: Number(l.systemQty),
          count1: l.count1 == null ? null : Number(l.count1),
          count2: l.count2 == null ? null : Number(l.count2),
        })),
      );
      const pending = finals.filter((f) => f.needsRecount);
      await tx.stocktakeSession.update({
        where: { id },
        data: { status: pending.length > 0 ? "recount" : "review" },
      });
    });
    revalidatePath(STOCKTAKE_PATH);
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[saveStocktakeCounts]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Approval independen: penyetuju wajib ≠ pencacah. */
export async function approveStocktakeSession(id: number) {
  try {
    const user = await requirePermission("edit_stock_adjustments");
    const session = await prisma.stocktakeSession.findUniqueOrThrow({ where: { id } });
    await assertWarehouseIdInScope(user, session.warehouseId);
    if (session.status !== "review") throw new Error("Hanya sesi tahap review yang bisa disetujui");
    if (session.countedBy != null && Number(session.countedBy) === Number(user.id)) {
      throw new Error("Penyetuju harus independen — pencacah tidak boleh menyetujui sesi sendiri");
    }
    await prisma.stocktakeSession.update({
      where: { id },
      data: { status: "approved", approvedBy: Number(user.id), approvedAt: new Date() },
    });
    await logActivity("approve", "StocktakeSession", id, "Sesi opname disetujui");
    revalidatePath(STOCKTAKE_PATH);
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveStocktakeSession]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Posting: variance → Stock Adjustment (jalur terbukti). Basis = LIVE qty
 * (bukan snapshot basi): actualQty = finalCount, systemQty dikoreksi hook
 * terhadap live. Delta concurrent (live - snapshot) dicatat di notes.
 */
export async function postStocktakeSession(id: number) {
  try {
    const user = await requirePermission("create_stock_adjustments");
    // Pra-cek keberadaan + jangkauan gudang saja. Status TIDAK dipercaya dari
    // baca ini — status dibaca ulang di dalam transaksi sesudah baris sesi
    // dikunci (AUD-01: klaim posted harus single-winner di semua cabang).
    const existing = await prisma.stocktakeSession.findUniqueOrThrow({
      where: { id },
      select: { warehouseId: true },
    });
    await assertWarehouseIdInScope(user, existing.warehouseId);

    const outcome = await prisma.$transaction(async (tx) => {
      // Klaim atomik: kunci baris sesi lebih dulu, lalu baca ulang status +
      // lines di dalam transaksi yang sama. Request paralel menunggu di lock
      // ini dan melihat status final pemenang, bukan snapshot lama.
      await tx.$queryRaw`SELECT id FROM stocktake_sessions WHERE id = ${id} FOR UPDATE`;
      const session = await tx.stocktakeSession.findUnique({
        where: { id },
        include: { lines: { include: { item: { select: { cost: true } } } } },
      });
      if (!session) throw new Error("Sesi opname tidak ditemukan");
      if (session.status !== "approved") {
        throw new Error("Hanya sesi yang disetujui yang bisa diposting");
      }
      await assertPeriodOpen(new Date(), tx);

      const finals = finalizeCounts(
        session.lines.map((l) => ({
          itemId: l.itemId,
          systemQty: Number(l.systemQty),
          count1: l.count1 == null ? null : Number(l.count1),
          count2: l.count2 == null ? null : Number(l.count2),
        })),
      );
      const differing = finals.filter((f) => f.variance !== 0);
      if (differing.length === 0) {
        await tx.stocktakeSession.update({ where: { id }, data: { status: "posted" } });
        return { adjustmentId: null as number | null, documentNo: null as string | null };
      }

      const live = await liveQtyByItem(session.warehouseId, tx);
      const snapByItem = new Map(finals.map((f) => [f.itemId, f.systemQty]));
      const deltas = differing.map((f) => {
        const liveQty = live.get(f.itemId) ?? 0;
        const snap = snapByItem.get(f.itemId) ?? 0;
        return { itemId: f.itemId, delta: liveQty - snap };
      }).filter((d) => d.delta !== 0);

      const documentNo = await generateDocumentNumber("ADJ");
      const adj = await tx.stockAdjustment.create({
        data: {
          documentNo,
          slug: await nextSlug("stockAdjustment", documentNo),
          warehouseId: session.warehouseId,
          date: new Date(),
          status: "draft",
          notes:
            `Posting opname ${session.documentNo}` +
            (deltas.length > 0
              ? ` (pergerakan selama sesi: ${deltas.map((d) => `#${d.itemId} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(", ")})`
              : ""),
          createdBy: Number(user.id),
          items: {
            create: differing.map((f) => {
              const line = session.lines.find((l) => l.itemId === f.itemId)!;
              return {
                itemId: f.itemId,
                systemQty: live.get(f.itemId) ?? f.systemQty,
                actualQty: f.finalCount,
                difference: 0,
                unitCost: Number(line.item.cost ?? 0),
                totalCost: 0,
                notes: `Opname ${session.documentNo}`,
              };
            }),
          },
        },
      });
      await tx.stocktakeSession.update({
        where: { id },
        data: { status: "posted", adjustmentId: adj.id },
      });
      return { adjustmentId: adj.id as number | null, documentNo: documentNo as string | null };
    });

    if (outcome.adjustmentId != null) {
      await requestApprovalIfConfigured("StockAdjustment", outcome.adjustmentId, Number(user.id));
      await logActivity("post", "StocktakeSession", id, `Posting opname → adjustment ${outcome.documentNo}`);
    }
    revalidatePath(STOCKTAKE_PATH);
    return { success: true as const, adjustmentId: outcome.adjustmentId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postStocktakeSession]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== P1-5: REMNANT / SCRAP ====================
// Sisa potong usable dicatat (sumber WO/PO, dimensi, biaya bawaan) dan dapat
// dipilih untuk issue berikut (consume → status consumed, tanpa movement
// ganda karena remnant bukan stok gudang). Scrap = alasan + biaya terpisah.

export async function createRemnant(formData: FormData) {
  try {
    const user = await requirePermission("create_material_issues");
    const itemId = parseStrictId(formData.get("itemId"));
    const warehouseId = parseStrictId(formData.get("warehouseId"));
    const qty = parseStrictQty(formData.get("qty"));
    if (itemId === null) throw new Error("Item tidak valid");
    if (warehouseId === null) throw new Error("Gudang tidak valid");
    if (qty === null || qty <= 0) throw new Error("Qty sisa harus > 0");
    await assertWarehouseIdInScope(user, warehouseId);
    const [item, warehouse] = await Promise.all([
      prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, category: { select: { remnantMinMeasure: true } } },
      }),
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } }),
    ]);
    if (!item) throw new Error("Barang tidak ditemukan");
    if (!warehouse) throw new Error("Gudang tidak ditemukan");
    // Biaya satuan nominal uang: wajib parser repo — Number("2.000.000")=2.
    const unitCostRaw = parseMoneyAmount(formData.get("unitCost"));
    if (unitCostRaw === null || !Number.isFinite(unitCostRaw) || unitCostRaw < 0) throw new Error("Biaya satuan tidak valid");
    const sourceId = parseStrictId(formData.get("sourceId"));
    if (formData.get("sourceId") && sourceId === null) {
      throw new Error("Sumber tidak valid");
    }
    const cap = (v: FormDataEntryValue | null, n: number) => {
      const s = ((v as string | null) ?? "").trim().slice(0, n);
      return s || null;
    };
    // F-098-S BR-SCRAP-03/04/05: usable wajib dimensi+ukuran+tautan issue dan
    // lolos ambang kategori (snapshot dibekukan; null = belum ditetapkan).
    const dimensions = cap(formData.get("dimensions"), 255);
    const sourceType = cap(formData.get("sourceType"), 64);
    const measuredRaw = formData.get("measuredSize");
    const measuredSize = measuredRaw ? parseStrictQty(measuredRaw) : null;
    const minMeasureSnapshot =
      (item as { category?: { remnantMinMeasure?: unknown } | null }).category?.remnantMinMeasure != null
        ? Number((item as { category?: { remnantMinMeasure?: unknown } | null }).category?.remnantMinMeasure)
        : null;
    const usableError = validateUsableRemnant({
      dimensions,
      measuredSize,
      minMeasureSnapshot,
      sourceType,
      sourceId,
    });
    if (usableError) throw new Error(usableError);
    const documentNo = await generateDocumentNumber("RMN");
    const remnant = await prisma.remnant.create({
      data: {
        documentNo,
        itemId,
        warehouseId,
        qty,
        uom: cap(formData.get("uom"), 32),
        dimensions,
        sourceType,
        sourceId,
        unitCost: unitCostRaw,
        status: "usable",
        remnantMinMeasureSnapshot: minMeasureSnapshot,
        measuredSize,
        createdBy: Number(user.id),
      },
    });
    await logActivity("create", "Remnant", remnant.id, `Sisa ${documentNo} (${qty})`);
    revalidatePath("/inventaris/sisa");
    return { success: true as const, id: remnant.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createRemnant]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Pakai remnant usable untuk kebutuhan berikut (klaim atomik — tanpa movement ganda). */
export async function consumeRemnant(id: number, formData: FormData) {
  try {
    const user = await requirePermission("create_material_issues");
    const remnant = await prisma.remnant.findUnique({ where: { id }, select: { warehouseId: true } });
    if (!remnant) throw new Error("Sisa tidak ditemukan");
    await assertWarehouseIdInScope(user, remnant.warehouseId);
    const consumedBy = ((formData.get("consumedBy") as string | null) ?? "").slice(0, 128);
    if (!consumedBy) throw new Error("Tujuan pemakaian wajib diisi");
    const updated = await prisma.remnant.updateMany({
      where: { id, status: "usable" },
      data: { status: "consumed", consumedBy, consumedAt: new Date() },
    });
    if (updated.count === 0) {
      const cur = await prisma.remnant.findUnique({ where: { id }, select: { status: true } });
      throw new Error(
        cur ? `Sisa sudah ${cur.status}, tidak bisa dipakai` : "Sisa tidak ditemukan",
      );
    }
    await logActivity("update", "Remnant", id, `Sisa dipakai: ${consumedBy}`);
    revalidatePath("/inventaris/sisa");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[consumeRemnant]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/** Tandai remnant sebagai scrap (alasan + berat kg besi tua wajib — F-098-S AC-SCRAP-7). */
export async function scrapRemnant(id: number, formData: FormData) {
  try {
    const user = await requirePermission("create_material_issues");
    const remnant = await prisma.remnant.findUnique({ where: { id }, select: { warehouseId: true } });
    if (!remnant) throw new Error("Sisa tidak ditemukan");
    await assertWarehouseIdInScope(user, remnant.warehouseId);
    const reason = ((formData.get("scrapReason") as string | null) ?? "").trim();
    if (!reason) throw new Error("Alasan scrap wajib diisi");
    const weightRaw = formData.get("scrapWeightKg");
    const scrapWeightKg = weightRaw ? parseStrictQty(weightRaw) : null;
    const weightError = validateScrapWeightKg(scrapWeightKg);
    if (weightError) throw new Error(weightError);
    const updated = await prisma.remnant.updateMany({
      where: { id, status: "usable" },
      data: { status: "scrap", scrapReason: reason.slice(0, 500), scrapWeightKg },
    });
    if (updated.count === 0) {
      const cur = await prisma.remnant.findUnique({ where: { id }, select: { status: true } });
      throw new Error(
        cur ? `Sisa sudah ${cur.status}, tidak bisa di-scrap` : "Sisa tidak ditemukan",
      );
    }
    await logActivity("update", "Remnant", id, `Scrap: ${reason.slice(0, 120)}`);
    revalidatePath("/inventaris/sisa");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[scrapRemnant]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Disposisi tinjau foreman atas scrap abnormal (F-2026-10-24-098-S D-S98-04).
 * Izin default-aman spec: reuse `complete_work_orders` (key khusus
 * approve_scrap_reviews belum diputus LEAD). Tinjau operasional saja —
 * updateMany dibatasi kolom tinjau; snapshot klasifikasi/nilai/jurnal
 * 066-V tidak disentuh (BR-SCRAP-08, AC-SCRAP-6).
 */
export async function reviewAbnormalScrap(input: {
  source: "MI" | "PO";
  lineId: number;
  disposition: string;
  note?: string | null;
}) {
  try {
    const user = await requirePermission("complete_work_orders");
    const reviewError = validateScrapReview({ disposition: input.disposition, note: input.note });
    if (reviewError) throw new Error(reviewError);
    if (!Number.isSafeInteger(input.lineId) || input.lineId <= 0) throw new Error("Baris scrap tidak valid");
    const data = {
      scrapReviewStatus: SCRAP_REVIEW_STATUS_DONE,
      scrapReviewDisposition: input.disposition,
      scrapReviewNote: input.disposition === "kelalaian" ? (input.note ?? "").trim().slice(0, 500) : ((input.note ?? "").trim().slice(0, 500) || null),
      scrapReviewedBy: Number(user.id),
      scrapReviewedAt: new Date(),
    };
    const updated =
      input.source === "MI"
        ? await prisma.materialIssueItem.updateMany({
            where: { id: input.lineId, scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING },
            data,
          })
        : await prisma.productionOrderMaterial.updateMany({
            where: { id: input.lineId, scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING },
            data,
          });
    if (updated.count === 0) {
      throw new Error("Baris scrap tidak ditemukan atau tidak sedang menunggu tinjau");
    }
    await logActivity("update", input.source === "MI" ? "MaterialIssueItem" : "ProductionOrderMaterial", input.lineId, `Tinjau scrap abnormal: ${input.disposition}`);
    revalidatePath("/laporan/scrap-material");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reviewAbnormalScrap]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
