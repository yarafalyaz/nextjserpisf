import { prisma } from "@/lib/db/prisma"

/**
 * Multi-source purchase price analysis (PRD PUR-08 / REP-10).
 *
 * "The same SKU is bought repeatedly at different prices, from the same store
 * and from different stores. A cheap listing price is not necessarily the
 * cheapest acquisition cost after shipping, discount, tax, and platform fees."
 *
 * This report compares, per item (and per vendor), the *effective acquisition
 * cost* actually booked on goods receipts (`GoodsReceiptItem.unitCost`, which a
 * landed-cost allocation has already corrected for shipping/other) against the
 * PO listing price (`PurchaseOrderItem.unitPrice`). It deliberately does not
 * rank vendors by listing price alone (PUR-08) — the landed unit cost is the
 * basis of comparison.
 */

export interface PurchasePriceRow {
  itemId: number
  sku: string
  itemName: string
  uom: string | null
  vendorId: number | null
  vendorName: string
  receipts: number
  totalQty: number
  /** Weighted average effective (landed) unit cost across the receipts. */
  avgLandedUnitCost: number
  minLandedUnitCost: number
  maxLandedUnitCost: number
  /** Weighted average PO listing unit price (pre-landed) for context. */
  avgListingUnitPrice: number
  /** Landed vs listing uplift (absolute, per unit). */
  landedUplift: number
  lastReceiptDate: Date | null
}

export interface PurchasePriceAnalysis {
  rows: PurchasePriceRow[]
  /** Per item, the vendor with the lowest average landed unit cost. */
  bestByItem: {
    itemId: number
    sku: string
    itemName: string
    vendorName: string
    avgLandedUnitCost: number
    avgListingUnitPrice: number
    savingVsWorst: number
  }[]
}

/**
 * Build the multi-source purchase price analysis for a period. Only posted
 * goods receipts are counted. `itemId` optionally narrows to a single item.
 */
