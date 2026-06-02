
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
    if (existingMoves) return; // Idempotent: silently no-op

    // Guard: must be in a completable state
    if (salesReturn.status === "completed" || salesReturn.status === "cancelled") {
      return; // already completed/cancelled; idempotent no-op
    }

    // Resolve warehouse: item default warehouse → first warehouse fallback
    const fallbackWarehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    if (!fallbackWarehouse) throw new Error("Tidak ada warehouse aktif.");

    // Create Stock Move IN per item (goods returned to warehouse)
    for (const item of salesReturn.items) {
      const smDocNo = await generateDocumentNumber("SM");

      // Resolve warehouse per item (chain: item default → fallback)
      const itemData = await tx.item.findUnique({ where: { id: item.itemId }, select: { defaultWarehouseId: true } });
      const resolvedWarehouseId = itemData?.defaultWarehouseId ?? fallbackWarehouse.id;

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: resolvedWarehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "IN",
          status: "posted",
          referenceType: "SalesReturn",
          referenceId: salesReturn.id,
          notes: `Retur Penjualan ${salesReturn.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${Number(item.qty)} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer (returned stock)
      await tx.inventoryLayer.create({
        data: {
          itemId: item.itemId,
          stockMoveId: sm.id,
          qtyIn: item.qty,
          qtyOut: 0,
          remaining: item.qty,
          unitCost: item.cost ?? 0,
        },
      });
    }

    // Create Journal Entry (Dr Inventory, Cr Sales Return)
    await stockJournalService.onSalesReturn(
      tx,
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
