
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

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
    if (existingMoves) {
      throw new Error("Stock Move sudah dibuat untuk Stock Adjustment ini.");
    }

    // Guard: must not be already processed
    if (adjustment.status === "processed") {
      throw new Error("Stock Adjustment sudah diproses sebelumnya.");
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
          status: "draft",
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          notes: `Penyesuaian Stok ${adjustment.documentNo} (${Number(item.systemQty)} → ${Number(item.actualQty)})`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      const qtyDiff = Number(item.difference);
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qtyDiff} WHERE id = ${item.itemId}`;

      // FIFO layer handling
      if (qtyDiff > 0) {
        // Positive adjustment — create new layer
        await tx.inventoryLayer.create({
          data: {
            itemId: item.itemId,
            stockMoveId: sm.id,
            qtyIn: qtyDiff,
            qtyOut: 0,
            remaining: qtyDiff,
            unitCost: item.unitCost ?? 0,
          },
        });
      } else if (qtyDiff < 0) {
        // Negative adjustment — consume from oldest layers
        const layers = await tx.inventoryLayer.findMany({
          where: { itemId: item.itemId, remaining: { gt: 0 } },
          orderBy: { createdAt: "asc" },
        });
        let qtyToConsume = Math.abs(qtyDiff);
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
    }

    // Create Journal Entry (Dr/Cr Inventory, Cr/Dr Stock Adjustment)
    await stockJournalService.onStockAdjustment(
      tx as any,
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
        status: "processed",
        approvedBy: userId ?? null,
        approvedAt: new Date(),
      },
    });
  });
}
