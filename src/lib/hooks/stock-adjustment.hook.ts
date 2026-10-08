
import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { safeMultiply } from "@/lib/utils/math";
import { InventoryStatus, Status } from "@/lib/constants";


const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * Stock Adjustment Hook - Observer pattern replacement.
 * Triggered when a Stock Adjustment is processed.
 * Creates Stock Move IN/OUT per item based on quantity difference.
 * Creates Journal Entry (Dr/Cr Inventory, Cr/Dr Stock Adjustment)
 */

export async function onStockAdjustmentProcessed(
  adjustmentId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same adjustment.
    await tx.$queryRaw`SELECT id FROM stock_adjustments WHERE id = ${adjustmentId} FOR UPDATE`;
    const adjustment = await tx.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      include: { items: true },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "StockAdjustment",
        referenceId: adjustmentId,
      },
    });
    if (existingMoves) return; // Idempotent: silently no-op

    // Guard: must be in a processable state
    if (adjustment.status === InventoryStatus.PROCESSED || adjustment.status === Status.CANCELLED) {
      return; // already processed/cancelled; idempotent no-op
    }

    // Period lock: the GL journal posted below (stockJournalService) bypasses
    // accounting.hook, so enforce the closed-period guard here too — otherwise
    // adjustments can back-date GL into a closed period.
    await assertPeriodOpen(adjustment.date, tx);

    // Create Stock Move per item based on difference
    const journalItems: { qty: number; cost: number; difference: number }[] = [];
    
    if (adjustment.items.length > 0) {
      // 1. Lock the item rows first so the qtyOnHand we read is the authoritative,
      // serialized baseline. The stored systemQty/difference were derived from a
      // client-supplied currentQty at create time and can be stale or forged.
      const itemIds = adjustment.items.map((item) => item.itemId);
      if (new Set(itemIds).size !== itemIds.length) {
        throw new Error("Penyesuaian stok berisi item duplikat.");
      }
      
      // 2. Fetch the LIVE per-warehouse stock for this adjustment's warehouse.
      //    The baseline MUST be the stock in adjustment.warehouseId, not
      //    Item.qtyOnHand: qtyOnHand is the GLOBAL total across all warehouses
      //    (see inventory-fifo.ts), while actualQty is the physical count for
      //    THIS warehouse. Using the global total made a correct count of a
      //    multi-warehouse item look like a huge variance — over-consuming FIFO
      //    layers and corrupting qtyOnHand — or fail the whole process with a
      //    spurious "Stok tidak mencukupi". Per-warehouse availability is the
      //    sum of remaining layer quantities for (item, warehouse), i.e. the
      //    same subledger consumeFifoLayers/createInLayer operate on.
      const layerSums = await tx.inventoryLayer.groupBy({
        by: ["itemId"],
        where: {
          itemId: { in: itemIds },
          warehouseId: adjustment.warehouseId,
          remaining: { gt: 0 },
        },
        _sum: { remaining: true },
      });
      const liveQtyMap = new Map(
        layerSums.map((l) => [l.itemId, Number(l._sum.remaining ?? 0)]),
      );
      
      const trackedItems = await tx.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, trackSerial: true },
      });
      const trackSerialByItemId = new Map(
        trackedItems.map((trackedItem) => [trackedItem.id, trackedItem.trackSerial]),
      );

      // 3. Filter items with actual differences
      const diffItems = adjustment.items.map((item) => {
        const liveQty = liveQtyMap.get(item.itemId) ?? 0;
        const actualQty = Number(item.actualQty);
        return { item, liveQty, actualQty, qtyDiff: actualQty - liveQty };
      }).filter((d) => d.qtyDiff !== 0);

      // 4. Batch document numbers
      const smDocNos = await generateDocumentNumberBatch("SM", diffItems.length);
      
      let docIdx = 0;
      for (const { item, liveQty, actualQty, qtyDiff } of diffItems) {
        const enteredUnitCost = Number(item.unitCost ?? 0);
        const impact = qtyDiff > 0 ? "IN" : "OUT";
        const qty = Math.abs(qtyDiff);

        // Effective unit cost for the StockMove AND the GL journal:
        //   • Positive (IN): the user-entered unit cost establishes the new layer.
        //   • Negative (OUT): the ACTUAL FIFO cost consumed, so the GL Inventory
        //     credit matches the stock subledger reduction instead of an entered
        //     cost that may have drifted from the real layer costs.
        let effectiveUnitCost = enteredUnitCost;
        if (qtyDiff < 0) {
          // Consume oldest layers in this warehouse and capture the real cost.
          const { consumedCost, shortfall } = await consumeFifoLayers(tx, {
            itemId: item.itemId,
            warehouseId: adjustment.warehouseId,
            qty,
            label: `penyesuaian ${adjustment.documentNo}`,
            serialNumbers: Array.isArray(item.serialNumbers)
              ? item.serialNumbers.map(String)
              : undefined,
          });
          const totalCost = consumedCost + shortfall * enteredUnitCost;
          effectiveUnitCost = qty > 0 ? totalCost / qty : enteredUnitCost;
        }

        const smDocNo = smDocNos[docIdx++];
        const sm = await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            itemId: item.itemId,
            warehouseId: adjustment.warehouseId,
            qty,
            cost: effectiveUnitCost,
            impact,
            status: "posted",
            referenceType: "StockAdjustment",
            referenceId: adjustment.id,
            notes: `Penyesuaian Stok ${adjustment.documentNo} (${liveQty} → ${actualQty})`,
            createdBy: userId ?? null,
          },
        });

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qtyDiff} WHERE id = ${item.itemId}`;

        // Persist the ACTUAL effective cost back onto the adjustment line. At
        // create time `unitCost` is only the entered estimate and `totalCost` is
        // `difference × enteredUnitCost`, but for OUT rows the real value is the
        // FIFO cost consumed (`effectiveUnitCost`). Writing it back keeps the
        // stored line value equal to what the stock subledger and GL posted,
        // instead of a draft estimate that drifts from the ledger.
        await tx.stockAdjustmentItem.update({
          where: { id: item.id },
          data: {
            unitCost: effectiveUnitCost,
            totalCost: safeMultiply(qtyDiff, effectiveUnitCost, 2),
          },
        });

        // Positive adjustment — create new FIFO layer at the entered cost.
        // Negative adjustment already consumed FIFO layers above.
        if (qtyDiff > 0) {
          await createInLayer(tx, {
            itemId: item.itemId,
            warehouseId: adjustment.warehouseId,
            stockMoveId: sm.id,
            qty: qtyDiff,
            unitCost: enteredUnitCost,
          });
          if (trackSerialByItemId.get(item.itemId)) {
            const serialNumbers = Array.isArray(item.serialNumbers)
              ? item.serialNumbers.map(String).map((value) => value.trim()).filter(Boolean)
              : [];
            if (!Number.isInteger(qtyDiff) || serialNumbers.length !== qtyDiff) {
              throw new Error(
                `Item berseri #${item.itemId} memerlukan ${qtyDiff} nomor seri untuk penambahan stok.`,
              );
            }
            if (new Set(serialNumbers).size !== serialNumbers.length) {
              throw new Error(`Nomor seri duplikat untuk item #${item.itemId}.`);
            }
            await tx.itemSerial.createMany({
              data: serialNumbers.map((serialNumber) => ({
                itemId: item.itemId,
                serialNumber,
                warehouseId: adjustment.warehouseId,
                status: "available",
              })),
            });
          }
        }

        // `qty` reflects the ADJUSTMENT quantity (qtyDiff), matching the signed
        // `difference`; pushing `actualQty` (the physical count) here was wrong —
        // it made the item's `qty` disagree with `difference × cost` used for the
        // GL value. The journal value itself is computed from `difference`, so
        // this keeps the payload internally consistent.
        journalItems.push({ qty: qtyDiff, cost: effectiveUnitCost, difference: qtyDiff });
      }
    }

    // Create Journal Entry (Dr/Cr Inventory, Cr/Dr Stock Adjustment).
    // OUT lines carry the actual FIFO cost; IN lines the entered cost.
    await stockJournalService.onStockAdjustment(
      tx,
      journalItems,
      adjustment.documentNo ?? `ADJ-${adjustmentId}`,
      adjustmentId,
      userId,
      null,
      adjustment.date
    );

    // Update Stock Adjustment status
    await tx.stockAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: InventoryStatus.PROCESSED,
        approvedBy: userId ?? null,
        approvedAt: new Date(),
      },
    });
  });
}
