/**
 * Pure over-return validation, extracted from createSalesReturn in
 * `src/actions/sales.actions.ts` so the cumulative-cap logic can be unit-tested.
 *
 * A sales return linked to an invoice must not return more units than were
 * invoiced, counting prior non-cancelled returns for that same invoice. Without
 * this, a return over-restocks inventory and over-credits AR (Piutang).
 * Mirrors the down-payment cumulative-cap pattern.
 */

export interface ReturnLineInput {
  itemId: number
  qty: number
}

export interface ReturnQtyViolation {
  itemId: number
  /** "not_on_invoice": item was never on the source invoice.
   *  "exceeds_invoiced": cumulative returned qty would exceed invoiced qty. */
  type: "not_on_invoice" | "exceeds_invoiced"
  requested: number
  invoiced: number
  alreadyReturned: number
  remaining: number
}

/**
 * Return the first line that violates the over-return cap, or null if all lines
 * are within their invoiced-minus-already-returned allowance.
 *
 * @param lines               return lines being created (itemId + qty)
 * @param invoicedQtyByItem   total qty invoiced per itemId on the source invoice
 * @param alreadyReturnedByItem cumulative qty already returned (non-cancelled) per itemId
 */
export function findOverReturn(
  lines: ReturnLineInput[],
  invoicedQtyByItem: Map<number, number>,
  alreadyReturnedByItem: Map<number, number>
): ReturnQtyViolation | null {
  // Aggregate requested qty per item within THIS return first, so two lines for
  // the same item can't each individually pass while together they overflow.
  const requestedByItem = new Map<number, number>()
  for (const line of lines) {
    requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + Number(line.qty))
  }

  for (const [itemId, requested] of requestedByItem) {
    const invoiced = invoicedQtyByItem.get(itemId)
    if (invoiced === undefined) {
      return { itemId, type: "not_on_invoice", requested, invoiced: 0, alreadyReturned: 0, remaining: 0 }
    }
    const alreadyReturned = alreadyReturnedByItem.get(itemId) ?? 0
    if (alreadyReturned + requested > invoiced) {
      return {
        itemId,
        type: "exceeds_invoiced",
        requested,
        invoiced,
        alreadyReturned,
        remaining: Math.max(0, invoiced - alreadyReturned),
      }
    }
  }
  return null
}
