/**
 * Loader read-only laporan dampak revisi BOM (F-2026-10-20-41(a)).
 *
 * Query massal tanpa N+1: WO pin revisi + barisnya, baris issue completed
 * untuk WO-WO itu, hitungan ProductionOrder pin revisi, dan PO tertaut WO
 * pin revisi. Logika agregat di builder murni `bom-revision-impact.ts`.
 * Tanpa mutasi/jurnal/migrasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildBomRevisionImpact,
  type BomRevisionImpact,
} from "@/lib/reports/bom-revision-impact"

export async function loadBomRevisionImpact(
  bomRevisionId: number,
): Promise<BomRevisionImpact> {
  const workOrders = await prisma.workOrder.findMany({
    where: { bomRevisionId },
    select: {
      id: true,
      documentNo: true,
      status: true,
      items: { select: { id: true, itemId: true, qty: true, status: true } },
    },
    orderBy: { documentNo: "asc" },
  })
  const woIds = workOrders.map((w) => w.id)

  const [issuedItems, productionOrderCount, purchaseOrders] = await Promise.all([
    woIds.length
      ? prisma.materialIssueItem.findMany({
          where: {
            materialIssue: { workOrderId: { in: woIds }, status: "completed" },
          },
          select: {
            workOrderItemId: true,
            itemId: true,
            qty: true,
            materialIssue: { select: { workOrderId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.productionOrder.count({ where: { bomRevisionId } }),
    woIds.length
      ? prisma.purchaseOrder.findMany({
          where: { workOrderId: { in: woIds } },
          select: {
            id: true,
            documentNo: true,
            status: true,
            workOrderId: true,
            items: { select: { qty: true, receivedQty: true } },
          },
          orderBy: { documentNo: "asc" },
        })
      : Promise.resolve([]),
  ])

  const issuedByWo = new Map<number, { workOrderItemId: number | null; itemId: number; qty: number }[]>()
  for (const row of issuedItems) {
    const woId = row.materialIssue.workOrderId
    if (woId == null) continue
    const list = issuedByWo.get(woId) ?? []
    list.push({
      workOrderItemId: row.workOrderItemId,
      itemId: row.itemId,
      qty: Number(row.qty),
    })
    issuedByWo.set(woId, list)
  }

  return buildBomRevisionImpact({
    workOrders: workOrders.map((wo) => ({
      id: wo.id,
      documentNo: wo.documentNo,
      status: wo.status,
      items: wo.items.map((i) => ({
        id: i.id,
        itemId: i.itemId,
        qty: Number(i.qty),
        status: i.status,
      })),
      issuedItems: issuedByWo.get(wo.id) ?? [],
    })),
    productionOrderCount,
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      documentNo: po.documentNo,
      status: po.status,
      workOrderId: po.workOrderId,
      items: po.items.map((i) => ({
        qty: Number(i.qty),
        receivedQty: Number(i.receivedQty),
      })),
    })),
  })
}
