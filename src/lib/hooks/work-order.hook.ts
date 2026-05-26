// @ts-nocheck
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Work Order Hook - Observer pattern replacement.
 * Triggered when a Work Order is completed.
 * Creates Stock Move OUT per item (materials consumed).
 */

export async function onWorkOrderCompleted(
  workOrderId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { items: { include: { item: true } } },
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

    // Create Stock Move OUT per item (materials consumed in production)
    for (const item of workOrder.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: workOrder.warehouseId,
          qty: item.qty,
          cost: item.unitCost ?? 0,
          impact: "OUT",
          status: "draft",
          referenceType: "WorkOrder",
          referenceId: workOrder.id,
          notes: `Pemakaian Material WO ${workOrder.documentNo} - ${item.item?.name ?? ""}`,
          createdBy: userId ?? null,
        },
      });
    }

    // Update Work Order status
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedBy: userId ?? null,
      },
    });
  });
}
