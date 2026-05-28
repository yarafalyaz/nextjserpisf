
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
    if (existingMoves) return; // Idempotent: silently no-op

    // Guard: must be in a completable state
    if (workOrder.status === "completed" || workOrder.status === "cancelled") {
      throw new Error("Work Order sudah selesai atau dibatalkan.");
    }

    // Resolve warehouse: WO warehouse (if exists) → project warehouse → item default warehouse
    // Per-item resolution below; this is just for items without default warehouse
    const fallbackWarehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    if (!fallbackWarehouse) throw new Error("Tidak ada warehouse aktif.");

    // Create Stock Move OUT per item (materials consumed in production)
    for (const item of workOrder.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      // Resolve warehouse per item (chain: item default → fallback)
      const itemData = await tx.item.findUnique({ where: { id: item.itemId }, select: { defaultWarehouseId: true } });
      const resolvedWarehouseId = itemData?.defaultWarehouseId ?? fallbackWarehouse.id;

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: resolvedWarehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "OUT",
          status: "posted",
          referenceType: "WorkOrder",
          referenceId: workOrder.id,
          notes: `Pemakaian Material WO ${workOrder.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
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
