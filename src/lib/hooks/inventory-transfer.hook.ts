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

    // Create Stock Move OUT per item from source warehouse
    for (const item of transfer.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;

      // Consume FIFO from the SOURCE warehouse — track cost so the destination
      // layer can preserve the cost basis (avoids transfers zeroing out COGS).
      const { consumedCost } = await consumeFifoLayers(tx, {
        itemId: item.itemId,
        warehouseId: transfer.sourceWarehouseId,
        qty: Number(item.qty),
        label: `transfer ${transfer.documentNo}`,
      });
      const unitCost = Number(item.qty) > 0 ? consumedCost / Number(item.qty) : 0;

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.sourceWarehouseId,
          qty: item.qty,
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
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(item.qty)} WHERE id = ${item.itemId}`;
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

    // Create Stock Move IN per item to destination warehouse
    for (const item of transfer.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      // Preserve the cost basis carried by the matching OUT move (FIFO cost
      // captured when the transfer was processed) instead of zeroing it.
      const outMove = await tx.stockMove.findFirst({
        where: {
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          impact: "OUT",
          itemId: item.itemId,
        },
        select: { cost: true },
      });
      const carriedUnitCost = Number(outMove?.cost ?? 0);

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.destinationWarehouseId,
          qty: item.qty,
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
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${Number(item.qty)} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer for received stock in the DESTINATION warehouse
      const sm = await tx.stockMove.findFirst({
        where: { documentNo: smDocNo },
        select: { id: true },
      });
      if (sm) {
        await createInLayer(tx, {
          itemId: item.itemId,
          warehouseId: transfer.destinationWarehouseId,
          stockMoveId: sm.id,
          qty: Number(item.qty),
          unitCost: carriedUnitCost,
        });
      }
    }
  });
}
