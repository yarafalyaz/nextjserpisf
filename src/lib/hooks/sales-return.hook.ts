
import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { createInLayer } from "@/lib/services/inventory-fifo";
import { Status } from "@/lib/constants";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { toBaseFactor } from "@/lib/services/uom.service";

/**
 * Sales Return Hook - Observer pattern replacement.
 * Triggered when a Sales Return is completed.
 * Creates Stock Move IN per item (returned goods back to warehouse).
 * Creates Journal Entry (Dr Inventory, Cr Sales Return)
 */

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number,
  txClient?: TxClient
): Promise<void> {
  const executeInTx = async (tx: TxClient | undefined, callback: (t: TxClient) => Promise<unknown>) => {
    return tx ? callback(tx) : prisma.$transaction(callback);
  };

  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same sales return.
    await tx.$queryRaw`SELECT id FROM sales_returns WHERE id = ${returnId} FOR UPDATE`;
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

    // Enforce period lock — return date must fall in an open period.
    await assertPeriodOpen(salesReturn.date, tx);

    // Guard: must be in a completable state
    if (salesReturn.status === Status.COMPLETED || salesReturn.status === Status.CANCELLED) {
      return; // already completed/cancelled; idempotent no-op
    }

    // Resolve warehouse: item default warehouse → first warehouse fallback
    const fallbackWarehouse = await tx.warehouse.findFirst({
      select: { id: true },
    });
    if (!fallbackWarehouse) throw new Error("Tidak ada warehouse aktif.");

    // Pre-fetch every item's default warehouse in ONE query instead of a
    // findUnique per line (N+1). The lookup is a pure read with no ordering
    // dependency, so hoisting it out of the loop is safe and collapses N
    // round-trips into one.
    const returnItemIds = [...new Set(salesReturn.items.map((it) => it.itemId))];
    const itemDefaults = returnItemIds.length
      ? await tx.item.findMany({
          where: { id: { in: returnItemIds } },
          select: { id: true, defaultWarehouseId: true, trackSerial: true },
        })
      : [];
    const warehouseByItem = new Map(itemDefaults.map((it) => [it.id, it.defaultWarehouseId]));
    const trackSerialByItem = new Map(itemDefaults.map((it) => [it.id, it.trackSerial]));

    const invoiceUnits = salesReturn.salesInvoiceId
      ? await tx.salesInvoiceItem.findMany({
          where: { salesInvoiceId: salesReturn.salesInvoiceId, itemId: { in: returnItemIds } },
          select: { itemId: true, uom: true },
        })
      : [];
    const uomByItem = new Map<number, string | null>();
    for (const line of invoiceUnits) {
      if (line.itemId != null && !uomByItem.has(line.itemId)) uomByItem.set(line.itemId, line.uom);
    }

    // Create Stock Move IN per item (goods returned to warehouse)
    const activeItems = salesReturn.items.filter((it) => Number(it.qty) > 0);
    if (activeItems.length > 0) {
      // 1. Batch-generate one document number per line (was N serial round-trips).
      const smDocNos = await generateDocumentNumberBatch("SM", activeItems.length);
      // 2. Lock all item rows in a single query (was N serial FOR UPDATE).
      const activeItemIds = activeItems.map((it) => it.itemId);
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(activeItemIds)}) FOR UPDATE`;

      let docIdx = 0;
      for (const item of activeItems) {
        const factor = await toBaseFactor(tx, item.itemId, uomByItem.get(item.itemId));
        const baseQty = Number(item.qty) * factor;
        const baseCost = factor > 0 ? Number(item.cost ?? 0) / factor : Number(item.cost ?? 0);
        const smDocNo = smDocNos[docIdx++];

        // Resolve warehouse per item (chain: item default → fallback)
        const resolvedWarehouseId = warehouseByItem.get(item.itemId) ?? fallbackWarehouse.id;

        const sm = await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            itemId: item.itemId,
            warehouseId: resolvedWarehouseId,
            qty: baseQty,
            cost: baseCost,
            impact: "IN",
            status: "posted",
            referenceType: "SalesReturn",
            referenceId: salesReturn.id,
            notes: `Retur Penjualan ${salesReturn.documentNo}`,
            createdBy: userId ?? null,
          },
        });

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${baseQty} WHERE id = ${item.itemId}`;

        // Create FIFO inventory layer (returned stock) in the resolved warehouse
        await createInLayer(tx, {
          itemId: item.itemId,
          warehouseId: resolvedWarehouseId,
          stockMoveId: sm.id,
          qty: baseQty,
          unitCost: baseCost,
        });

        // Serial-tracked items: a return puts the physical units back in stock,
        // so their ItemSerial rows must be revived to "available". Without this
        // they stay "used" forever after the original sale (consumeFifoLayers
        // marks them used), the returned units cannot be sold/issued again, and
        // the serial subledger drifts from the FIFO layer this line just created.
        // We revive the most-recently-used serials for the item up to the
        // returned qty (mirrors the auto-FIFO reviving in inventory-transfer).
        if (trackSerialByItem.get(item.itemId)) {
          const need = Math.round(baseQty);
          if (need > 0) {
            // Prefer serials already recorded in the destination warehouse (those
            // are the units physically coming back), then fall back to any other
            // used serial for the item. Keeping the destination match first avoids
            // relocating a serial that was consumed from a different warehouse and
            // is still represented there by a live FIFO layer.
            const revivableInWarehouse = await tx.itemSerial.findMany({
              where: { itemId: item.itemId, status: "used", warehouseId: resolvedWarehouseId },
              orderBy: { id: "desc" },
              take: need,
              select: { id: true },
            });
            const pickedIds = revivableInWarehouse.map((s) => s.id);
            if (pickedIds.length < need) {
              const remainder = need - pickedIds.length;
              const revivableAny = await tx.itemSerial.findMany({
                where: {
                  itemId: item.itemId,
                  status: "used",
                  ...(pickedIds.length ? { id: { notIn: pickedIds } } : {}),
                },
                orderBy: { id: "desc" },
                take: remainder,
                select: { id: true },
              });
              pickedIds.push(...revivableAny.map((s) => s.id));
            }
            if (pickedIds.length > 0) {
              await tx.itemSerial.updateMany({
                where: { id: { in: pickedIds } },
                data: { status: "available", warehouseId: resolvedWarehouseId },
              });
            }
          }
        }
      }
    }

    // Stock-only hook: GL for a sales return is posted exclusively by
    // accounting.hook.onSalesReturnCompleted (single balanced journal valuing AR at
    // selling price). Posting a journal here too would collide on referenceType
    // "SalesReturn" and suppress the AR journal.

    // Update Sales Return status
    await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        status: Status.COMPLETED,
      },
    });
  });
}
