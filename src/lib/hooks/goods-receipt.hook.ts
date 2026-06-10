
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { createInLayer } from "@/lib/services/inventory-fifo";
import { toBaseFactor } from "@/lib/services/uom.service";
import { PurchaseStatus, Status } from "@/lib/constants";

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
    // Serialize concurrent calls for the same goods receipt.
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${goodsReceiptId} FOR UPDATE`;
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
    if (goodsReceipt.status === PurchaseStatus.VERIFIED) {
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
      // Lock the PO row so two GR verifications on the SAME PO serialize.
      // Each GR locks only its own row above, so without this two concurrent
      // verifies each compute cumulative received excluding the other and both
      // could slip past the over-receipt guard below.
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${goodsReceipt.purchaseOrderId} FOR UPDATE`;

      // Check if all items in PO have been received
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: goodsReceipt.purchaseOrderId },
      });

      // Fix #44: Exclude current GR from the query to prevent double-counting
      const allGRItems = await tx.goodsReceiptItem.findMany({
        where: {
          goodsReceipt: {
            purchaseOrderId: goodsReceipt.purchaseOrderId,
            status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
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

      // Over-receipt guard: cumulative received qty must not exceed the ordered
      // qty on the PO. The PO is the contract; over-delivery is handled by
      // editing the PO, not by silently inflating inventory (which also raises
      // the 3-way-match bill ceiling and lets the vendor over-bill). Hard cap
      // with no tolerance, mirroring findOverReturn's qty guard (the value-based
      // 3-way match keeps its rounding tolerance; a qty count does not).
      // PurchaseOrderItem.receivedQty is a dead column (never written), so
      // cumulative received is summed from verified GR items here. Comparison
      // uses the same raw-qty convention as the allReceived check below (no UoM
      // conversion), staying consistent with the existing PO-status logic.
      for (const poItem of poItems) {
        const received = receivedMap.get(poItem.itemId) ?? 0;
        if (received > Number(poItem.qty)) {
          throw new Error(
            `Penerimaan melebihi pesanan untuk item #${poItem.itemId}: ` +
            `diterima kumulatif ${received} melebihi dipesan ${Number(poItem.qty)}. ` +
            `Sesuaikan qty penerimaan atau ubah PO.`
          );
        }
      }

      // Determine if fully received
      const allReceived = poItems.every((poItem) => {
        const received = receivedMap.get(poItem.itemId) ?? 0;
        return received >= Number(poItem.qty);
      });

      await tx.purchaseOrder.update({
        where: { id: goodsReceipt.purchaseOrderId },
        data: {
          status: allReceived ? PurchaseStatus.RECEIVED : "partial_received",
        },
      });
    }

    // ─── 3. Create Stock Move IN per item ────────────────────────────────
    for (const item of goodsReceipt.items) {
      const smDocNo = await generateDocumentNumber("SM");

      // Multi-UoM: convert entered qty/cost to the item's BASE unit for stock.
      const itemMeta = await tx.item.findUnique({
        where: { id: item.itemId },
        select: { unitOfMeasure: true, trackBatch: true, trackSerial: true },
      });
      const factor = await toBaseFactor(tx, item.itemId, item.uom);
      const baseQty = Number(item.qty) * factor;
      const enteredUnitCost = Number(item.unitCost ?? 0);
      const baseUnitCost = factor > 0 ? enteredUnitCost / factor : enteredUnitCost;
      const batchNumber = itemMeta?.trackBatch ? (item.batchNumber ?? null) : null;

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: goodsReceipt.warehouseId,
          qty: baseQty,
          cost: baseUnitCost,
          impact: "IN",
          status: "posted",
          referenceType: "GoodsReceipt",
          referenceId: goodsReceipt.id,
          notes: `Penerimaan dari GR ${goodsReceipt.documentNo ?? ""}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand (global total, in base units)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${baseQty} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer scoped to the receiving warehouse (+ batch)
      await createInLayer(tx, {
        itemId: item.itemId,
        warehouseId: goodsReceipt.warehouseId,
        batchNumber,
        stockMoveId: sm.id,
        qty: baseQty,
        unitCost: baseUnitCost,
      });

      // Batch tracking: register/accumulate the batch lot
      if (itemMeta?.trackBatch && batchNumber) {
        const existingBatch = await tx.itemBatch.findFirst({
          where: { itemId: item.itemId, batchNumber, warehouseId: goodsReceipt.warehouseId },
        });
        if (existingBatch) {
          await tx.itemBatch.update({
            where: { id: existingBatch.id },
            data: { qty: { increment: baseQty }, ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}) },
          });
        } else {
          await tx.itemBatch.create({
            data: {
              itemId: item.itemId,
              batchNumber,
              warehouseId: goodsReceipt.warehouseId,
              qty: baseQty,
              expiryDate: item.expiryDate ?? null,
            },
          });
        }
      }

      // Serial tracking: register each received unit's serial number
      if (itemMeta?.trackSerial && Array.isArray(item.serialNumbers)) {
        const serials = (item.serialNumbers as unknown[])
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0);
        if (serials.length > 0 && serials.length !== Math.round(baseQty)) {
          throw new Error(
            `Jumlah nomor seri (${serials.length}) tidak sama dengan qty diterima (${Math.round(baseQty)}) untuk item #${item.itemId}.`
          );
        }
        for (const serialNumber of serials) {
          await tx.itemSerial.create({
            data: {
              itemId: item.itemId,
              serialNumber,
              warehouseId: goodsReceipt.warehouseId,
              status: "available",
            },
          });
        }
      }
    }

    // ─── 4. Create Journal Entry ──────────────────────────────────────
    await stockJournalService.onGoodsReceipt(
      tx,
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
      data: { status: PurchaseStatus.VERIFIED },
    });
  });
}
