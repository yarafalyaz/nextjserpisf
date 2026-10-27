import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { slugify } from "@/lib/utils/slug";
import { consumeFifoLayers, createInLayer, ConsumedBatch } from "@/lib/services/inventory-fifo";
import { safeAdd } from "@/lib/utils/math";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import {
  carriedCostMapFromOutMoves,
  deriveTransferStatusAfterReceipt,
  groupReceivedBatchesByLine,
  groupReceivedSerialsByLine,
  parseStoredBatches as parseStoredBatchAllocations,
  parseStoredSerials,
  validateReceiptLines,
  type ReceiptLineInput,
  type TransferLineState,
} from "@/lib/services/inventory-transfer-receipt.service";

const EPSILON = 0.0001;


const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * Inventory Transfer Hook - Observer pattern replacement.
 * Handles stock movement between warehouses.
 *
 * Status contract (action-owned):
 *   draft → processed  (via processInventoryTransfer → onTransferProcessed)
 *   processed → received (via receiveInventoryTransfer → onTransferReceived)
 */

// ─────────────────────────────────────────────────────────────────────────────
// onTransferProcessed
// Creates Stock Move OUT from source warehouse for each item.
// Idempotent: returns silently if OUT moves already exist for this transfer.
// ─────────────────────────────────────────────────────────────────────────────