export async function buildPurchasePriceAnalysis(opts: {
  startDate: Date
  endDate: Date
  itemId?: number | null
}): Promise<PurchasePriceAnalysis> {
  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      status: "posted",
      date: { gte: opts.startDate, lte: opts.endDate },
      ...(opts.itemId ? { items: { some: { itemId: opts.itemId } } } : {}),
    },
    select: {
      id: true,
      date: true,
      purchaseOrder: { select: { vendorId: true, vendor: { select: { name: true } } } },
      items: {
        select: {
          itemId: true,
          qty: true,
          unitCost: true,
        },
      },
    },
  })

  if (receipts.length === 0) return { rows: [], bestByItem: [] }

  // PO listing prices per (item) for the POs referenced by these receipts, so we
  // can show the listing-vs-landed bridge (PUR-03/PUR-08).
  const poVendorByReceipt = new Map<number, number | null>()
  const vendorNames = new Map<number, string>()
  for (const r of receipts) {
    poVendorByReceipt.set(r.id, r.purchaseOrder.vendorId)
    if (r.purchaseOrder.vendorId && r.purchaseOrder.vendor) {
      vendorNames.set(r.purchaseOrder.vendorId, r.purchaseOrder.vendor.name)
    }
  }

  // Group receipts by (itemId, vendorId).
  interface Acc {
    itemId: number
    vendorId: number | null
    vendorName: string
    qty: number
    cost: number
    receipts: number
    min: number
    max: number
    lastDate: Date | null
  }
  const groups = new Map<string, Acc>()
  for (const r of receipts) {
    const vendorId = r.purchaseOrder.vendorId
    for (const line of r.items) {
      if (opts.itemId && line.itemId !== opts.itemId) continue
      const qty = Number(line.qty)
      const unitCost = Number(line.unitCost)
      if (qty <= 0) continue
      const key = `${line.itemId}::${vendorId ?? "none"}`
      let acc = groups.get(key)
      if (!acc) {
        acc = {
          itemId: line.itemId,
          vendorId,
          vendorName: vendorId ? vendorNames.get(vendorId) ?? `Vendor #${vendorId}` : "Tanpa pemasok",
          qty: 0,
          cost: 0,
          receipts: 0,
          min: Infinity,
          max: 0,
          lastDate: null,
        }
        groups.set(key, acc)
      }
      acc.qty += qty
      acc.cost += qty * unitCost
      acc.receipts += 1
      acc.min = Math.min(acc.min, unitCost)
      acc.max = Math.max(acc.max, unitCost)
      if (!acc.lastDate || r.date > acc.lastDate) acc.lastDate = r.date
    }
  }

  // Resolve listing prices: the PO listing unit price for the same (item, vendor).
  // Since a receipt maps to a PO, gather the PO item unitPrice keyed by item.
  const poListPrices = await prisma.purchaseOrderItem.findMany({
    where: { itemId: { in: [...new Set([...groups.values()].map((g) => g.itemId))] } },
    select: { itemId: true, unitPrice: true, purchaseOrder: { select: { vendorId: true } } },
  })
  const listingByItemVendor = new Map<string, { qty: number; value: number }>()
  for (const p of poListPrices) {
    const key = `${p.itemId}::${p.purchaseOrder.vendorId ?? "none"}`
    const cur = listingByItemVendor.get(key) ?? { qty: 0, value: 0 }
    cur.qty += 1
    cur.value += Number(p.unitPrice)
    listingByItemVendor.set(key, cur)
  }

  const itemInfo = await prisma.item.findMany({
    where: { id: { in: [...new Set([...groups.values()].map((g) => g.itemId))] } },
    select: { id: true, sku: true, name: true, unitOfMeasure: true },
  })
  const itemMap = new Map(itemInfo.map((i) => [i.id, i]))

  const rows: PurchasePriceRow[] = []
  for (const acc of groups.values()) {
    const info = itemMap.get(acc.itemId)
    const avgLanded = acc.qty > 0 ? Math.round((acc.cost / acc.qty) * 100) / 100 : 0
    const listEntry = listingByItemVendor.get(`${acc.itemId}::${acc.vendorId ?? "none"}`)
    const avgListing = listEntry && listEntry.qty > 0 ? Math.round((listEntry.value / listEntry.qty) * 100) / 100 : 0
    rows.push({
      itemId: acc.itemId,
      sku: info?.sku ?? `#${acc.itemId}`,
      itemName: info?.name ?? "",
      uom: info?.unitOfMeasure ?? null,
      vendorId: acc.vendorId,
      vendorName: acc.vendorName,
      receipts: acc.receipts,
      totalQty: Math.round(acc.qty * 100) / 100,
      avgLandedUnitCost: avgLanded,
      minLandedUnitCost: acc.min === Infinity ? 0 : Math.round(acc.min * 100) / 100,
      maxLandedUnitCost: Math.round(acc.max * 100) / 100,
      avgListingUnitPrice: avgListing,
      landedUplift: Math.round((avgLanded - avgListing) * 100) / 100,
      lastReceiptDate: acc.lastDate,
    })
  }
  rows.sort((a, b) => a.sku.localeCompare(b.sku) || a.avgLandedUnitCost - b.avgLandedUnitCost)

  // Best vendor per item by landed cost (not by listing price — PUR-08).
  const byItem = new Map<number, PurchasePriceRow[]>()
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? []
    list.push(r)
    byItem.set(r.itemId, list)
  }
  const bestByItem: PurchasePriceAnalysis["bestByItem"] = []
  for (const [itemId, list] of byItem) {
    if (list.length < 2) continue // no comparison possible with a single source
    const best = [...list].sort((a, b) => a.avgLandedUnitCost - b.avgLandedUnitCost)[0]
    const worst = [...list].sort((a, b) => b.avgLandedUnitCost - a.avgLandedUnitCost)[0]
    bestByItem.push({
      itemId,
      sku: best.sku,
      itemName: best.itemName,
      vendorName: best.vendorName,
      avgLandedUnitCost: best.avgLandedUnitCost,
      avgListingUnitPrice: best.avgListingUnitPrice,
      savingVsWorst: Math.round((worst.avgLandedUnitCost - best.avgLandedUnitCost) * 100) / 100,
    })
  }
  bestByItem.sort((a, b) => a.sku.localeCompare(b.sku))

  return { rows, bestByItem }
}
