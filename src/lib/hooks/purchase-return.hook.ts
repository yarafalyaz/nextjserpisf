
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Purchase Return Hook - Observer pattern replacement.
 * Triggered when a Purchase Return is processed.
 * Creates Stock Move OUT per item (goods returned to vendor).
 * Creates Journal Entry (Dr Purchase Return, Cr Inventory)
 */

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchaseReturn = await tx.purchaseReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: true, purchaseOrder: true },
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

    // Get warehouse from related goods receipt of the same PO
    const goodsReceipt = await tx.goodsReceipt.findFirst({
      where: { purchaseOrderId: purchaseReturn.purchaseOrderId },
      select: { warehouseId: true },
    });
    const warehouseId = goodsReceipt?.warehouseId ?? 1;

    // Create Stock Move OUT per item (goods returned to vendor)
    for (const item of purchaseReturn.items) {
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
          referenceType: "PurchaseReturn",
          referenceId: purchaseReturn.id,
          notes: `Retur Pembelian ${purchaseReturn.documentNo}`,
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

    // Create Journal Entry (Dr Purchase Return, Cr Inventory)
    await stockJournalService.onPurchaseReturn(
      tx as any,
      purchaseReturn.items.map((i) => ({
        qty: Number(i.qty),
        cost: Number(i.cost),
      })),
      purchaseReturn.documentNo ?? `PRET-${returnId}`,
      returnId,
      userId
    );

    // Update Purchase Return status
    await tx.purchaseReturn.update({
      where: { id: returnId },
      data: {
        status: "processed",
      },
    });
  });
}
