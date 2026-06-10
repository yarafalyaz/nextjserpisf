import { describe, it, expect } from "vitest"
import { allocatePaymentToBills } from "../payment-allocation"

describe("allocatePaymentToBills", () => {
  it("allocates oldest-first and caps each bill at its balance", () => {
    const bills = [
      { id: 1, balanceDue: 100 },
      { id: 2, balanceDue: 200 },
      { id: 3, balanceDue: 50 },
    ]
    // 250 covers bill 1 fully (100), then 150 of bill 2 — bill 3 untouched.
    expect(allocatePaymentToBills(250, bills)).toEqual([
      { vendorBillId: 1, amount: 100 },
      { vendorBillId: 2, amount: 150 },
    ])
  })

  it("pays a single bill exactly", () => {
    expect(allocatePaymentToBills(100, [{ id: 1, balanceDue: 100 }])).toEqual([
      { vendorBillId: 1, amount: 100 },
    ])
  })

  it("clears all bills when payment exceeds total outstanding (excess unallocated)", () => {
    const bills = [
      { id: 1, balanceDue: 100 },
      { id: 2, balanceDue: 50 },
    ]
    // 500 > 150 total; only 150 allocated, remaining 350 left unapplied.
    const result = allocatePaymentToBills(500, bills)
    expect(result).toEqual([
      { vendorBillId: 1, amount: 100 },
      { vendorBillId: 2, amount: 50 },
    ])
    expect(result.reduce((s, a) => s + a.amount, 0)).toBe(150)
  })

  it("skips bills with zero/negative balance", () => {
    const bills = [
      { id: 1, balanceDue: 0 },
      { id: 2, balanceDue: 100 },
    ]
    expect(allocatePaymentToBills(80, bills)).toEqual([
      { vendorBillId: 2, amount: 80 },
    ])
  })

  it("partial payment lands entirely on the oldest open bill", () => {
    const bills = [
      { id: 1, balanceDue: 300 },
      { id: 2, balanceDue: 200 },
    ]
    expect(allocatePaymentToBills(120, bills)).toEqual([
      { vendorBillId: 1, amount: 120 },
    ])
  })

  it("returns no allocations for a zero payment", () => {
    expect(allocatePaymentToBills(0, [{ id: 1, balanceDue: 100 }])).toEqual([])
  })

  it("avoids float drift on fractional balances", () => {
    const bills = [
      { id: 1, balanceDue: 33.33 },
      { id: 2, balanceDue: 33.33 },
      { id: 3, balanceDue: 33.34 },
    ]
    const result = allocatePaymentToBills(100, bills)
    expect(result.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(100, 2)
    expect(result).toHaveLength(3)
  })
})
