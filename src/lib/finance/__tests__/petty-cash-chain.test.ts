import { describe, it, expect } from "vitest"
import {
  computePettyCashChain,
  findFirstNegativeBalance,
  type PettyCashChainRecord,
} from "../petty-cash-chain"

/**
 * Characterization + regression tests for the petty-cash running-balance chain.
 * The chain is a single ordered ledger: IN adds, OUT subtracts, and each record
 * carries the running balance before/after it. The negative-balance guard must
 * catch backdated OUT entries inserted mid-chain and edits that push a later
 * balance below zero — cases the insert-time tail-balance pre-check cannot see.
 */
describe("computePettyCashChain", () => {
  it("computes a simple IN→OUT chain", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 1, type: "IN", amount: 1_000_000 },
      { id: 2, type: "OUT", amount: 300_000 },
      { id: 3, type: "OUT", amount: 200_000 },
    ]
    expect(computePettyCashChain(recs)).toEqual([
      { id: 1, balanceBefore: 0, balanceAfter: 1_000_000 },
      { id: 2, balanceBefore: 1_000_000, balanceAfter: 700_000 },
      { id: 3, balanceBefore: 700_000, balanceAfter: 500_000 },
    ])
  })

  it("returns an empty array for no records", () => {
    expect(computePettyCashChain([])).toEqual([])
  })

  it("chains balanceBefore of each record to balanceAfter of the previous", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 10, type: "IN", amount: 500_000 },
      { id: 11, type: "IN", amount: 250_000 },
      { id: 12, type: "OUT", amount: 100_000 },
    ]
    const out = computePettyCashChain(recs)
    expect(out[1].balanceBefore).toBe(out[0].balanceAfter)
    expect(out[2].balanceBefore).toBe(out[1].balanceAfter)
    expect(out[2].balanceAfter).toBe(650_000)
  })
})

describe("findFirstNegativeBalance", () => {
  it("returns null when the chain never goes negative", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 1, type: "IN", amount: 1_000_000 },
      { id: 2, type: "OUT", amount: 1_000_000 },
    ]
    expect(findFirstNegativeBalance(recs)).toBeNull()
  })

  it("flags a backdated OUT inserted before sufficient funds (mid-chain overdraw)", () => {
    // Chronological order after reorder: a 500k OUT lands BEFORE the IN that
    // funds it. The tail balance would look fine, but the chain goes negative.
    const recs: PettyCashChainRecord[] = [
      { id: 2, documentNo: "PC-002", type: "OUT", amount: 500_000 },
      { id: 1, documentNo: "PC-001", type: "IN", amount: 1_000_000 },
    ]
    const neg = findFirstNegativeBalance(recs)
    expect(neg).not.toBeNull()
    expect(neg!.record.id).toBe(2)
    expect(neg!.balanceAfter).toBe(-500_000)
  })

  it("flags an edit that pushes a later balance below zero", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 1, type: "IN", amount: 300_000 },
      { id: 2, type: "OUT", amount: 100_000 },
      { id: 3, documentNo: "PC-003", type: "OUT", amount: 400_000 }, // edited upward
    ]
    const neg = findFirstNegativeBalance(recs)
    expect(neg).not.toBeNull()
    expect(neg!.record.id).toBe(3)
    expect(neg!.balanceAfter).toBe(-200_000)
  })

  it("returns the FIRST offending record, not a later one", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 1, type: "OUT", amount: 100_000 }, // already negative here
      { id: 2, type: "OUT", amount: 100_000 },
    ]
    const neg = findFirstNegativeBalance(recs)
    expect(neg!.record.id).toBe(1)
    expect(neg!.balanceAfter).toBe(-100_000)
  })

  it("treats exact-zero balance as valid (not negative)", () => {
    const recs: PettyCashChainRecord[] = [
      { id: 1, type: "IN", amount: 250_000 },
      { id: 2, type: "OUT", amount: 250_000 },
    ]
    expect(findFirstNegativeBalance(recs)).toBeNull()
  })
})

describe("petty cash chain preserves sen (Decimal 15,2)", () => {
  it("keeps .50 / .25 through IN then OUT", () => {
    const out = computePettyCashChain([
      { id: 1, type: "IN", amount: 100000.5 },
      { id: 2, type: "OUT", amount: 50000.25 },
    ])
    expect(out).toEqual([
      { id: 1, balanceBefore: 0, balanceAfter: 100000.5 },
      { id: 2, balanceBefore: 100000.5, balanceAfter: 50000.25 },
    ])
  })

  it("does not round 100.49 up to 100 before subtracting", () => {
    const out = computePettyCashChain([
      { id: 1, type: "IN", amount: 100.49 },
      { id: 2, type: "OUT", amount: 0.49 },
    ])
    expect(out[1].balanceAfter).toBe(100)
  })

  it("findFirstNegativeBalance sees sub-rupiah overdraw", () => {
    // OUT 100.50 dari saldo 100.25 -> -0.25; decimals=0 membulatkannya 100-100=0 lolos.
    const neg = findFirstNegativeBalance([
      { id: 1, type: "IN", amount: 100.25 },
      { id: 2, documentNo: "PC-002", type: "OUT", amount: 100.5 },
    ])
    expect(neg?.record.id).toBe(2)
    expect(neg?.balanceAfter).toBe(-0.25)
  })
})
