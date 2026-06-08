
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";

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
    // Serialize concurrent calls for the same work order.
    await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`;
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
      return; // already completed/cancelled; idempotent no-op
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

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;

      // Consume FIFO from the resolved warehouse (guards per-warehouse stock).
      await consumeFifoLayers(tx, {
        itemId: item.itemId,
        warehouseId: resolvedWarehouseId,
        qty: Number(item.qty),
        label: `WO ${workOrder.documentNo}`,
      });

      // Update item qtyOnHand (global total)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(item.qty)} WHERE id = ${item.itemId}`;
    }

    // Create Journal Entry (Dr WIP, Cr Inventory)
    await stockJournalService.onWorkOrderCompleted(
      tx,
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
