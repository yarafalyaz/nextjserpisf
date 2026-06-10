import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";

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
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
      if (q > 0) aggregated.set(it.itemId, (aggregated.get(it.itemId) ?? 0) + q);
    }

    // Create Stock Move OUT per item from source warehouse
    for (const [itemId, qty] of aggregated) {
      const smDocNo = await generateDocumentNumber("SM");

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${itemId} FOR UPDATE`;

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
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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

    // Guard: must be processed (OUT already posted) before receiving
    if (transfer.status !== "processed") {
      throw new Error("Transfer harus berstatus 'processed' untuk diterima.");
    }

    // Aggregate by itemId — mirrors onTransferProcessed so each item has exactly
    // one IN move matching its single OUT move. Prevents duplicate item rows from
    // each grabbing the first OUT move's cost via findFirst (cost-basis drift).
    const aggregated = new Map<number, number>();
    for (const it of transfer.items) {
      const q = Number(it.qty);
      if (q > 0) aggregated.set(it.itemId, (aggregated.get(it.itemId) ?? 0) + q);
    }

    // Create Stock Move IN per item to destination warehouse
    for (const [itemId, qty] of aggregated) {
      const smDocNo = await generateDocumentNumber("SM");

      // Preserve the cost basis carried by the matching OUT move (FIFO cost
      // captured when the transfer was processed) instead of zeroing it. With
      // one OUT move per item (see onTransferProcessed), this match is unique.
      const outMove = await tx.stockMove.findFirst({
        where: {
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          impact: "OUT",
          itemId: itemId,
        },
        select: { cost: true },
      });
      const carriedUnitCost = Number(outMove?.cost ?? 0);

      await tx.stockMove.create({
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
      });

      // Update item qtyOnHand (global total)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qty} WHERE id = ${itemId}`;

      // Create FIFO inventory layer for received stock in the DESTINATION warehouse
      const sm = await tx.stockMove.findFirst({
        where: { documentNo: smDocNo },
        select: { id: true },
      });
      if (sm) {
        await createInLayer(tx, {
          itemId: itemId,
          warehouseId: transfer.destinationWarehouseId,
          stockMoveId: sm.id,
          qty: qty,
          unitCost: carriedUnitCost,
        });
      }
    }
  });
}
