import { describe, it, expect } from "vitest"
import { allocateLandedCost } from "@/lib/services/landed-cost.service"

// Regression suite for the HPP / landed-cost PRD (docs/prd-hpp-landed-cost.md §6).
//
// The old hook divided the PO's whole freight by the PO's ORDERED qty and added
// it to EVERY received unit. A partial receipt therefore over-absorbed freight,
// and a PO closed after a partial delivery stranded the rest of the freight
// outside HPP forever (P1). These tests pin the corrected value-share basis:
// a receipt absorbs only the share of the pool that matches the goods value it
// receives, so the shares of every receipt of a fully-received PO sum back to
// the pool — no over-absorption, no stranding.

describe("allocateLandedCost — scenario 1: full receipt in one go", () => {
  it("absorbs the whole PO freight pool, to the rupiah", () => {
    // PO: 10 pcs @ 1000 = 10000 value, freight 100000.
    const r = allocateLandedCost({
      lines: [{ baseQty: 10, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    expect(r.shippingCost).toBe(100000)
    expect(r.absorbed).toBe(100000)
    expect(r.lineAdditions).toEqual([100000])
    expect(r.perUnitAdditions).toEqual([10000])
  })
})

describe("allocateLandedCost — scenario 2: partial 4 + 6", () => {
  it("splits the pool across the two receipts with no over/under-absorption", () => {
    // PO: 10 pcs @ 1000 = 10000 value, freight 100000.
    const first = allocateLandedCost({
      lines: [{ baseQty: 4, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    const second = allocateLandedCost({
      lines: [{ baseQty: 6, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    expect(first.absorbed).toBe(40000)
    expect(second.absorbed).toBe(60000)
    expect(first.absorbed + second.absorbed).toBe(100000)
    // Same per-unit freight on both lots — the basis does not depend on which
    // receipt happens to arrive first.
    expect(first.perUnitAdditions[0]).toBe(10000)
    expect(second.perUnitAdditions[0]).toBe(10000)
  })
})

describe("allocateLandedCost — scenario 3: PO closed after a partial receipt", () => {
  it("absorbs only its own share by default (no over-absorption)", () => {
    // 4 of 10 received, no actual freight entered: the receipt takes 40% of the
    // estimate. Capitalising the full 100000 into 4 units would inflate HPP for
    // goods that were never delivered.
    const r = allocateLandedCost({
      lines: [{ baseQty: 4, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    expect(r.absorbed).toBe(40000)
  })

  it("absorbs the FULL actual freight when the user records it (P3), so nothing is stranded", () => {
    // The vendor shipped 4 pcs and charged 100000 for that shipment. The user
    // records the real freight on the receipt, which overrides the PO estimate
    // and lands entirely in the 4 received units.
    const r = allocateLandedCost({
      lines: [{ baseQty: 4, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
      shippingCost: 100000,
    })
    expect(r.shippingCost).toBe(100000)
    expect(r.absorbed).toBe(100000)
    expect(r.perUnitAdditions[0]).toBe(25000)
  })
})

describe("allocateLandedCost — scenario 4: header discount reduces HPP", () => {
  it("subtracts the receipt's discount share and reports it separately", () => {
    // PO: 10 pcs, unitPrice 1000, line discount 1000 → poItem.total 9000.
    // The GR unit cost is entered GROSS (1000), so the 1000 discount must be
    // applied once here to bring the effective cost down to 900/unit.
    const r = allocateLandedCost({
      lines: [{ baseQty: 10, poNetUnitPrice: 900 }],
      poCostPool: 0,
      poNetValue: 9000,
      poDiscount: 1000,
    })
    expect(r.chargeAdditions).toEqual([0])
    expect(r.discountAdditions).toEqual([1000])
    expect(r.lineAdditions).toEqual([-1000])
    expect(r.perUnitAdditions).toEqual([-100])
    expect(r.discount).toBe(1000)
    expect(r.absorbed).toBe(-1000)
  })

  it("applies discount and freight together, netting to freight − discount", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 10, poNetUnitPrice: 1000 }],
      poCostPool: 5000,
      poNetValue: 10000,
      poDiscount: 2000,
    })
    expect(r.shippingCost).toBe(5000)
    expect(r.discount).toBe(2000)
    expect(r.absorbed).toBe(3000)
    expect(r.perUnitAdditions[0]).toBe(300)
  })
})

describe("allocateLandedCost — scenario 5: actual freight differs from the PO estimate", () => {
  it("uses the receipt's entered freight, not the PO estimate", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 10, poNetUnitPrice: 1000 }],
      poCostPool: 100000, // PO estimate — must be ignored
      poNetValue: 10000,
      shippingCost: 25000,
      otherCost: 5000,
    })
    expect(r.shippingCost).toBe(25000)
    expect(r.otherCost).toBe(5000)
    expect(r.absorbed).toBe(30000)
    expect(r.perUnitAdditions[0]).toBe(3000)
  })

  it("keeps applying the PO discount proportionally even when freight is overridden", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 10, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
      poDiscount: 1000,
      shippingCost: 5000,
    })
    expect(r.absorbed).toBe(4000)
  })
})

describe("allocateLandedCost — scenario 6: multi-UoM (base-unit allocation)", () => {
  it("allocates on the BASE qty so a BOX receipt matches a PCS receipt", () => {
    // PO: 12 PCS @ 1000 = 12000. GR enters 1 BOX (= 12 PCS, factor 12).
    const r = allocateLandedCost({
      lines: [{ baseQty: 12, poNetUnitPrice: 1000 }],
      poCostPool: 12000,
      poNetValue: 12000,
    })
    expect(r.perUnitAdditions[0]).toBe(1000) // per BASE unit
    expect(r.absorbed).toBe(12000)
    // The line total scales with the base qty, so 1 BOX absorbs 12 × 1000.
    expect(r.lineAdditions[0]).toBe(12000)
  })
})

describe("allocateLandedCost — scenario 7: two items with very different values", () => {
  it("charges the expensive item a larger freight share while the total balances", () => {
    // PO: item A 10 × 1000 = 10000; item B 10 × 9000 = 90000. Freight 10000.
    const r = allocateLandedCost({
      lines: [
        { baseQty: 10, poNetUnitPrice: 1000 },
        { baseQty: 10, poNetUnitPrice: 9000 },
      ],
      poCostPool: 10000,
      poNetValue: 100000,
    })
    expect(r.lineAdditions[0]).toBe(1000) // 10% of the freight
    expect(r.lineAdditions[1]).toBe(9000) // 90% of the freight
    expect(r.perUnitAdditions[0]).toBe(100)
    expect(r.perUnitAdditions[1]).toBe(900)
    expect(r.absorbed).toBe(10000)
  })
})

describe("allocateLandedCost — scenario 8: corrections never rewrite the past", () => {
  it("is stateless: a later receipt's pool change leaves an earlier allocation untouched", () => {
    // The allocator holds no history, so posting a correction on a later GR
    // cannot retroactively change a previously-posted layer (PRD §7). This is
    // the structural guarantee behind "GR lama tidak dihitung ulang".
    const before = allocateLandedCost({
      lines: [{ baseQty: 4, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    // A later receipt with a different (corrected) pool:
    allocateLandedCost({
      lines: [{ baseQty: 6, poNetUnitPrice: 1000 }],
      poCostPool: 250000,
      poNetValue: 10000,
      shippingCost: 250000,
    })
    const after = allocateLandedCost({
      lines: [{ baseQty: 4, poNetUnitPrice: 1000 }],
      poCostPool: 100000,
      poNetValue: 10000,
    })
    expect(after).toEqual(before)
  })
})

describe("allocateLandedCost — rounding reconciliation", () => {
  it("pushes the rupiah drift onto the largest line so the pool is booked exactly", () => {
    // 100 / 3 → 33.33 each = 99.99; the 0.01 drift lands on the largest line.
    const r = allocateLandedCost({
      lines: [
        { baseQty: 1, poNetUnitPrice: 1 },
        { baseQty: 1, poNetUnitPrice: 1 },
        { baseQty: 1, poNetUnitPrice: 1 },
      ],
      poCostPool: 100,
      poNetValue: 3,
    })
    const sum = r.lineAdditions.reduce((s, v) => s + v, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
    expect(r.absorbed).toBe(100)
  })

  it("reconciles charge and discount independently, each to the cent", () => {
    const r = allocateLandedCost({
      lines: [
        { baseQty: 1, poNetUnitPrice: 1 },
        { baseQty: 1, poNetUnitPrice: 2 },
      ],
      poCostPool: 100,
      poNetValue: 3,
      poDiscount: 50,
    })
    const chargeSum = r.chargeAdditions.reduce((s, v) => s + v, 0)
    const discountSum = r.discountAdditions.reduce((s, v) => s + v, 0)
    expect(Math.round(chargeSum * 100) / 100).toBe(100)
    expect(Math.round(discountSum * 100) / 100).toBe(50)
    expect(r.absorbed).toBe(50)
  })
})

describe("allocateLandedCost — degenerate inputs", () => {
  it("returns zeros for an empty line list", () => {
    const r = allocateLandedCost({ lines: [], poCostPool: 1000, poNetValue: 1000 })
    expect(r.lineAdditions).toEqual([])
    expect(r.absorbed).toBe(0)
  })

  it("returns zeros when the PO carries no freight and no discount", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 5, poNetUnitPrice: 100 }],
      poCostPool: 0,
      poNetValue: 500,
    })
    expect(r.absorbed).toBe(0)
    expect(r.perUnitAdditions).toEqual([0])
  })

  it("falls back to qty weighting when the PO goods value is zero", () => {
    // Pathological PO with zero value but real freight: split by qty, not evenly
    // and not by value.
    const r = allocateLandedCost({
      lines: [
        { baseQty: 1, poNetUnitPrice: 0 },
        { baseQty: 3, poNetUnitPrice: 0 },
      ],
      poCostPool: 400,
      poNetValue: 0,
    })
    expect(r.lineAdditions).toEqual([100, 300])
    expect(r.absorbed).toBe(400)
  })

  it("absorbs the whole pool when the PO has zero goods value", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 2, poNetUnitPrice: 0 }],
      poCostPool: 500,
      poNetValue: 0,
    })
    expect(r.absorbed).toBe(500)
    expect(r.perUnitAdditions[0]).toBe(250)
  })
})

