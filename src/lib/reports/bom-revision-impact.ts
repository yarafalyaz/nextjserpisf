/**
 * Builder murni laporan dampak revisi BOM (F-2026-10-20-41(a)).
 *
 * Read-only: menjawab "ganti BomRevision ini berdampak ke dokumen apa?"
 * dari pin existing — WorkOrder.bomRevisionId, ProductionOrder.bomRevisionId,
 * PurchaseOrder lewat workOrderId WO yang mem-pin revisi ini. Tidak ada
 * mutasi, tidak ada unpick/re-pick (inti F-41(b) ditunda-teknis; default
 * revisi BOM existing tanpa mengubah WO berjalan tetap aktif).
 *
 * Kebutuhan belum keluar per baris WO = max(qty WO - issued completed, 0);
 * issued hanya dari MaterialIssue completed tertaut WO itu (pola
 * work-order-material-needs). PO terbuka = status ordered/partial_received
 * dengan sisa qty per baris (ordered - received, clamp >= 0).
 */

export const OPEN_PURCHASE_ORDER_STATUSES = ["ordered", "partial_received"] as const

export interface BomRevisionImpactWorkOrderInput {
  id: number
  documentNo: string
  status: string
  items: { id: number; itemId: number; qty: number; status: string }[]
  /** Baris issue completed tertaut WO ini (workOrderItemId per baris bila ada). */
  issuedItems: { workOrderItemId: number | null; itemId: number; qty: number }[]
}

export interface BomRevisionImpactPurchaseOrderInput {
  id: number
  documentNo: string
  status: string
  workOrderId: number | null
  items: { qty: number; receivedQty: number }[]
}

export interface BomRevisionImpactWorkOrderRow {
  id: number
  documentNo: string
  status: string
  /** Qty sudah keluar lewat MI completed (semua baris WO ini). */
  issuedQty: number
  /** Kebutuhan belum keluar: sum(max(qty baris - issued baris, 0)). */
  outstandingQty: number
  /** Baris WO yang sebagian/seluruhnya sudah ter-issue. */
  issuedLineCount: number
}

export interface BomRevisionImpact {
  workOrders: BomRevisionImpactWorkOrderRow[]
  productionOrderCount: number
  openPurchaseOrderCount: number
  /** Sisa qty PO terbuka (ordered - received) pada PO tertaut WO pin revisi. */
  openPurchaseQty: number
  /** WO aktif (bukan completed/cancelled) yang mem-pin revisi ini. */
  activeWorkOrderCount: number
  /** WO pin revisi yang sudah punya material keluar. */
  issuedWorkOrderCount: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function buildBomRevisionImpact(input: {
  workOrders: BomRevisionImpactWorkOrderInput[]
  productionOrderCount: number
  purchaseOrders: BomRevisionImpactPurchaseOrderInput[]
}): BomRevisionImpact {
  const workOrders = input.workOrders.map((wo) => {
    const issuedByLine = new Map<number, number>()
    let issuedQty = 0
    for (const issued of wo.issuedItems) {
      issuedQty = round2(issuedQty + issued.qty)
      if (issued.workOrderItemId != null) {
        issuedByLine.set(
          issued.workOrderItemId,
          round2((issuedByLine.get(issued.workOrderItemId) ?? 0) + issued.qty),
        )
      }
    }
    // Baris tanpa tautan baris (legacy) diatribusikan per itemId ke baris
    // pertama yang cocok supaya kebutuhan belum keluar tidak overstated.
    const legacyByItem = new Map<number, number>()
    for (const issued of wo.issuedItems) {
      if (issued.workOrderItemId == null) {
        legacyByItem.set(issued.itemId, round2((legacyByItem.get(issued.itemId) ?? 0) + issued.qty))
      }
    }
    let outstandingQty = 0
    let issuedLineCount = 0
    for (const line of wo.items) {
      let issuedForLine = issuedByLine.get(line.id) ?? 0
      const legacy = legacyByItem.get(line.itemId) ?? 0
      if (legacy > 0) {
        const take = Math.min(legacy, Math.max(line.qty - issuedForLine, 0))
        issuedForLine = round2(issuedForLine + take)
        legacyByItem.set(line.itemId, round2(legacy - take))
      }
      if (issuedForLine > 0) issuedLineCount += 1
      outstandingQty = round2(outstandingQty + Math.max(line.qty - issuedForLine, 0))
    }
    return {
      id: wo.id,
      documentNo: wo.documentNo,
      status: wo.status,
      issuedQty,
      outstandingQty,
      issuedLineCount,
    }
  })

  const openPos = input.purchaseOrders.filter((po) =>
    (OPEN_PURCHASE_ORDER_STATUSES as readonly string[]).includes(po.status),
  )
  const openPurchaseQty = round2(
    openPos.reduce(
      (sum, po) =>
        sum + po.items.reduce((s, i) => s + Math.max(i.qty - i.receivedQty, 0), 0),
      0,
    ),
  )

  return {
    workOrders,
    productionOrderCount: input.productionOrderCount,
    openPurchaseOrderCount: openPos.length,
    openPurchaseQty,
    activeWorkOrderCount: workOrders.filter(
      (w) => w.status !== "completed" && w.status !== "cancelled",
    ).length,
    issuedWorkOrderCount: workOrders.filter((w) => w.issuedQty > 0).length,
  }
}
