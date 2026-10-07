
import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
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

    // Period lock: the GL journal posted below (stockJournalService) bypasses
    // accounting.hook, so enforce the closed-period guard here too — otherwise
    // material issues can back-date GL into a closed period.
    await assertPeriodOpen(issue.date, tx);

    // Create Stock Move OUT per item
    const journalItems: { qty: number; cost: number }[] = [];
    
    // Filter active items
    const activeItems = issue.items.filter((item) => Number(item.qty) > 0);
    if (activeItems.length > 0) {
      // 1. Batch document numbers
      const smDocNos = await generateDocumentNumberBatch("SM", activeItems.length);
      
      // 2. Batch lock item rows to serialize global qtyOnHand updates
      const itemIds = activeItems.map((item) => item.itemId);
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(itemIds)}) FOR UPDATE`;
      
      let docIdx = 0;
      for (const item of activeItems) {
        const qty = Number(item.qty);

        // Optional manual serial selection for serial-tracked materials. When
        // the caller picked serials we pass them through so consumeFifoLayers
        // marks exactly those (and validates count/uniqueness/availability);
        // when absent it falls back to auto-FIFO. Stored as Json on the row.
        const pickedSerials = Array.isArray(item.serialNumbers)
          ? (item.serialNumbers as unknown[])
              .map((s) => String(s).trim())
              .filter((s) => s.length > 0)
          : null;

        // Consume FIFO from the issue's warehouse (guards per-warehouse stock)
        // and capture the ACTUAL consumed cost first, so both the StockMove and
        // the GL journal record the real FIFO cost — not the item.cost master
        // snapshot. Falls back to master cost for any shortfall portion.
        const { consumedCost, shortfall, consumedSerials } = await consumeFifoLayers(tx, {
          itemId: item.itemId,
          warehouseId: issue.warehouseId,
          qty,
          label: `pengeluaran material ${issue.documentNo}`,
          serialNumbers: pickedSerials && pickedSerials.length > 0 ? pickedSerials : null,
        });

        // Persist the serial attribution on the issue line so the document
        // records which units were actually consumed (auto-FIFO or manual).
        if (consumedSerials && consumedSerials.length > 0) {
          await tx.materialIssueItem.update({
            where: { id: item.id },
            data: { serialNumbers: consumedSerials },
          });
        }
        const fallback = Number(item.cost ?? 0);
        const totalCost = consumedCost + shortfall * fallback;
        const unitCost = qty > 0 ? totalCost / qty : fallback;

        const smDocNo = smDocNos[docIdx++];
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
    }

    // Create Journal Entry (Dr Material Expense, Cr Inventory)
    await stockJournalService.onMaterialIssue(
      tx,
      journalItems,
      issue.documentNo ?? `MI-${issueId}`,
      issueId,
      userId,
      issue.costCenterId,
      issue.date
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
