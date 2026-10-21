/**
 * Loader read-only status turunan part per baris WO (F-2026-10-20-105).
 *
 * Tiga query massal: baris WorkOrderItem WO ini, MaterialIssue completed
 * tertaut WO ini (satu-satunya transisi yang mengeluarkan stok — pola
 * work-order-material-needs), dan PurchaseOrder non-cancelled tertaut WO
 * ini. Agregasi + precedence di builder murni work-order-part-status.ts.
 * Tanpa mutasi, tanpa menulis WorkOrderItem.status.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWorkOrderPartStatus,
  type WorkOrderPartStatusReport,
} from "@/lib/reports/work-order-part-status"

export async function getWorkOrderPartStatus(
  workOrderId: number,
): Promise<WorkOrderPartStatusReport | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      items: {
        select: { id: true, itemId: true, description: true, qty: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!wo) return null

  const [issues, orders] = await Promise.all([
    prisma.materialIssue.findMany({
      where: { workOrderId, status: "completed" },
      select: {
        items: { select: { workOrderItemId: true, itemId: true, qty: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { workOrderId, deletedAt: null, status: { notIn: ["cancelled"] } },
      select: { items: { select: { itemId: true, qty: true, receivedQty: true } } },
    }),
  ])

  return buildWorkOrderPartStatus({
    lines: wo.items.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      description: line.description,
      qty: Number(line.qty),
      storedStatus: line.status,
    })),
    issues: issues.flatMap((issue) =>
      issue.items.map((item) => ({
        workOrderItemId: item.workOrderItemId,
        itemId: item.itemId,
        qty: Number(item.qty),
      })),
    ),
    orders: orders.flatMap((order) =>
      order.items.map((item) => ({
        itemId: item.itemId,
        orderedQty: Number(item.qty),
        receivedQty: Number(item.receivedQty),
      })),
    ),
  })
}
