
import { prisma } from "@/lib/db/prisma";
import { PurchaseStatus, Status } from "@/lib/constants";

/**
 * Purchase Order Hook - Observer pattern replacement.
 * Triggered when a Purchase Order is created/approved.
 * Updates related Purchase Request status.
 */

export async function onPurchaseOrderCreated(
  purchaseOrderId: number,
  txClient?: any,
): Promise<void> {
  const run = async (tx: any) => {
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

    const { allOrdered, anyOrdered } = await computePrCoverage(
      tx,
      po.purchaseRequestId,
    );

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
  };

  if (txClient) {
    await run(txClient);
  } else {
    await prisma.$transaction(run);
  }
}

/**
 * Coverage PR dari PO berkomitmen (query bersama dua jalur). Himpunan
 * pengecualian sama dengan COMMITTED_PO_STATUSES laporan outstanding:
 * draft belum dipesan, rejected/cancelled bukan komitmen — PO rejected
 * yang tetap dihitung membuat PR macet ordered selamanya (putaran 51).
 */
async function computePrCoverage(
  tx: any,
  purchaseRequestId: number,
): Promise<{ allOrdered: boolean; anyOrdered: boolean }> {
  const prItems = await tx.purchaseRequestItem.findMany({
    where: { purchaseRequestId },
  });

  const allPOItems = await tx.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: {
        purchaseRequestId,
        status: { notIn: [Status.CANCELLED, Status.DRAFT, Status.REJECTED] },
      },
    },
  });

  const orderedMap = new Map<number, number>();
  for (const poItem of allPOItems) {
    const current = orderedMap.get(poItem.itemId) ?? 0;
    orderedMap.set(poItem.itemId, current + Number(poItem.qty));
  }

  return {
    allOrdered: prItems.every((prItem: any) => {
      const ordered = orderedMap.get(prItem.itemId) ?? 0;
      return ordered >= Number(prItem.qty);
    }),
    anyOrdered: allPOItems.length > 0,
  };
}

const RECALCABLE_PR_STATUSES = new Set([
  Status.APPROVED,
  "partial_ordered",
  PurchaseStatus.ORDERED,
]);

/**
 * Putaran 16: hitung ULANG status PR dari coverage PO yang masih hidup —
 * arah turun yang selama ini hilang. cancelPurchaseOrder membatalkan PO
 * tanpa menyentuh PR (PR macet `ordered`/`partial_ordered` selamanya) dan
 * deletePurchaseOrder menimpa PR ke `approved` secara keras walau PO lain
 * masih mencakup sebagian/seluruhnya. Hanya status turunan-coverage yang
 * dihitung ulang (approved/partial_ordered/ordered); status lain
 * (draft/pending/rejected/completed/...) tidak disentuh. Baris PR dikunci
 * FOR UPDATE — urutan kunci pemanggil (PO -> PR) konsisten di kedua situs.
 */
export async function recalcPurchaseRequestStatus(
  purchaseRequestId: number,
  txClient?: any,
): Promise<void> {
  const run = async (tx: any) => {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${purchaseRequestId} FOR UPDATE`;

    const pr = await tx.purchaseRequest.findUnique({
      where: { id: purchaseRequestId },
    });
    if (!pr || !RECALCABLE_PR_STATUSES.has(pr.status)) return;

    const { allOrdered, anyOrdered } = await computePrCoverage(tx, purchaseRequestId);
    const newStatus = allOrdered
      ? PurchaseStatus.ORDERED
      : anyOrdered
        ? "partial_ordered"
        : Status.APPROVED;
    if (newStatus === pr.status) return;

    await tx.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: { status: newStatus },
    });
  };

  if (txClient) {
    await run(txClient);
  } else {
    await prisma.$transaction(run);
  }
}
