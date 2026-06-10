import { describe, it, expect } from "vitest"
import { findOverReturn, type ReturnLineInput } from "../return-validation"

/**
 * Tests for the sales-return over-return cap. A return linked to an invoice
 * must not return more units than were invoiced, counting prior non-cancelled
 * returns; items not on the invoice cannot be returned against it.
 */
describe("findOverReturn", () => {
  const invoiced = new Map<number, number>([
    [1, 10],
    [2, 5],
  ])

  it("returns null when all lines are within the invoiced qty (no prior returns)", () => {
    const lines: ReturnLineInput[] = [
      { itemId: 1, qty: 4 },
      { itemId: 2, qty: 5 },
    ]
    expect(findOverReturn(lines, invoiced, new Map())).toBeNull()
  })

  it("flags a single line exceeding the invoiced qty", () => {
    const lines: ReturnLineInput[] = [{ itemId: 1, qty: 11 }]
    const v = findOverReturn(lines, invoiced, new Map())
    expect(v).not.toBeNull()
    expect(v!.type).toBe("exceeds_invoiced")
    expect(v!.itemId).toBe(1)
    expect(v!.invoiced).toBe(10)
    expect(v!.remaining).toBe(10)
  })

  it("flags an item not present on the invoice", () => {
    const lines: ReturnLineInput[] = [{ itemId: 99, qty: 1 }]
    const v = findOverReturn(lines, invoiced, new Map())
    expect(v).not.toBeNull()
    expect(v!.type).toBe("not_on_invoice")
    expect(v!.itemId).toBe(99)
  })

  it("accounts for prior non-cancelled returns (cumulative cap)", () => {
    // Item 1: invoiced 10, already returned 7. A new return of 4 → 11 > 10.
    const alreadyReturned = new Map<number, number>([[1, 7]])
    const lines: ReturnLineInput[] = [{ itemId: 1, qty: 4 }]
    const v = findOverReturn(lines, invoiced, alreadyReturned)
    expect(v).not.toBeNull()
    expect(v!.type).toBe("exceeds_invoiced")
    expect(v!.alreadyReturned).toBe(7)
    expect(v!.remaining).toBe(3)
  })

  it("allows a return exactly filling the remaining allowance", () => {
    const alreadyReturned = new Map<number, number>([[1, 7]])
    const lines: ReturnLineInput[] = [{ itemId: 1, qty: 3 }] // 7 + 3 = 10 == invoiced
    expect(findOverReturn(lines, invoiced, alreadyReturned)).toBeNull()
  })

  it("aggregates multiple lines for the same item before comparing", () => {
    // Two lines of 6 each for item 1 (invoiced 10): individually pass, together 12 > 10.
    const lines: ReturnLineInput[] = [
      { itemId: 1, qty: 6 },
      { itemId: 1, qty: 6 },
    ]
    const v = findOverReturn(lines, invoiced, new Map())
    expect(v).not.toBeNull()
    expect(v!.type).toBe("exceeds_invoiced")
    expect(v!.requested).toBe(12)
  })
})
