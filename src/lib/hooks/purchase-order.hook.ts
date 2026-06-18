
import { prisma } from "@/lib/db/prisma";
import { PurchaseStatus, Status } from "@/lib/constants";

/**
 * Purchase Order Hook - Observer pattern replacement.
 * Triggered when a Purchase Order is created/approved.
 * Updates related Purchase Request status.
 */

export async function onPurchaseOrderCreated(
  purchaseOrderId: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      include: { items: true },
    });

    // Guard: must have a linked Purchase Request
    if (!po.purchaseRequestId) return;

    // Lock the PR row so two concurrent PO creations for the SAME PR serialize.
    // Without this, both transactions read PR status (PENDING), each compute
    // cumulative coverage from a query that excludes the other (different PO
    // ids), and both race to write the PR status — last write wins and the
    // intermediate value is lost. e.g. PO-A covers item 1 fully, PO-B covers
    // item 2 fully; concurrent verifies → both see "partial" → final PR
    // status is "partial_ordered" instead of "ordered". Locking the PR row
    // makes the read-compute-write atomic per PR. Mirrors the row-lock
    // pattern used in goods-receipt.hook.ts for the PO row.
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${po.purchaseRequestId} FOR UPDATE`;

    // Idempotency: check if PR is already updated
    const pr = await tx.purchaseRequest.findUnique({
      where: { id: po.purchaseRequestId },
    });
    if (!pr) return;
    if (pr.status === PurchaseStatus.ORDERED || pr.status === Status.COMPLETED) return;

    // Check if all PR items are covered by POs
    const prItems = await tx.purchaseRequestItem.findMany({
      where: { purchaseRequestId: po.purchaseRequestId },
    });

    const allPOItems = await tx.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          purchaseRequestId: po.purchaseRequestId,
          status: { notIn: [Status.CANCELLED, Status.DRAFT] },
        },
      },
    });

    // Sum ordered quantities per item
    const orderedMap = new Map<number, number>();
    for (const poItem of allPOItems) {
      const current = orderedMap.get(poItem.itemId) ?? 0;
      orderedMap.set(poItem.itemId, current + Number(poItem.qty));
    }

    // Determine if fully ordered
    const allOrdered = prItems.every((prItem) => {
      const ordered = orderedMap.get(prItem.itemId) ?? 0;
      return ordered >= Number(prItem.qty);
    });

    const anyOrdered = allPOItems.length > 0;

    // Update PR status
    let newStatus: string;
    if (allOrdered) {
      newStatus = PurchaseStatus.ORDERED;
    } else if (anyOrdered) {
      newStatus = "partial_ordered";
    } else {
      return; // No change needed
    }

    await tx.purchaseRequest.update({
      where: { id: po.purchaseRequestId },
      data: { status: newStatus },
    });
  });
}
