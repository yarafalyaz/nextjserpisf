import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

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

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.sourceWarehouseId,
          qty: item.qty,
          cost: 0,
          impact: "OUT",
          status: "posted",
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          notes: `Transfer OUT ke WH#${transfer.destinationWarehouseId} - ${transfer.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand in source warehouse
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(item.qty)} WHERE id = ${item.itemId}`;

      // FIFO layer consumption
      const layers = await tx.inventoryLayer.findMany({
        where: { itemId: item.itemId, remaining: { gt: 0 } },
        orderBy: { createdAt: "asc" },
      });
      let qtyToConsume = Number(item.qty);
      for (const layer of layers) {
        if (qtyToConsume <= 0) break;
        const available = Number(layer.remaining);
        const consume = Math.min(available, qtyToConsume);
        await tx.inventoryLayer.update({
          where: { id: layer.id },
          data: { qtyOut: { increment: consume }, remaining: { decrement: consume } },
        });
        qtyToConsume -= consume;
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
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.destinationWarehouseId,
          qty: item.qty,
          cost: 0,
          impact: "IN",
          status: "posted",
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          notes: `Transfer IN dari WH#${transfer.sourceWarehouseId} - ${transfer.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand in destination warehouse
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${Number(item.qty)} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer for received stock
      const sm = await tx.stockMove.findFirst({
        where: { documentNo: smDocNo },
        select: { id: true },
      });
      if (sm) {
        await tx.inventoryLayer.create({
          data: {
            itemId: item.itemId,
            stockMoveId: sm.id,
            qtyIn: item.qty,
            qtyOut: 0,
            remaining: item.qty,
            unitCost: 0,
          },
        });
      }
    }
  });
}
