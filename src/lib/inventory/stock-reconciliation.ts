/**
 * Inventory integrity: reconcile the denormalized master on-hand quantity
 * (`Item.qtyOnHand`, the GLOBAL total across warehouses) against the FIFO layer
 * ledger (`Σ InventoryLayer.remaining`).
 *
 * Why this matters: stock is written in two places — the master counter and the
 * per-warehouse FIFO layers — by many hooks (receipt, sale, transfer, issue,
 * adjustment, production, return). Any caller that updates one but not the other
 * (or does so non-atomically) silently desyncs them. A drifted counter makes
 * `qtyOnHand` lie: availability checks (`availableQty` reads LAYERS) and low-stock
 * alerts (`qtyOnHand`) then disagree, and the balance sheet inventory value (read
 * from layers) can diverge from what the app reports as physical stock.
 *
 * This helper is pure so the arithmetic is unit-testable without a DB.
 */

/** Minimal per-item layer roll-up (already summed by item). */
export interface ItemLayerTotals {
  /** Σ InventoryLayer.remaining for the item (all warehouses). */
  layerQty: number
  /** Σ InventoryLayer.remaining × unitCost for the item. */
  layerValue: number
}

export interface ReconciliationInput {
  itemId: number
  sku: string
  name: string
  /** Master `Item.qtyOnHand` (global on-hand). */
  masterQty: number
  /** Per-item FIFO layer roll-up (defaults to zero when the item has no layers). */
  layers: ItemLayerTotals
}

export interface ReconciliationRow {
  itemId: number
  sku: string
  name: string
  masterQty: number
  layerQty: number
  /** masterQty − layerQty. Positive = master over-reports; negative = under-reports. */
  variance: number
  layerValue: number
}

/** Quantities are Decimal(15,2); compare at that scale to avoid FP noise. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Coerce any non-finite / missing input to 0 before rounding. */
const num = (n: number) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * Compute the reconciliation row for a single item. A row is "balanced" when the
 * variance rounds to zero at the storage scale.
 */
export function reconcileItem(input: ReconciliationInput): ReconciliationRow {
  const masterQty = round2(num(input.masterQty))
  const layerQty = round2(num(input.layers.layerQty))
  return {
    itemId: input.itemId,
    sku: input.sku,
    name: input.name,
    masterQty,
    layerQty,
    variance: round2(masterQty - layerQty),
    layerValue: round2(num(input.layers.layerValue)),
  }
}

/** True when master qty and layer qty agree at the storage scale. */
export function isBalanced(row: ReconciliationRow): boolean {
  return row.variance === 0
}

export interface ReconciliationSummary {
  rows: ReconciliationRow[]
  /** Only the items whose master counter disagrees with the FIFO layers. */
  mismatches: ReconciliationRow[]
  totalItems: number
  mismatchCount: number
  /** Σ masterQty over ALL items (not just mismatches). */
  totalMasterQty: number
  /** Σ layerQty over ALL items. */
  totalLayerQty: number
  /** Σ layerValue over ALL items. */
  totalLayerValue: number
}

/**
 * Reconcile every item and split balanced vs mismatched. Items absent from
 * `layerTotals` (no layers at all) are treated as zero layer qty, so an item
 * with a positive master counter and no layers is correctly flagged.
 */
export function reconcileInventory(
  items: { itemId: number; sku: string; name: string; masterQty: number }[],
  layerTotals: Map<number, ItemLayerTotals>,
): ReconciliationSummary {
  const rows = items.map((it) =>
    reconcileItem({
      itemId: it.itemId,
      sku: it.sku,
      name: it.name,
      masterQty: it.masterQty,
      layers: layerTotals.get(it.itemId) ?? { layerQty: 0, layerValue: 0 },
    }),
  )

  const mismatches = rows.filter((r) => !isBalanced(r))
  return {
    rows,
    mismatches,
    totalItems: rows.length,
    mismatchCount: mismatches.length,
    totalMasterQty: round2(rows.reduce((s, r) => s + r.masterQty, 0)),
    totalLayerQty: round2(rows.reduce((s, r) => s + r.layerQty, 0)),
    totalLayerValue: round2(rows.reduce((s, r) => s + r.layerValue, 0)),
  }
}
