/**
 * Loader delta dampak ganti revisi BOM untuk satu dokumen pemilik
 * (F-2026-10-22-068-S, BR-BOM68-08/10). Read-only.
 *
 * Menggabungkan: material revisi pin saat ini vs revisi tujuan, material
 * sudah keluar untuk dokumen ini saja (WO: MaterialIssueItem completed;
 * PO: ProductionOrderMaterial.issuedQty), dan stok tersedia global
 * Item.qtyOnHand untuk status cakupan tampil. Logika di builder murni
 * `buildBomRevisionDelta` (bom-revision-impact.ts) — file ini hanya IO.
 * Tanpa mutasi, tanpa StockReservation, tanpa jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildBomRevisionDelta,
  type BomRevisionDeltaLine,
} from "@/lib/reports/bom-revision-impact"

export interface BomRevisionChangeDelta {
  documentNo: string
  fromRevisionId: number
  toRevisionId: number
  lines: BomRevisionDeltaLine[]
  hasGenuinelyNew: boolean
}

export async function loadBomRevisionChangeDelta(input: {
  workOrderId?: number
  productionOrderId?: number
  toRevisionId: number
}): Promise<BomRevisionChangeDelta | null> {
  const isWo = input.workOrderId != null
  const ownerId = (isWo ? input.workOrderId : input.productionOrderId)!
  const doc = isWo
    ? await prisma.workOrder.findFirst({
        where: { id: ownerId },
        select: {
          documentNo: true,
          bomRevisionId: true,
          items: { select: { itemId: true, qty: true } },
        },
      })
    : await prisma.productionOrder.findFirst({
        where: { id: ownerId },
        select: {
          documentNo: true,
          bomRevisionId: true,
          qty: true,
          materials: { select: { itemId: true, issuedQty: true } },
        },
      })
  if (!doc || doc.bomRevisionId == null) return null
  const fromRevisionId = doc.bomRevisionId

  const [fromRevision, toRevision, issuedRows] = await Promise.all([
    prisma.bomRevision.findFirst({
      where: { id: fromRevisionId },
      select: { materials: { select: { itemId: true, qty: true } } },
    }),
    prisma.bomRevision.findFirst({
      where: { id: input.toRevisionId },
      select: { materials: { select: { itemId: true, qty: true } } },
    }),
    isWo
      ? prisma.materialIssueItem.findMany({
          where: {
            materialIssue: { workOrderId: ownerId, status: "completed" },
          },
          select: { itemId: true, qty: true },
        })
      : Promise.resolve(
          (doc as { materials: { itemId: number; issuedQty: unknown }[] }).materials.map(
            (m) => ({ itemId: m.itemId, qty: m.issuedQty }),
          ),
        ),
  ])
  if (!fromRevision || !toRevision) return null

  const oldMaterials = fromRevision.materials.map((m) => ({
    itemId: m.itemId,
    qty: Number(m.qty),
  }))
  const newMaterials = toRevision.materials.map((m) => ({
    itemId: m.itemId,
    qty: Number(m.qty),
  }))

  // plannedQty: PO = qty order. WO tak punya kolom qty — turunkan dari
  // rasio total WorkOrderItem terhadap kebutuhan revisi lama (item yang
  // sama); fallback 1 bila tak ada jangkar (ponytail: lihat builder).
  let plannedQty = 1
  if (!isWo) {
    plannedQty = Number((doc as { qty: unknown }).qty)
  } else {
    const woItems = (doc as { items: { itemId: number; qty: unknown }[] }).items
    const oldByItem = new Map(oldMaterials.map((m) => [m.itemId, m.qty]))
    for (const item of woItems) {
      const perUnit = oldByItem.get(item.itemId)
      if (perUnit && perUnit > 0) {
        plannedQty = Number(item.qty) / perUnit
        break
      }
    }
  }

  const newItemIds = [...new Set(newMaterials.map((m) => m.itemId))]
  const available = newItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: newItemIds } },
        select: { id: true, qtyOnHand: true },
      })
    : []

  const { lines, hasGenuinelyNew } = buildBomRevisionDelta({
    oldMaterials,
    newMaterials,
    plannedQty,
    issuedByItem: issuedRows.map((r) => ({ itemId: r.itemId, qty: Number(r.qty) })),
    availableByItem: available.map((i) => ({ itemId: i.id, qty: Number(i.qtyOnHand) })),
  })
  return {
    documentNo: doc.documentNo,
    fromRevisionId,
    toRevisionId: input.toRevisionId,
    lines,
    hasGenuinelyNew,
  }
}
