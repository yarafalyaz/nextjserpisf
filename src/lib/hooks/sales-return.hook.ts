// @ts-nocheck
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Sales Return Hook - Observer pattern replacement.
 * Triggered when a Sales Return is completed.
 * Creates Stock Move IN per item (returned goods back to warehouse).
 */

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const salesReturn = await tx.salesReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: { include: { item: true } } },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "SalesReturn",
        referenceId: returnId,
      },
    });
    if (existingMoves) {
      throw new Error("Stock Move sudah dibuat untuk Sales Return ini.");
    }

    // Guard: must not be already completed
    if (salesReturn.status === "completed") {
      throw new Error("Sales Return sudah selesai sebelumnya.");
    }

    // Create Stock Move IN per item (goods returned to warehouse)
    for (const item of salesReturn.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: salesReturn.warehouseId,
          qty: item.qty,
          cost: item.unitCost ?? 0,
          impact: "IN",
          status: "draft",
          referenceType: "SalesReturn",
          referenceId: salesReturn.id,
          notes: `Retur Penjualan ${salesReturn.documentNo} - ${item.item?.name ?? ""}`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update Sales Return status
    await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });
  });
}
