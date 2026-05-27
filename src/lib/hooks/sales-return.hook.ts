
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Sales Return Hook - Observer pattern replacement.
 * Triggered when a Sales Return is completed.
 * Creates Stock Move IN per item (returned goods back to warehouse).
 * Creates Journal Entry (Dr Inventory, Cr Sales Return)
 */

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const salesReturn = await tx.salesReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: true },
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

    // Get default warehouse (first active warehouse)
    const warehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    const warehouseId = warehouse?.id ?? 1;

    // Create Stock Move IN per item (goods returned to warehouse)
    for (const item of salesReturn.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "IN",
          status: "draft",
          referenceType: "SalesReturn",
          referenceId: salesReturn.id,
          notes: `Retur Penjualan ${salesReturn.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${Number(item.qty)} WHERE id = ${item.itemId}`;
    }

    // Create Journal Entry (Dr Inventory, Cr Sales Return)
    await stockJournalService.onSalesReturn(
      tx as any,
      salesReturn.items.map((i) => ({
        qty: Number(i.qty),
        cost: Number(i.cost),
      })),
      salesReturn.documentNo ?? `SR-${returnId}`,
      returnId,
      userId
    );

    // Update Sales Return status
    await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        status: "completed",
      },
    });
  });
}
