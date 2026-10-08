/**
 * Landed-cost allocation for goods receipts.
 *
 * The PO carries `shippingCost` + `serviceFee` (an estimate of the freight and
 * platform/handling fees for the whole order) plus `discount` (the rollup of
 * the order's line discounts). Those costs must end up in the HPP (inventory
 * value) of the goods they carried — not as a separate expense — otherwise
 * per-product margin looks better than it really is.
 *
 * A single GR absorbs only the share of the pool that matches the value it
 * receives:
 *
 *   thisValue = Σ (baseQty × poNetUnitPrice)
 *   share     = pool × (thisValue / poNetValue)
 *
 * Because Σ(thisValue) over every receipt of a fully-received PO equals
 * `poNetValue`, the shares sum to exactly `pool` — no freight is stranded on a
 * partial receipt and none is double-booked when the balance arrives later.
 *
 * The pool is split in two so the UI can show the composition per line:
 *
 *   chargePool   = actual freight/handling (GR override) OR the GR's share of
 *                  the PO estimate (shippingCost + serviceFee)
 *   discountPool = the GR's share of the PO discount
 *   netPool      = chargePool − discountPool  → what actually lands in HPP
 *
 * When the caller passes explicit `shippingCost` / `otherCost` (> 0) the PO
 * estimate is ignored for this receipt and the entered amounts are used as-is
 * (the user knows the real freight better than the order did). The discount is
 * NOT an estimate of freight, so it keeps applying proportionally regardless.
 *
 * NOTE on double-counting: the allocation weight is the PO's NET unit price
 * (`poItem.total / poItem.qty`, i.e. already net of that line's discount), but
 * the caller is expected to enter the GR unit cost GROSS (the PO unit price).
 * The discount is then applied exactly once, through `discountPool`. If a GR
 * unit cost were entered already net of the discount, the discount would be
 * subtracted twice.
 *
 * Pure function: no DB, no clock — trivially unit-testable.
 */

/** A single received line, already converted to the item's BASE unit. */
export type LandedCostLine = {
  /** Received qty in the item's BASE unit of measure. */
  baseQty: number
  /** PO net unit price (poItem.total / poItem.qty); used as the allocation weight. */
  poNetUnitPrice: number
}

export type AllocateLandedCostInput = {
  lines: LandedCostLine[]
  /** PO-level `shippingCost` + `serviceFee` estimate for the whole order. */
  poCostPool: number
  /** Full PO goods value (Σ poItem.total). Denominator of the value share. */
  poNetValue: number
  /** PO-level discount for the whole order (a positive number). */
  poDiscount?: number
  /** GR-level actual shipping cost. > 0 overrides the PO estimate. */
  shippingCost?: number
  /** GR-level other costs (packing, admin, …). > 0 overrides the PO estimate. */
  otherCost?: number
  /**
   * GR-level bank / payment admin fee (e.g. "Admin BCA"). Capitalised into HPP
   * like the other charges, but kept as its OWN pool so the journal can post it
   * to a dedicated admin-fee account. There is no PO-level estimate for it.
   */
  adminFee?: number
}

export type AllocateLandedCostResult = {
  /** Per-line NET landed-cost amount (charge + admin − discount) to add to that line. */
  lineAdditions: number[]
  /** Per-unit net landed-cost addition for each line (lineAdditions / baseQty). */
  perUnitAdditions: number[]
  /** Per-line share of the freight/handling charge, before discount. */
  chargeAdditions: number[]
  /** Per-line share of the bank/admin fee (before discount). */
  adminAdditions: number[]
  /** Per-unit bank/admin-fee share for each line (adminAdditions / baseQty). */
  adminPerUnitAdditions: number[]
  /** Per-line share of the discount (a positive number that is subtracted). */
  discountAdditions: number[]
  /** Effective freight/handling for this GR (explicit value, or the derived share). */
  shippingCost: number
  /** Effective other cost for this GR. */
  otherCost: number
  /** Effective bank/admin fee for this GR (explicit value). */
  adminFee: number
  /** Effective discount for this GR (a positive number). */
  discount: number
  /** Net total absorbed by this GR (== Σ lineAdditions == charge + admin − discount). */
  absorbed: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Allocate `pool` across `weights`, rounding each share to 2dp and pushing the
 * rounding drift onto the largest-weight line so Σ(result) == pool to the cent.
 */
function allocateByWeights(pool: number, weights: number[], totalWeight: number): number[] {
  const out = weights.map(() => 0)
  if (pool <= 0 || totalWeight <= 0) return out
  let allocated = 0
  let largestIdx = 0
  let largestWeight = -1
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > largestWeight) {
      largestWeight = weights[i]
      largestIdx = i
    }
    const share = round2((pool * weights[i]) / totalWeight)
    out[i] = share
    allocated += share
  }
  out[largestIdx] = round2(out[largestIdx] + (pool - allocated))
  return out
}

