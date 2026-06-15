import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";

/**
 * Purchase Return Hook - Observer pattern replacement.
 * Triggered when a Purchase Return is returned.
 * Creates Stock Move OUT per item (goods returned to vendor).
 * Creates Journal Entry (Dr Purchase Return, Cr Inventory)
 */

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

    // Pre-fetch every item's default warehouse in ONE query instead of issuing a
    // findUnique per line inside the loop below (N+1 → O(1)). Stock-move creation,
    // the FOR UPDATE row lock, and FIFO consumption still run per item.
    const prItemIds = Array.from(
      new Set(purchaseReturn.items.filter((it) => Number(it.qty) > 0).map((it) => it.itemId))
    );
    const defaultWarehouseRows = prItemIds.length
      ? await tx.item.findMany({
          where: { id: { in: prItemIds } },
          select: { id: true, defaultWarehouseId: true },
        })
      : [];
    const defaultWarehouseByItem = new Map(
      defaultWarehouseRows.map((r) => [r.id, r.defaultWarehouseId])
    );

    // Create Stock Move OUT per item (goods returned to vendor)
    for (const item of purchaseReturn.items) {
      if (Number(item.qty) <= 0) continue;

      const warehouseId = goodsReceipt?.warehouseId
        ?? defaultWarehouseByItem.get(item.itemId)
        ?? activeWarehouse?.id
        ?? anyWarehouse?.id;

      if (!warehouseId) {
        throw new Error("Warehouse retur pembelian tidak ditemukan.");
      }

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;

      // Consume FIFO from the resolved warehouse FIRST and capture the ACTUAL
      // carrying cost that leaves inventory. The StockMove and the GL inventory
      // relief use this real FIFO cost — not the agreed return price (item.cost),
      // which the AP side keeps. Any difference is a purchase-return price
      // variance booked by accounting.hook.onPurchaseReturnProcessed.
      const { consumedCost } = await consumeFifoLayers(tx, {
        itemId: item.itemId,
        warehouseId,
        qty: Number(item.qty),
        allowShortfall: false,
        label: `retur pembelian ${purchaseReturn.documentNo}`,
      });
      const carryingUnitCost = Number(item.qty) > 0
        ? consumedCost / Number(item.qty)
        : Number(item.cost ?? 0);

      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId,
          qty: item.qty,
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
      const updated = await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(item.qty)} WHERE id = ${item.itemId} AND qty_on_hand >= ${Number(item.qty)}`;
      if (updated === 0) {
        throw new Error(`Stok tidak cukup untuk retur item ID ${item.itemId} (qty: ${item.qty})`);
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