describe("allocateLandedCost — bank/admin fee component", () => {
  it("capitalises the admin fee into HPP and exposes it as its own pool", () => {
    // Tokopedia-style receipt: 1 unit, goods 130000, ongkir 20000, admin 1000.
    const r = allocateLandedCost({
      lines: [{ baseQty: 1, poNetUnitPrice: 130000 }],
      poCostPool: 0,
      poNetValue: 130000,
      shippingCost: 20000,
      adminFee: 1000,
    })
    // lineAdditions = charge(20000) + admin(1000) − discount(0)
    expect(r.lineAdditions).toEqual([21000])
    expect(r.perUnitAdditions).toEqual([21000])
    expect(r.adminAdditions).toEqual([1000])
    expect(r.adminPerUnitAdditions).toEqual([1000])
    expect(r.adminFee).toBe(1000)
    // 130000 goods + 21000 landed = 151000 total HPP
    expect(r.absorbed).toBe(21000)
  })

  it("splits the admin fee by goods value across multiple lines", () => {
    // Line A value 150000 (75%), line B value 50000 (25%); admin 1000.
    const r = allocateLandedCost({
      lines: [
        { baseQty: 1, poNetUnitPrice: 150000 },
        { baseQty: 1, poNetUnitPrice: 50000 },
      ],
      poCostPool: 0,
      poNetValue: 200000,
      adminFee: 1000,
    })
    expect(r.adminAdditions).toEqual([750, 250])
    expect(r.lineAdditions).toEqual([750, 250]) // no other charges/discount
    // admin shares sum exactly back to the pool
    expect(r.adminAdditions.reduce((s, v) => s + v, 0)).toBe(1000)
  })

  it("still allocates the admin fee when there are no other charges", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 2, poNetUnitPrice: 50000 }],
      poCostPool: 0,
      poNetValue: 100000,
      adminFee: 3000,
    })
    expect(r.lineAdditions).toEqual([3000])
    expect(r.perUnitAdditions[0]).toBe(1500)
  })

  it("defaults the admin fee to zero when omitted (backward compatible)", () => {
    const r = allocateLandedCost({
      lines: [{ baseQty: 1, poNetUnitPrice: 1000 }],
      poCostPool: 0,
      poNetValue: 1000,
      shippingCost: 100,
    })
    expect(r.adminFee).toBe(0)
    expect(r.adminAdditions).toEqual([0])
    expect(r.lineAdditions).toEqual([100])
  })
})