export async function onTransferProcessed(
  transferId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same transfer (prevents double-processing
    // racing past the idempotency check below).
    await tx.$queryRaw`SELECT id FROM inventory_transfers WHERE id = ${transferId} FOR UPDATE`;
    const transfer = await tx.inventoryTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { items: true },
    });

    // Enforce period lock — transfer date must fall in an open period.
    await assertPeriodOpen(transfer.date, tx);

    // Idempotency: skip when stock moves already exist (logged — caller-visible in prod logs)
    const existingOutMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "OUT",
      },
    });
    if (existingOutMoves) {
      console.info(
        `[inventory-transfer.hook] transfer #${transferId} sudah punya movement OUT — pemrosesan dilewati`,
      );
      return;
    }

    // Aggregate by itemId before generating moves. A duplicate item row would
    // otherwise create two OUT moves that split the FIFO consume across layers
    // at different costs; the IN side matches OUT by itemId via findFirst and
    // would reuse the first OUT move's cost for every duplicate row, drifting
    // the destination layer cost basis. One move per item keeps OUT and IN
    // costs consistent. No-op for the normal one-row-per-item case.
    const aggregated = new Map<number, number>();
    for (const it of transfer.items) {
      const q = Number(it.qty);
      if (q > 0) aggregated.set(it.itemId, safeAdd(aggregated.get(it.itemId) ?? 0, q, 2));
    }

    // Row that carries the FIFO lot/serial allocation for each item. Consumption
    // is aggregated above, so exactly one row per item stores the allocation —
    // duplicate rows for the same item must not each get a copy, otherwise
    // receive would re-create the destination lot twice.
    const allocationRowByItem = new Map<number, number>();
    for (const it of transfer.items) {
      if (!allocationRowByItem.has(it.itemId)) allocationRowByItem.set(it.itemId, it.id);
    }

    // Create Stock Move OUT per item from source warehouse
    const aggregatedItems = Array.from(aggregated.entries());
    if (aggregatedItems.length > 0) {
      // 1. Batch-generate one document number per item (was N serial round-trips).
      const smDocNos = await generateDocumentNumberBatch("SM", aggregatedItems.length);
      // 2. Lock all item rows in a single query (was N serial FOR UPDATE).
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(aggregatedItems.map(([id]) => id))}) FOR UPDATE`;

      let docIdx = 0;
      for (const [itemId, qty] of aggregatedItems) {
        const smDocNo = smDocNos[docIdx++];

        // Consume FIFO from the SOURCE warehouse — track cost so the destination
        // layer can preserve the cost basis (avoids transfers zeroing out COGS).
        const { consumedCost, consumedSerials, consumedBatches } = await consumeFifoLayers(tx, {
          itemId: itemId,
          warehouseId: transfer.sourceWarehouseId,
          qty: qty,
          label: `transfer ${transfer.documentNo}`,
          // F-2026-10-21-011: lot kedaluwarsa tidak boleh berpindah gudang.
          documentDate: transfer.date,
        });
        const unitCost = qty > 0 ? consumedCost / qty : 0;

        // Persist what was consumed. A transfer MOVES stock: the destination must
        // rebuild these lots and revive these serials on receive, otherwise the
        // source lots are decremented and the serials remain "used" forever while
        // the destination shows qty with no lot/serial behind it.
        const allocationRowId = allocationRowByItem.get(itemId);
        if (allocationRowId != null && (consumedSerials.length > 0 || consumedBatches.length > 0)) {
          await tx.inventoryTransferItem.update({
            where: { id: allocationRowId },
            data: {
              ...(consumedSerials.length > 0 ? { serialNumbers: consumedSerials } : {}),
              ...(consumedBatches.length > 0
                ? { batchAllocations: consumedBatches as unknown as Prisma.InputJsonValue }
                : {}),
            },
          });
        }

        await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            slug: slugify(smDocNo),
            itemId: itemId,
            warehouseId: transfer.sourceWarehouseId,
            qty: qty,
            cost: unitCost,
            impact: "OUT",
            status: "posted",
            referenceType: "InventoryTransfer",
            referenceId: transfer.id,
            notes: `Transfer OUT ke WH#${transfer.destinationWarehouseId} - ${transfer.documentNo}`,
            createdBy: userId ?? null,
          },
        });

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${itemId}`;
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// onTransferReceived
// Creates Stock Move IN to destination warehouse for each item.
//
// Dua jalur:
// - TANPA `receipt`: perilaku lama all-or-nothing (terima penuh). Idempotent
//   per transfer: skip total bila IN moves sudah ada. Dipakai pemanggil lama.
// - DENGAN `receipt` (F-2026-10-22-081-S): SATU kejadian terima parsial.
//   Guard skip-total lama DILARANG di sini (BR-TP-06) — idempotency per
//   kejadian lewat InventoryTransferReceipt.idempotencyKey unik. Hanya qty
//   kejadian ini yang masuk, pada carried cost OUT; receivedQty per baris
//   bertambah; status sesudahnya dikembalikan untuk ditulis aksi.
//   NOL jurnal dari kedua jalur (vonis BOT 4).
// ─────────────────────────────────────────────────────────────────────────────

export interface TransferReceiptInput {
  receivedDate: Date;
  idempotencyKey: string;
  lines: ReceiptLineInput[];
}

interface InboundEntry {
  itemId: number;
  qty: number;
  serials: string[];
  batches: ConsumedBatch[];
}

async function carriedCostByItem(tx: TxClient, transferId: number, itemIds: number[]): Promise<Map<number, number>> {
  const outMoves =
    itemIds.length === 0
      ? []
      : await tx.stockMove.findMany({
          where: {
            referenceType: "InventoryTransfer",
            referenceId: transferId,
            impact: "OUT",
            itemId: { in: itemIds },
          },
          select: { itemId: true, cost: true },
        });
  return carriedCostMapFromOutMoves(outMoves);
}

async function createInboundMoves(
  tx: TxClient,
  transfer: { id: number; documentNo: string; sourceWarehouseId: number; destinationWarehouseId: number },
  entries: InboundEntry[],
  userId?: number,
  prefetchedItemMetas?: readonly { id: number; trackBatch?: boolean; trackSerial?: boolean }[],
): Promise<void> {
  if (entries.length === 0) return;
  const costs = await carriedCostByItem(tx, transfer.id, entries.map((e) => e.itemId));

  // Penjaga fail-closed per item (agregat): serial/batch wajib tepat qty.
  // Pemeriksaan batches.length===0 saja tidak cukup — alokasi parsial akan
  // melahirkan layer tanpa batchNumber dan serial yang tidak dihidupkan
  // kembali menjadi stok tak terjual di tujuan (TASK-012).
  const trackedRows =
    prefetchedItemMetas ??
    (await tx.item.findMany({
      where: { id: { in: entries.map((e) => e.itemId) } },
      select: { id: true, trackBatch: true, trackSerial: true },
    })) ??
    [];
  const trackBatchByItem = new Map(trackedRows.map((r) => [r.id, r.trackBatch]));
  const trackSerialByItem = new Map(trackedRows.map((r) => [r.id, r.trackSerial]));
  for (const entry of entries) {
    if (trackSerialByItem.get(entry.itemId)) {
      if (entry.serials.length === 0 || Math.abs(entry.serials.length - entry.qty) > EPSILON) {
        throw new Error(
          `Item berseri #${entry.itemId} memerlukan tepat ${entry.qty} nomor seri untuk penerimaan transfer ${transfer.documentNo}.`,
        );
      }
      if (new Set(entry.serials).size !== entry.serials.length) {
        throw new Error(
          `Item berseri #${entry.itemId} memiliki nomor seri duplikat untuk penerimaan transfer ${transfer.documentNo}.`,
        );
      }
    }
    if (trackBatchByItem.get(entry.itemId)) {
      if (entry.batches.length === 0) {
        throw new Error(
          `Item batch #${entry.itemId} memerlukan alokasi nomor batch untuk penerimaan transfer ${transfer.documentNo}.`,
        );
      }
      const batchTotal = entry.batches.reduce((sum, b) => safeAdd(sum, b.qty, 2), 0);
      if (Math.abs(batchTotal - entry.qty) > EPSILON) {
        throw new Error(
          `Alokasi batch untuk item #${entry.itemId} wajib menjumlah tepat sama dengan qty diterima (${entry.qty}) pada transfer ${transfer.documentNo}; diterima ${batchTotal}.`,
        );
      }
    }
  }

  const smDocNos = await generateDocumentNumberBatch("SM", entries.length);
  let docIdx = 0;
  for (const entry of entries) {
    const smDocNo = smDocNos[docIdx++];
    const carriedUnitCost = costs.get(entry.itemId) ?? 0;
    const createdMove = await tx.stockMove.create({
      data: {
        documentNo: smDocNo,
        slug: slugify(smDocNo),
        itemId: entry.itemId,
        warehouseId: transfer.destinationWarehouseId,
        qty: entry.qty,
        cost: carriedUnitCost,
        impact: "IN",
        status: "posted",
        referenceType: "InventoryTransfer",
        referenceId: transfer.id,
        notes: `Transfer IN dari WH#${transfer.sourceWarehouseId} - ${transfer.documentNo}`,
        createdBy: userId ?? null,
      },
      select: { id: true },
    });

    await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${entry.qty} WHERE id = ${entry.itemId}`;

    if (entry.serials.length > 0) {
      const restored = await tx.itemSerial.updateMany({
        where: { itemId: entry.itemId, serialNumber: { in: entry.serials }, status: "used" },
        data: { status: "available", warehouseId: transfer.destinationWarehouseId },
      });
      if (restored.count !== entry.serials.length) {
        throw new Error(`Alokasi nomor seri transfer ${transfer.documentNo} tidak cocok dengan serial berstatus used untuk item #${entry.itemId}.`);
      }
    }

    const batchQtyByNumber = new Map<string, number>();
    for (const allocation of entry.batches) {
      batchQtyByNumber.set(
        allocation.batchNumber,
        safeAdd(batchQtyByNumber.get(allocation.batchNumber) ?? 0, allocation.qty, 2),
      );
    }
    const allocatedBatchQty = Array.from(batchQtyByNumber.values()).reduce((total, value) => safeAdd(total, value, 2), 0);
    if (allocatedBatchQty > entry.qty) {
      throw new Error(`Alokasi batch transfer ${transfer.documentNo} melebihi kuantitas transfer untuk item #${entry.itemId}.`);
    }

    const batchNumbers = Array.from(batchQtyByNumber.keys());
    const sourceBatches = batchNumbers.length > 0
      ? await tx.itemBatch.findMany({
          where: { itemId: entry.itemId, warehouseId: transfer.sourceWarehouseId, batchNumber: { in: batchNumbers } },
          select: { batchNumber: true, manufacturingDate: true, expiryDate: true, notes: true },
        })
      : [];
    const sourceBatchByNumber = new Map(sourceBatches.map((batch) => [batch.batchNumber, batch]));

    for (const [batchNumber, batchQty] of batchQtyByNumber) {
      const sourceBatch = sourceBatchByNumber.get(batchNumber);
      const destinationBatch = await tx.itemBatch.findFirst({
        where: { itemId: entry.itemId, warehouseId: transfer.destinationWarehouseId, batchNumber },
        select: { id: true },
      });
      if (destinationBatch) {
        await tx.itemBatch.update({ where: { id: destinationBatch.id }, data: { qty: { increment: batchQty } } });
      } else {
        await tx.itemBatch.create({
          data: {
            itemId: entry.itemId,
            warehouseId: transfer.destinationWarehouseId,
            batchNumber,
            qty: batchQty,
            manufacturingDate: sourceBatch?.manufacturingDate ?? null,
            expiryDate: sourceBatch?.expiryDate ?? null,
            notes: sourceBatch?.notes ?? null,
          },
        });
      }
      await createInLayer(tx, {
        itemId: entry.itemId,
        warehouseId: transfer.destinationWarehouseId,
        batchNumber,
        stockMoveId: createdMove.id,
        qty: batchQty,
        unitCost: carriedUnitCost,
      });
    }

    const unbatchedQty = safeAdd(entry.qty - allocatedBatchQty, 0, 2);
    if (unbatchedQty > 0 || batchQtyByNumber.size === 0) {
      await createInLayer(tx, {
        itemId: entry.itemId,
        warehouseId: transfer.destinationWarehouseId,
        stockMoveId: createdMove.id,
        qty: batchQtyByNumber.size === 0 ? entry.qty : unbatchedQty,
        unitCost: carriedUnitCost,
      });
    }
  }
}

