
import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { WorkOrderStatus } from "@/lib/constants";


const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * Work Order Hook - Observer pattern replacement.
 * Triggered when a Work Order is completed.
 * Creates Stock Move OUT per item (materials consumed).
 * Creates Journal Entry (Dr WIP, Cr Inventory)
 */

export async function onWorkOrderCompleted(
  workOrderId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
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
    if (workOrder.status === WorkOrderStatus.COMPLETED || workOrder.status === WorkOrderStatus.CANCELLED) {
      return; // already completed/cancelled; idempotent no-op
    }

    // Resolve warehouse: WO warehouse (if exists) → project warehouse → item default warehouse
    // Per-item resolution below; this is just for items without default warehouse
    const fallbackWarehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    if (!fallbackWarehouse) throw new Error("Tidak ada warehouse aktif.");

    // Create Stock Move OUT per item (materials consumed in production).
    // Capture the ACTUAL FIFO-consumed cost so the StockMove and GL journal use
    // the real layer cost — not the stored item.cost master snapshot, which
    // drifts from FIFO once purchase prices change. Mirrors the sales-invoice
    // COGS fix (accounting.hook onSalesInvoicePosted). consumeFifoLayers throws
    // on insufficient stock here (no allowShortfall), so consumedCost always
    // reflects the full quantity.
    const journalLines: { qty: number; cost: number }[] = [];
    for (const item of workOrder.items) {
      if (Number(item.qty) <= 0) continue;

      // Resolve warehouse per item (chain: item default → fallback)
      const itemData = await tx.item.findUnique({ where: { id: item.itemId }, select: { defaultWarehouseId: true } });
      const resolvedWarehouseId = itemData?.defaultWarehouseId ?? fallbackWarehouse.id;

      const qty = Number(item.qty);

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;

      // Consume FIFO from the resolved warehouse (guards per-warehouse stock)
      // and read back the true consumed cost.
      const { consumedCost } = await consumeFifoLayers(tx, {
        itemId: item.itemId,
        warehouseId: resolvedWarehouseId,
        qty,
        label: `WO ${workOrder.documentNo}`,
      });
      const moveUnitCost = qty > 0 ? consumedCost / qty : Number(item.cost);

      const smDocNo = await generateDocumentNumber("SM");
      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: resolvedWarehouseId,
          qty: item.qty,
          cost: moveUnitCost,
          impact: "OUT",
          status: "posted",
          referenceType: "WorkOrder",
          referenceId: workOrder.id,
          notes: `Pemakaian Material WO ${workOrder.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand (global total)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${item.itemId}`;

      journalLines.push({ qty, cost: moveUnitCost });
    }

    // Create Journal Entry (Dr WIP, Cr Inventory) at the actual FIFO cost
    await stockJournalService.onWorkOrderCompleted(
      tx,
      journalLines,
      workOrder.documentNo ?? `WO-${workOrderId}`,
      workOrderId,
      userId
    );

    // Update Work Order status
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: WorkOrderStatus.COMPLETED,
        endDate: new Date(),
      },
    });
  });
}
