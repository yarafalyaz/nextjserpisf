/**
 * Vendor payment allocation (oldest-first).
 *
 * A confirmed vendor payment must reduce the outstanding balance of the
 * vendor's open bills. Historically the confirm step looped over
 * `VendorPaymentAllocation` rows, but nothing ever created those rows — so
 * vendor bills were never marked paid and AP aging permanently overstated
 * payables. This helper computes the allocation deterministically:
 * oldest open bill first, capped at each bill's remaining balance, until the
 * payment amount is exhausted.
 *
 * Pure function — no DB access — so the production allocation path is unit
 * tested directly (callers pass bills already sorted oldest-first).
 */

export interface AllocatableBill {
  id: number
  /** Remaining balance on the bill (grandTotal - paidAmount). */
  balanceDue: number
}

export interface PaymentAllocation {
  vendorBillId: number
  amount: number
}

/** Round to 2 decimals to avoid float drift on money math (±0.01 tolerance). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Allocate `paymentAmount` across `bills` (must be pre-sorted oldest-first).
 * Each allocation is capped at the bill's remaining balance, so the caller's
 * overpay guard (paidAmount + amount <= grandTotal) can never trip.
 * Any excess beyond the sum of open balances is left unallocated.
 */
export function allocatePaymentToBills(
  paymentAmount: number,
  bills: AllocatableBill[]
): PaymentAllocation[] {
  let remaining = round2(paymentAmount)
  const allocations: PaymentAllocation[] = []

  for (const bill of bills) {
    if (remaining <= 0) break
    const due = round2(bill.balanceDue)
    if (due <= 0) continue

    const apply = round2(Math.min(remaining, due))
    if (apply <= 0) continue

    allocations.push({ vendorBillId: bill.id, amount: apply })
    remaining = round2(remaining - apply)
  }

  return allocations
}
