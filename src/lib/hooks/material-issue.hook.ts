
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

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "MaterialIssue",
        referenceId: issueId,
      },
    });
    if (existingMoves) {
      throw new Error("Stock Move sudah dibuat untuk Material Issue ini.");
    }

    // Guard: must not be already completed
    if (issue.status === "completed") {
      throw new Error("Material Issue sudah selesai sebelumnya.");
    }

    // Create Stock Move OUT per item
    for (const item of issue.items) {
      const smDocNo = await generateDocumentNumber("SM");

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: issue.warehouseId,
          qty: item.qty,
          cost: item.cost,
          impact: "OUT",
          status: "draft",
          referenceType: "MaterialIssue",
          referenceId: issue.id,
          notes: `Pengeluaran Material ${issue.documentNo}`,
          createdBy: userId ?? null,
        },
      });
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