function parseStoredBatches(value: unknown, sourceWarehouseId: number): ConsumedBatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ConsumedBatch[] => {
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") return [];
    const allocation = entry as { batchNumber?: unknown; qty?: unknown };
    const qty = Number(allocation.qty);
    if (typeof allocation.batchNumber !== "string" || !Number.isFinite(qty) || qty <= 0) return [];
    return [{ batchNumber: allocation.batchNumber, warehouseId: sourceWarehouseId, qty }];
  });
}

export async function onTransferReceived(
  transferId: number,
  userId?: number,
  txClient?: TxClient,
  receipt?: TransferReceiptInput,
): Promise<"received" | "partially_received" | undefined> {
  let nextStatus: "received" | "partially_received" | undefined;
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same transfer.
    await tx.$queryRaw`SELECT id FROM inventory_transfers WHERE id = ${transferId} FOR UPDATE`;
    const transfer = await tx.inventoryTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { items: true },
    });

    if (receipt) {
      // Q-TP-1: periode dinilai per TANGGAL KEJADIAN, bukan tanggal kirim.
      await assertPeriodOpen(receipt.receivedDate, tx);
      if (
        transfer.status !== "processed" &&
        transfer.status !== "partially_received" &&
        transfer.status !== "receiving"
      ) {
        throw new Error("Transfer harus berstatus 'processed' untuk diterima.");
      }

      const priorReceiptItems = await tx.inventoryTransferReceiptItem.findMany({
        where: { receipt: { inventoryTransferId: transferId } },
        select: { inventoryTransferItemId: true, serialNumbers: true, batchAllocations: true },
      });
      const receivedSerialsByLine = groupReceivedSerialsByLine(priorReceiptItems);
      const receivedBatchesByLine = groupReceivedBatchesByLine(priorReceiptItems);

      const itemMetas =
        transfer.items.length === 0
          ? []
          : await tx.item.findMany({
              where: { id: { in: [...new Set(transfer.items.map((it) => it.itemId))] } },
              select: { id: true, trackSerial: true, trackBatch: true },
            });
      const itemMetaById = new Map(itemMetas.map((m) => [m.id, m]));

      const lineStates: TransferLineState[] = transfer.items.map((it) => ({
        id: it.id,
        itemId: it.itemId,
        qty: Number(it.qty),
        receivedQty: Number(it.receivedQty),
        serialNumbers: parseStoredSerials(it.serialNumbers),
        batchAllocations: parseStoredBatchAllocations(it.batchAllocations),
        trackSerial: itemMetaById.get(it.itemId)?.trackSerial,
        trackBatch: itemMetaById.get(it.itemId)?.trackBatch,
      }));
      const lines = validateReceiptLines(
        lineStates,
        receipt.lines,
        receivedSerialsByLine,
        receivedBatchesByLine,
      );
      const lineById = new Map(lineStates.map((l) => [l.id, l]));

      // Satu StockMove IN per item per kejadian (agregasi pola existing);
      // receivedQty tetap bertambah PER BARIS di bawah.
      const entriesByItem = new Map<number, InboundEntry>();
      for (const line of lines) {
        const state = lineById.get(line.transferItemId)!;
        const entry = entriesByItem.get(state.itemId) ?? { itemId: state.itemId, qty: 0, serials: [], batches: [] };
        entry.qty = safeAdd(entry.qty, line.qty, 2);
        entry.serials.push(...(line.serialNumbers ?? []));
        entry.batches.push(
          ...(line.batchAllocations ?? []).map((b) => ({
            batchNumber: b.batchNumber,
            warehouseId: transfer.sourceWarehouseId,
            qty: b.qty,
          })),
        );
        entriesByItem.set(state.itemId, entry);
      }
      // Batch-tracked tanpa alokasi lot pada KEJADIAN ini ditolak walau
      // transfer membawa alokasi kirim: penerima wajib menyebut lot tiba.
      await createInboundMoves(tx, transfer, Array.from(entriesByItem.values()), userId, itemMetas);

      await tx.inventoryTransferReceipt.create({
        data: {
          inventoryTransferId: transferId,
          receivedDate: receipt.receivedDate,
          receivedBy: userId ?? null,
          idempotencyKey: receipt.idempotencyKey,
          items: {
            create: lines.map((line) => ({
              inventoryTransferItemId: line.transferItemId,
              qty: line.qty,
              ...(line.serialNumbers ? { serialNumbers: [...line.serialNumbers] } : {}),
              ...(line.batchAllocations
                ? { batchAllocations: line.batchAllocations as unknown as Prisma.InputJsonValue }
                : {}),
            })),
          },
        },
        select: { id: true },
      });

      const updatedLines = lineStates.map((line) => {
        const received = lines
          .filter((l) => l.transferItemId === line.id)
          .reduce((sum, l) => safeAdd(sum, l.qty, 2), 0);
        return { ...line, receivedQty: safeAdd(line.receivedQty, received, 2) };
      });
      for (const line of lines) {
        await tx.inventoryTransferItem.update({
          where: { id: line.transferItemId },
          data: { receivedQty: { increment: line.qty } },
        });
      }
      nextStatus = deriveTransferStatusAfterReceipt(updatedLines);
      return;
    }

    // ── Jalur lama: terima penuh all-or-nothing ──
    // Enforce period lock — transfer date must fall in an open period.
    await assertPeriodOpen(transfer.date, tx);

    // Idempotency: skip when IN moves already exist (logged — caller-visible in prod logs)
    const existingInMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "IN",
      },
    });
    if (existingInMoves) {
      console.info(
        `[inventory-transfer.hook] transfer #${transferId} sudah punya movement IN — pemrosesan dilewati`,
      );
      return;
    }

    // Guard: must be processed (OUT already posted) before receiving. The
    // action also accepts the transient "receiving" claim state — it flips
    // processed -> receiving as an atomic claim BEFORE calling this hook
    // (without a txClient), so the hook re-reads committed "receiving" state.
    if (transfer.status !== "processed" && transfer.status !== "receiving") {
      throw new Error("Transfer harus berstatus 'processed' untuk diterima.");
    }

    // Aggregate by itemId — mirrors onTransferProcessed so each item has exactly
    // one IN move matching its single OUT move.
    const entriesByItem = new Map<number, InboundEntry>();
    for (const it of transfer.items) {
      const q = Number(it.qty);
      if (q <= 0) continue;
      const entry = entriesByItem.get(it.itemId) ?? { itemId: it.itemId, qty: 0, serials: [], batches: [] };
      entry.qty = safeAdd(entry.qty, q, 2);
      entry.serials.push(...parseStoredSerials(it.serialNumbers));
      entry.batches.push(...parseStoredBatches(it.batchAllocations, transfer.sourceWarehouseId));
      entriesByItem.set(it.itemId, entry);
    }
    await createInboundMoves(tx, transfer, Array.from(entriesByItem.values()), userId);
    nextStatus = "received";
  });
  return nextStatus;
}