export function allocateLandedCost(input: AllocateLandedCostInput): AllocateLandedCostResult {
  const { lines, poCostPool, poNetValue } = input
  const explicitShipping = Number(input.shippingCost ?? 0)
  const explicitOther = Number(input.otherCost ?? 0)
  const explicitTotal = explicitShipping + explicitOther
  const poDiscount = Number(input.poDiscount ?? 0)
  // The bank/admin fee is its own pool — no PO estimate — so the journal can
  // split it out to a dedicated account while still capitalising it into HPP.
  const adminPool = Math.max(0, Number(input.adminFee ?? 0))

  const empty: AllocateLandedCostResult = {
    lineAdditions: lines.map(() => 0),
    perUnitAdditions: lines.map(() => 0),
    chargeAdditions: lines.map(() => 0),
    adminAdditions: lines.map(() => 0),
    adminPerUnitAdditions: lines.map(() => 0),
    discountAdditions: lines.map(() => 0),
    shippingCost: explicitShipping,
    otherCost: explicitOther,
    adminFee: adminPool,
    discount: 0,
    absorbed: 0,
  }
  if (lines.length === 0) return empty

  const thisValue = lines.reduce((s, l) => s + l.baseQty * l.poNetUnitPrice, 0)

  // The share of a whole-PO pool that this receipt must absorb. When the PO has
  // no goods value (pathological), fall back to absorbing the whole pool.
  const shareOf = (wholePool: number): number => {
    if (wholePool <= 0) return 0
    if (poNetValue > 0 && thisValue > 0) return (wholePool * thisValue) / poNetValue
    return wholePool
  }

  // Freight/handling: explicit GR actuals win over the PO estimate.
  let shippingCost: number
  let otherCost: number
  let chargePool: number
  if (explicitTotal > 0) {
    chargePool = explicitTotal
    shippingCost = explicitShipping
    otherCost = explicitOther
  } else {
    chargePool = shareOf(Number(poCostPool) || 0)
    shippingCost = chargePool
    otherCost = 0
  }

  // Discount always applies proportionally (it is not a freight estimate).
  const discountPool = shareOf(poDiscount)

  if (chargePool <= 0 && discountPool <= 0 && adminPool <= 0) {
    return { ...empty, shippingCost, otherCost, discount: 0 }
  }

  // Weight each line by goods value, falling back to qty then to an even split.
  let weights = lines.map((l) => l.baseQty * l.poNetUnitPrice)
  let totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0) {
    weights = lines.map((l) => l.baseQty)
    totalWeight = weights.reduce((s, w) => s + w, 0)
  }
  if (totalWeight <= 0) {
    weights = lines.map(() => 1)
    totalWeight = weights.length
  }

  const chargeAdditions = allocateByWeights(chargePool, weights, totalWeight)
  const adminAdditions = allocateByWeights(adminPool, weights, totalWeight)
  const discountAdditions = allocateByWeights(discountPool, weights, totalWeight)
  const lineAdditions = lines.map((_, i) =>
    round2(chargeAdditions[i] + adminAdditions[i] - discountAdditions[i])
  )
  const perUnitAdditions = lines.map((l, i) =>
    l.baseQty > 0 ? lineAdditions[i] / l.baseQty : 0
  )
  const adminPerUnitAdditions = lines.map((l, i) =>
    l.baseQty > 0 ? adminAdditions[i] / l.baseQty : 0
  )

  return {
    lineAdditions,
    perUnitAdditions,
    chargeAdditions,
    adminAdditions,
    adminPerUnitAdditions,
    discountAdditions,
    shippingCost,
    otherCost,
    adminFee: round2(adminPool),
    discount: round2(discountPool),
    absorbed: round2(lineAdditions.reduce((s, v) => s + v, 0)),
  }
}
