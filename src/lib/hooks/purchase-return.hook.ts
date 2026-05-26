// @ts-nocheck
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Purchase Return Hook - Observer pattern replacement.
 * Triggered when a Purchase Return is processed.
 * Creates Stock Move OUT per item (goods returned to vendor).
 */

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchaseReturn = await tx.purchaseReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: { include: { item: true } } },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "PurchaseReturn",
        referenceId: returnId,
      },
    });
    if (existingMoves) {
      throw new Error("Stock Move sudah dibuat untuk Purchase Return ini.");
    }

    // Guard: must not be already processed
    if (purchaseReturn.status === "processed") {
      throw new Error("Purchase Return sudah diproses sebelumnya.");
    }

    // Create Stock Move OUT per item (goods returned to vendor)
    for (const item of purchaseReturn.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: purchaseReturn.warehouseId,
          qty: item.qty,
          cost: item.unitCost ?? 0,
          impact: "OUT",
          status: "draft",
          referenceType: "PurchaseReturn",
          referenceId: purchaseReturn.id,
          notes: `Retur Pembelian ${purchaseReturn.documentNo} - ${item.item?.name ?? ""}`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update Purchase Return status
    await tx.purchaseReturn.update({
      where: { id: returnId },
      data: {
        status: "processed",
        processedAt: new Date(),
        processedBy: userId ?? null,
      },
    });
  });
}
