import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { slugify } from "@/lib/utils/slug";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { toBaseFactor } from "@/lib/services/uom.service";

/**
 * Purchase Return Hook - Observer pattern replacement.
 * Triggered when a Purchase Return is returned.
 * Creates Stock Move OUT per item (goods returned to vendor).
 * Creates Journal Entry (Dr Purchase Return, Cr Inventory)
 */

export function resolvePurchaseReturnWarehouse(
  itemId: number,
  receiptByItem: Map<number, { warehouseId: number | null; goodsReceipt?: { warehouseId: number | null } | null }>,
  defaultWarehouseByItem: Map<number, number | null>,
  activeWarehouseId?: number | null,
  anyWarehouseId?: number | null,
): number | null {
  const receipt = receiptByItem.get(itemId);
  return receipt?.warehouseId ?? receipt?.goodsReceipt?.warehouseId
    ?? defaultWarehouseByItem.get(itemId)
    ?? activeWarehouseId
    ?? anyWarehouseId
    ?? null;
}

type WarehouseResolutionClient = Pick<TxClient, "goodsReceiptItem" | "item" | "warehouse">;

export async function loadPurchaseReturnWarehouseContext(
  client: WarehouseResolutionClient,
  purchaseOrderId: number,
  itemIds: number[],
) {
  const uniqueItemIds = Array.from(new Set(itemIds));
  const receiptLines = await client.goodsReceiptItem.findMany({
    where: {
      goodsReceipt: { purchaseOrderId, status: { in: ["verified", "completed"] } },
      ...(uniqueItemIds.length ? { itemId: { in: uniqueItemIds } } : {}),
    },
    select: { itemId: true, uom: true, warehouseId: true, goodsReceipt: { select: { warehouseId: true } } },
    orderBy: { goodsReceipt: { createdAt: "desc" } },
  });
  const receiptByItem = new Map<number, (typeof receiptLines)[number]>();
  for (const line of receiptLines) if (!receiptByItem.has(line.itemId)) receiptByItem.set(line.itemId, line);

  const activeWarehouse = await client.warehouse.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const anyWarehouse = activeWarehouse
    ? null
    : await client.warehouse.findFirst({ select: { id: true }, orderBy: { id: "asc" } });

  const defaultWarehouseRows = uniqueItemIds.length
    ? await client.item.findMany({
        where: { id: { in: uniqueItemIds } },
        select: { id: true, defaultWarehouseId: true },
      })
    : [];
  const defaultWarehouseByItem = new Map<number, number | null>(defaultWarehouseRows.map((r) => [r.id, r.defaultWarehouseId]));

  return { receiptByItem, defaultWarehouseByItem, activeWarehouseId: activeWarehouse?.id ?? null, anyWarehouseId: anyWarehouse?.id ?? null };
}

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number,
  txClient?: TxClient
): Promise<void> {
  const executeInTx = async (tx: TxClient | undefined, callback: (t: TxClient) => Promise<unknown>) => {
    return tx ? callback(tx) : prisma.$transaction(callback);
  };

  await executeInTx(txClient, async (tx) => {
    // Lock the purchase return row to prevent concurrent processing
    await tx.$executeRaw`SELECT id FROM purchase_returns WHERE id = ${returnId} FOR UPDATE`;

    const purchaseReturn = await tx.purchaseReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: true, purchaseOrder: true },
    });

    // Idempotency: skip when stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "PurchaseReturn",
        referenceId: returnId,
      },
    });
    if (existingMoves) {
      console.info(
        `[purchase-return.hook] retur beli #${returnId} sudah diproses — pergerakan stok dilewati`
      );
      return;
    }

    // Enforce period lock — return date must fall in an open period.
    await assertPeriodOpen(purchaseReturn.date, tx);

    // Guard: already returned
    if (purchaseReturn.status === "returned") {
      console.info(
        `[purchase-return.hook] retur beli #${returnId} sudah berstatus returned — pemrosesan dilewati`
      );
      return;
    }

    // Use each item's receipt line: one PO can receive different items into different warehouses.
    const activeItems = purchaseReturn.items.filter((it) => Number(it.qty) > 0);
    const { receiptByItem, defaultWarehouseByItem, activeWarehouseId, anyWarehouseId } =
      await loadPurchaseReturnWarehouseContext(tx, purchaseReturn.purchaseOrderId, activeItems.map((it) => it.itemId));

    // Create Stock Move OUT per item (goods returned to vendor)
    if (activeItems.length > 0) {
      // Batch-generate one document number per line (was N serial round-trips).
      const smDocNos = await generateDocumentNumberBatch("SM", activeItems.length);
      // Lock all item rows in a single query (was N serial FOR UPDATE).
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(activeItems.map((it) => it.itemId))}) FOR UPDATE`;

      let docIdx = 0;
      for (const item of activeItems) {
        const receipt = receiptByItem.get(item.itemId);
        const factor = await toBaseFactor(tx, item.itemId, receipt?.uom);
        const baseQty = Number(item.qty) * factor;
        const warehouseId = resolvePurchaseReturnWarehouse(item.itemId, receiptByItem, defaultWarehouseByItem, activeWarehouseId, anyWarehouseId);

        if (!warehouseId) {
          throw new Error("Warehouse retur pembelian tidak ditemukan.");
        }

        // Consume FIFO from the resolved warehouse FIRST and capture the ACTUAL
        // carrying cost that leaves inventory. The StockMove and the GL inventory
        // relief use this real FIFO cost — not the agreed return price (item.cost),
        // which the AP side keeps. Any difference is a purchase-return price
        // variance booked by accounting.hook.onPurchaseReturnProcessed.
        const { consumedCost, consumedSerials } = await consumeFifoLayers(tx, {
          itemId: item.itemId,
          warehouseId,
          qty: baseQty,
          allowShortfall: false,
          label: `retur pembelian ${purchaseReturn.documentNo}`,
        });
        const carryingUnitCost = baseQty > 0
          ? consumedCost / baseQty
          : Number(item.cost ?? 0) / (factor || 1);

        // Persist the serial attribution so the return document records which
        // serialized units left stock (auto-FIFO picks them for trackSerial items).
        if (consumedSerials && consumedSerials.length > 0) {
          await tx.purchaseReturnItem.update({
            where: { id: item.id },
            data: { serialNumbers: consumedSerials },
          });
        }

        const smDocNo = smDocNos[docIdx++];

        await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            slug: slugify(smDocNo),
            itemId: item.itemId,
            warehouseId,
            qty: baseQty,
            cost: carryingUnitCost,
            impact: "OUT",
            status: "posted",
            referenceType: "PurchaseReturn",
            referenceId: purchaseReturn.id,
            notes: `Retur Pembelian ${purchaseReturn.documentNo}`,
            createdBy: userId ?? null,
          },
        });

        // Update item qtyOnHand — guard against negative stock
        const updated = await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${baseQty} WHERE id = ${item.itemId} AND qty_on_hand >= ${baseQty}`;
        if (updated === 0) {
          throw new Error(`Stok tidak cukup untuk retur item ID ${item.itemId} (qty dasar: ${baseQty})`);
        }
      }
    }

    // Stock-only hook: GL for a purchase return is posted exclusively by
    // accounting.hook.onPurchaseReturnProcessed (Dr Hutang / Cr Persediaan).
    // Posting a journal here too would collide on referenceType "PurchaseReturn"
    // and suppress the payable-reducing journal (AP would stay overstated).

    // Update Purchase Return status
    await tx.purchaseReturn.update({
      where: { id: returnId },
      data: {
        status: "returned",
      },
    });
  });
}
