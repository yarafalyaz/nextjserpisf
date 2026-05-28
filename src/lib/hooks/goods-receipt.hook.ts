
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Goods Receipt Hook - Observer pattern replacement.
 * Triggered when a Goods Receipt is verified.
 * - Auto-generate document number
 * - Update PO status
 * - Create Stock Move IN
 * - Create Journal Entry (Dr Inventory, Cr Purchase Inventory Clearing)
 */

export async function onGoodsReceiptVerified(
  goodsReceiptId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const goodsReceipt = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: goodsReceiptId },
      include: {
        items: true,
        purchaseOrder: true,
      },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "GoodsReceipt",
        referenceId: goodsReceiptId,
      },
    });
    if (existingMoves) return; // Idempotent: silently no-op

    // Idempotency: check if already verified
    if (goodsReceipt.status === "verified") {
      return; // Already processed
    }

    // ─── 1. Auto-generate document number if not set ─────────────────────
    if (!goodsReceipt.documentNo) {
      const docNo = await generateDocumentNumber("GR");
      await tx.goodsReceipt.update({
        where: { id: goodsReceiptId },
        data: { documentNo: docNo },
      });
    }

    // ─── 2. Update PO status ─────────────────────────────────────────────
    if (goodsReceipt.purchaseOrderId) {
      // Check if all items in PO have been received
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: goodsReceipt.purchaseOrderId },
      });

      // Fix #44: Exclude current GR from the query to prevent double-counting
      const allGRItems = await tx.goodsReceiptItem.findMany({
        where: {
          goodsReceipt: {
            purchaseOrderId: goodsReceipt.purchaseOrderId,
            status: { in: ["verified", "completed"] },
            id: { not: goodsReceiptId }, // Exclude current GR
          },
        },
      });

      // Sum received quantities per item (including current GR)
      const receivedMap = new Map<number, number>();
      for (const grItem of allGRItems) {
        const current = receivedMap.get(grItem.itemId) ?? 0;
        receivedMap.set(grItem.itemId, current + Number(grItem.qty));
      }

      // Add current GR items
      for (const item of goodsReceipt.items) {
        const current = receivedMap.get(item.itemId) ?? 0;
        receivedMap.set(item.itemId, current + Number(item.qty));
      }

      // Determine if fully received
      const allReceived = poItems.every((poItem) => {
        const received = receivedMap.get(poItem.itemId) ?? 0;
        return received >= Number(poItem.qty);
      });

      await tx.purchaseOrder.update({
        where: { id: goodsReceipt.purchaseOrderId },
        data: {
          status: allReceived ? "received" : "partial_received",
        },
      });
    }

    // ─── 3. Create Stock Move IN per item ────────────────────────────────
    for (const item of goodsReceipt.items) {
      const smDocNo = await generateDocumentNumber("SM");

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: goodsReceipt.warehouseId,
          qty: item.qty,
          cost: item.unitCost ?? 0,
          impact: "IN",
          status: "posted",
          referenceType: "GoodsReceipt",
          referenceId: goodsReceipt.id,
          notes: `Penerimaan dari GR ${goodsReceipt.documentNo ?? ""}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${Number(item.qty)} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer
      await tx.inventoryLayer.create({
        data: {
          itemId: item.itemId,
          stockMoveId: sm.id,
          qtyIn: item.qty,
          qtyOut: 0,
          remaining: item.qty,
          unitCost: item.unitCost ?? 0,
        },
      });
    }

    // ─── 4. Create Journal Entry ──────────────────────────────────────
    await stockJournalService.onGoodsReceipt(
      tx as any,
      goodsReceipt.items.map((i) => ({
        qty: Number(i.qty),
        cost: Number(i.unitCost ?? 0),
      })),
      goodsReceipt.documentNo ?? `GR-${goodsReceiptId}`,
      goodsReceiptId,
      userId
    );

    // ─── 5. Update GR status ─────────────────────────────────────────────
    await tx.goodsReceipt.update({
      where: { id: goodsReceiptId },
      data: { status: "verified" },
    });
  });
}
