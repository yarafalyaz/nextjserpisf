
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";

/**
 * Material Issue Hook - Observer pattern replacement.
 * Triggered when a Material Issue is completed.
 * Creates Stock Move OUT per item.
 * Creates Journal Entry (Dr Material Expense, Cr Inventory)
 */

export async function onMaterialIssueCompleted(
  issueId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
    if (issue.status === "completed") {
      return; // already completed; idempotent no-op
    }

    // Create Stock Move OUT per item
    for (const item of issue.items) {
      if (Number(item.qty) <= 0) continue;

      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: issue.warehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "OUT",
          status: "posted",
          referenceType: "MaterialIssue",
          referenceId: issue.id,
          notes: `Pengeluaran Material ${issue.documentNo}`,
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

    // Create Journal Entry (Dr Material Expense, Cr Inventory)
    await stockJournalService.onMaterialIssue(
      tx as any,
      issue.items.map((i) => ({
        qty: Number(i.qty),
        cost: Number(i.cost),
      })),
      issue.documentNo ?? `MI-${issueId}`,
      issueId,
      userId
    );

    // Update Material Issue status
    await tx.materialIssue.update({
      where: { id: issueId },
      data: {
        status: "completed",
      },
    });
  });
}
