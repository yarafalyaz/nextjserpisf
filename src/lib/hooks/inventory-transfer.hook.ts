
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Inventory Transfer Hook - Observer pattern replacement.
 * Handles stock movement between warehouses.
 */

// ─────────────────────────────────────────────────────────────────────────────
// onTransferProcessed
// Creates Stock Move OUT from source warehouse for each item
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

    // Idempotency: check if OUT moves already exist
    const existingOutMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "OUT",
      },
    });
    if (existingOutMoves) {
      throw new Error("Stock Move OUT sudah dibuat untuk transfer ini.");
    }

    // Create Stock Move OUT per item from source warehouse
    for (const item of transfer.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.sourceWarehouseId,
          qty: item.qty,
          cost: 0,
          impact: "OUT",
          status: "draft",
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          notes: `Transfer OUT ke WH#${transfer.destinationWarehouseId} - ${transfer.documentNo}`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update transfer status
    await tx.inventoryTransfer.update({
      where: { id: transferId },
      data: { status: "in_transit" },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// onTransferReceived
// Creates Stock Move IN to destination warehouse for each item
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

    // Idempotency: check if IN moves already exist
    const existingInMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "InventoryTransfer",
        referenceId: transferId,
        impact: "IN",
      },
    });
    if (existingInMoves) {
      throw new Error("Stock Move IN sudah dibuat untuk transfer ini.");
    }

    // Guard: must be in transit
    if (transfer.status !== "in_transit") {
      throw new Error("Transfer harus berstatus 'in_transit' untuk diterima.");
    }

    // Create Stock Move IN per item to destination warehouse
    for (const item of transfer.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: transfer.destinationWarehouseId,
          qty: item.qty,
          cost: 0,
          impact: "IN",
          status: "draft",
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
          notes: `Transfer IN dari WH#${transfer.sourceWarehouseId} - ${transfer.documentNo}`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update transfer status
    await tx.inventoryTransfer.update({
      where: { id: transferId },
      data: {
        status: "received",
      },
    });
  });
}
