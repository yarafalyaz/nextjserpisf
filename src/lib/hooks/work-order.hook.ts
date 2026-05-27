
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Work Order Hook - Observer pattern replacement.
 * Triggered when a Work Order is completed.
 * Creates Stock Move OUT per item (materials consumed).
 * Creates Journal Entry (Dr WIP, Cr Inventory)
 */

export async function onWorkOrderCompleted(
  workOrderId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { items: true },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "WorkOrder",
        referenceId: workOrderId,
      },
    });
    if (existingMoves) {
      throw new Error("Stock Move sudah dibuat untuk Work Order ini.");
    }

    // Guard: must not be already completed
    if (workOrder.status === "completed") {
      throw new Error("Work Order sudah selesai sebelumnya.");
    }

    // Get default warehouse for stock moves
    const warehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    const warehouseId = warehouse?.id ?? 1;

    // Create Stock Move OUT per item (materials consumed in production)
    for (const item of workOrder.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "OUT",
          status: "draft",
          referenceType: "WorkOrder",
          referenceId: workOrder.id,
          notes: `Pemakaian Material WO ${workOrder.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(item.qty)} WHERE id = ${item.itemId}`;
    }

    // Create Journal Entry (Dr WIP, Cr Inventory)
    await stockJournalService.onWorkOrderCompleted(
      tx as any,
      workOrder.items
        .filter((i) => Number(i.qty) > 0)
        .map((i) => ({
          qty: Number(i.qty),
          cost: Number(i.cost),
        })),
      workOrder.documentNo ?? `WO-${workOrderId}`,
      workOrderId,
      userId
    );

    // Update Work Order status
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "completed",
        endDate: new Date(),
      },
    });
  });
}
