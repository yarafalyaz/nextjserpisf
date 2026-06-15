import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import { safeAdd } from "@/lib/utils/math";


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

    // Idempotency: return silently if OUT moves already exist
    const existingOutMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "OUT",
      },
    });
    if (existingOutMoves) return;

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
        const { consumedCost } = await consumeFifoLayers(tx, {
          itemId: itemId,
          warehouseId: transfer.sourceWarehouseId,
          qty: qty,
          label: `transfer ${transfer.documentNo}`,
        });
        const unitCost = qty > 0 ? consumedCost / qty : 0;

        await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
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
// Idempotent: returns silently if IN moves already exist for this transfer.
// ─────────────────────────────────────────────────────────────────────────────

export async function onTransferReceived(
  transferId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same transfer.
    await tx.$queryRaw`SELECT id FROM inventory_transfers WHERE id = ${transferId} FOR UPDATE`;
    const transfer = await tx.inventoryTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { items: true },
    });

    // Idempotency: return silently if IN moves already exist
    const existingInMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "IN",
      },
    });
    if (existingInMoves) return;

    // Guard: must be processed (OUT already posted) before receiving. The
    // action also accepts the transient "receiving" claim state — it flips
    // processed -> receiving as an atomic claim BEFORE calling this hook
    // (without a txClient), so the hook re-reads committed "receiving" state.
    // Mirrors onTransferProcessed, which has no guard and relies on idempotency.
    if (transfer.status !== "processed" && transfer.status !== "receiving") {
      throw new Error("Transfer harus berstatus 'processed' untuk diterima.");
    }

    // Aggregate by itemId — mirrors onTransferProcessed so each item has exactly
    // one IN move matching its single OUT move. Prevents duplicate item rows from
    // each grabbing the first OUT move's cost via findFirst (cost-basis drift).
    const aggregated = new Map<number, number>();
    for (const it of transfer.items) {
      const q = Number(it.qty);
      if (q > 0) aggregated.set(it.itemId, safeAdd(aggregated.get(it.itemId) ?? 0, q, 2));
    }

    // Pre-fetch all OUT moves for this transfer in one query (was N+1: one
    // stockMove.findFirst per item). With one OUT move per item (see
    // onTransferProcessed), the (referenceId, impact, itemId) tuple is unique
    // — pick the first row per itemId below to be defensive.
    const outMoves =
      aggregated.size === 0
        ? []
        : await tx.stockMove.findMany({
            where: {
              referenceType: "InventoryTransfer",
              referenceId: transfer.id,
              impact: "OUT",
              itemId: { in: Array.from(aggregated.keys()) },
            },
            select: { itemId: true, cost: true },
          });
    const carriedCostByItem = new Map<number, number>();
    for (const om of outMoves) {
      if (!carriedCostByItem.has(om.itemId)) {
        carriedCostByItem.set(om.itemId, Number(om.cost));
      }
    }

    // Create Stock Move IN per item to destination warehouse
    const aggregatedItems = Array.from(aggregated.entries());
    if (aggregatedItems.length > 0) {
      // Batch-generate one document number per item (was N serial round-trips).
      const smDocNos = await generateDocumentNumberBatch("SM", aggregatedItems.length);

      let docIdx = 0;
      for (const [itemId, qty] of aggregatedItems) {
        const smDocNo = smDocNos[docIdx++];

        // Preserve the cost basis carried by the matching OUT move (FIFO cost
        // captured when the transfer was processed) instead of zeroing it.
        const carriedUnitCost = carriedCostByItem.get(itemId) ?? 0;

        // Capture the id from the create return value — eliminates the previous
        // tx.stockMove.findFirst({ where: { documentNo: smDocNo } }) round-trip
        // that was running once per item.
        const createdMove = await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            itemId: itemId,
            warehouseId: transfer.destinationWarehouseId,
            qty: qty,
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

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qty} WHERE id = ${itemId}`;

        // Create FIFO inventory layer for received stock in the DESTINATION warehouse
        await createInLayer(tx, {
          itemId: itemId,
          warehouseId: transfer.destinationWarehouseId,
          stockMoveId: createdMove.id,
          qty: qty,
          unitCost: carriedUnitCost,
        });
      }
    }
  });
}
