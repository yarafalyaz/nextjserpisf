import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Purchase Return Hook - Observer pattern replacement.
 * Triggered when a Purchase Return is returned.
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

    // Idempotency: return silently if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "PurchaseReturn",
        referenceId: returnId,
      },
    });
    if (existingMoves) return;

    // Guard: already returned
    if (purchaseReturn.status === "returned") return;

    // Warehouse resolution fallback:
    // 1) latest Goods Receipt warehouse for same PO
    // 2) returned item's default warehouse
    // 3) first active warehouse
    // 4) first warehouse
    const goodsReceipt = await tx.goodsReceipt.findFirst({
      where: { purchaseOrderId: purchaseReturn.purchaseOrderId },
      select: { warehouseId: true },
      orderBy: { createdAt: "desc" },
    });

    const activeWarehouse = await tx.warehouse.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const anyWarehouse = activeWarehouse
      ? null
      : await tx.warehouse.findFirst({ select: { id: true }, orderBy: { id: "asc" } });

    // Create Stock Move OUT per item (goods returned to vendor)
    for (const item of purchaseReturn.items) {
      if (Number(item.qty) <= 0) continue;

      const dbItem = await tx.item.findUnique({
        where: { id: item.itemId },
        select: { defaultWarehouseId: true },
      });
      const warehouseId = goodsReceipt?.warehouseId
        ?? dbItem?.defaultWarehouseId
        ?? activeWarehouse?.id
        ?? anyWarehouse?.id;

      if (!warehouseId) {
        throw new Error("Warehouse retur pembelian tidak ditemukan.");
      }

      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "OUT",
          status: "posted",
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
        status: "returned",
      },
    });
  });
}
