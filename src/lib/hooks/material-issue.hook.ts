
import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { Status } from "@/lib/constants";


const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * Material Issue Hook - Observer pattern replacement.
 * Triggered when a Material Issue is completed.
 * Creates Stock Move OUT per item.
 * Creates Journal Entry (Dr Material Expense, Cr Inventory)
 */

export async function onMaterialIssueCompleted(
  issueId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same material issue.
    await tx.$queryRaw`SELECT id FROM material_issues WHERE id = ${issueId} FOR UPDATE`;
    const issue = await tx.materialIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: { items: true },
    });

    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "MaterialIssue",
        referenceId: issueId,
      },
    });

    // Idempotent retry: if the observer already posted stock, do not create duplicates.
    if (existingMoves) return;

    // Guard: observer should only run on transition to completed.
    if (issue.status === Status.COMPLETED) {
      return; // already completed; idempotent no-op
    }

    // Create Stock Move OUT per item
    const journalItems: { qty: number; cost: number }[] = [];
    for (const item of issue.items) {
      const qty = Number(item.qty);
      if (qty <= 0) continue;

      // Lock the item row to serialize global qtyOnHand updates.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.itemId} FOR UPDATE`;

      // Consume FIFO from the issue's warehouse (guards per-warehouse stock)
      // and capture the ACTUAL consumed cost first, so both the StockMove and
      // the GL journal record the real FIFO cost — not the item.cost master
      // snapshot. Falls back to master cost for any shortfall portion.
      const { consumedCost, shortfall } = await consumeFifoLayers(tx, {
        itemId: item.itemId,
        warehouseId: issue.warehouseId,
        qty,
        label: `pengeluaran material ${issue.documentNo}`,
      });
      const fallback = Number(item.cost ?? 0);
      const totalCost = consumedCost + shortfall * fallback;
      const unitCost = qty > 0 ? totalCost / qty : fallback;

      const smDocNo = await generateDocumentNumber("SM");
      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: issue.warehouseId,
          qty: item.qty,
          cost: unitCost,
          impact: "OUT",
          status: "posted",
          referenceType: "MaterialIssue",
          referenceId: issue.id,
          notes: `Pengeluaran Material ${issue.documentNo}`,
          createdBy: userId ?? null,
        },
      });

      // Update item qtyOnHand (global total)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${item.itemId}`;

      // Journal credits Inventory at the same ACTUAL FIFO cost recorded on the move.
      journalItems.push({ qty, cost: unitCost });
    }

    // Create Journal Entry (Dr Material Expense, Cr Inventory)
    await stockJournalService.onMaterialIssue(
      tx,
      journalItems,
      issue.documentNo ?? `MI-${issueId}`,
      issueId,
      userId
    );

    // Update Material Issue status
    await tx.materialIssue.update({
      where: { id: issueId },
      data: {
        status: Status.COMPLETED,
      },
    });
  });
}
