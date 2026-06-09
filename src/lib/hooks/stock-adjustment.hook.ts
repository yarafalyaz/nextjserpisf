
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import { InventoryStatus, Status } from "@/lib/constants";

/**
 * Stock Adjustment Hook - Observer pattern replacement.
 * Triggered when a Stock Adjustment is processed.
 * Creates Stock Move IN/OUT per item based on quantity difference.
 * Creates Journal Entry (Dr/Cr Inventory, Cr/Dr Stock Adjustment)
 */

export async function onStockAdjustmentProcessed(
  adjustmentId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Serialize concurrent calls for the same adjustment.
    await tx.$queryRaw`SELECT id FROM stock_adjustments WHERE id = ${adjustmentId} FOR UPDATE`;
    const adjustment = await tx.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      include: { items: true },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "StockAdjustment",
        referenceId: adjustmentId,
      },
    });
    if (existingMoves) return; // Idempotent: silently no-op

    // Guard: must be in a processable state
    if (adjustment.status === InventoryStatus.PROCESSED || adjustment.status === Status.CANCELLED) {
      return; // already processed/cancelled; idempotent no-op
    }

    // Create Stock Move per item based on difference
    for (const item of adjustment.items) {
      const diff = Number(item.difference);

      // Skip if no difference
      if (diff === 0) continue;

      const smDocNo = await generateDocumentNumber("SM");
      const impact = diff > 0 ? "IN" : "OUT";
      const qty = Math.abs(diff);

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: adjustment.warehouseId,
          qty,
          cost: item.unitCost,
          impact,
          status: "posted",
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          notes: `Penyesuaian Stok ${adjustment.documentNo} (${Number(item.systemQty)} → ${Number(item.actualQty)})`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      const qtyDiff = Number(item.difference);
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qtyDiff} WHERE id = ${item.itemId}`;

      // FIFO layer handling (scoped to the adjustment warehouse)
      if (qtyDiff > 0) {
        // Positive adjustment — create new layer in this warehouse
        await createInLayer(tx, {
          itemId: item.itemId,
          warehouseId: adjustment.warehouseId,
          stockMoveId: sm.id,
          qty: qtyDiff,
          unitCost: Number(item.unitCost ?? 0),
        });
      } else if (qtyDiff < 0) {
        // Negative adjustment — lock item row, then consume oldest layers in WH
        await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;
        await consumeFifoLayers(tx, {
          itemId: item.itemId,
          warehouseId: adjustment.warehouseId,
          qty: Math.abs(qtyDiff),
          label: `penyesuaian ${adjustment.documentNo}`,
        });
      }
    }

    // Create Journal Entry (Dr/Cr Inventory, Cr/Dr Stock Adjustment)
    await stockJournalService.onStockAdjustment(
      tx,
      adjustment.items.map((i) => ({
        qty: Number(i.actualQty),
        cost: Number(i.unitCost),
        difference: Number(i.difference),
      })),
      adjustment.documentNo ?? `ADJ-${adjustmentId}`,
      adjustmentId,
      userId
    );

    // Update Stock Adjustment status
    await tx.stockAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: InventoryStatus.PROCESSED,
        approvedBy: userId ?? null,
        approvedAt: new Date(),
      },
    });
  });
}
