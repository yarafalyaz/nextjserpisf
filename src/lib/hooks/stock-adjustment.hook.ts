// @ts-nocheck
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Stock Adjustment Hook - Observer pattern replacement.
 * Triggered when a Stock Adjustment is processed.
 * Creates Stock Move IN/OUT per item based on quantity difference.
 */

export async function onStockAdjustmentProcessed(
  adjustmentId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const adjustment = await tx.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      include: { items: { include: { item: true } } },
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
      const currentQty = Number(item.currentQty);
      const newQty = Number(item.newQty);
      const diff = newQty - currentQty;

      // Skip if no difference
      if (diff === 0) continue;

      const smDocNo = await generateDocumentNumber("SM");
      const impact = diff > 0 ? "IN" : "OUT";
      const qty = Math.abs(diff);

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: adjustment.warehouseId,
          qty,
          cost: item.unitCost ?? 0,
          impact,
          status: "draft",
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          notes: `Penyesuaian Stok ${adjustment.documentNo} - ${item.item?.name ?? ""} (${currentQty} → ${newQty})`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update Stock Adjustment status
    await tx.stockAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: "processed",
        processedAt: new Date(),
        processedBy: userId ?? null,
      },
    });
  });
}
