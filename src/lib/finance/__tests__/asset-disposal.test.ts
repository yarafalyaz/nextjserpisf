import { describe, it, expect } from "vitest"
import { buildAssetDisposalEntries } from "@/lib/finance/asset-disposal"

const accounts = { fixedAsset: 101, cashBank: 102, accumDep: 103, gainLoss: 104 }

function sum(entries: { debit: number; credit: number }[]) {
  return {
    debit: entries.reduce((s, e) => s + e.debit, 0),
    credit: entries.reduce((s, e) => s + e.credit, 0),
  }
}

describe("buildAssetDisposalEntries", () => {
  it("balances on a GAIN (proceeds > book value)", () => {
    // gross 10M, book 3M (7M depreciated), sold for 5M -> gain 2M
    const entries = buildAssetDisposalEntries({ grossCost: 10_000_000, bookValue: 3_000_000, proceeds: 5_000_000, assetName: "Mesin", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    // Cash 5M + AccumDep 7M debit = 12M ; FixedAsset 10M + Gain 2M credit = 12M
    expect(debit).toBeCloseTo(12_000_000, 2)
    const gain = entries.find((e) => e.accountId === accounts.gainLoss)
    expect(gain?.credit).toBeCloseTo(2_000_000, 2)
    expect(gain?.debit).toBe(0)
  })

  it("balances on a LOSS (proceeds < book value)", () => {
    // gross 10M, book 6M (4M depreciated), sold for 2M -> loss 4M
    const entries = buildAssetDisposalEntries({ grossCost: 10_000_000, bookValue: 6_000_000, proceeds: 2_000_000, assetName: "Mobil", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    // Cash 2M + AccumDep 4M + Loss 4M debit = 10M ; FixedAsset 10M credit
    expect(debit).toBeCloseTo(10_000_000, 2)
    const loss = entries.find((e) => e.accountId === accounts.gainLoss)
    expect(loss?.debit).toBeCloseTo(4_000_000, 2)
    expect(loss?.credit).toBe(0)
  })

  it("balances on BREAK-EVEN (proceeds == book value, no gain/loss line)", () => {
    const entries = buildAssetDisposalEntries({ grossCost: 10_000_000, bookValue: 4_000_000, proceeds: 4_000_000, assetName: "Genset", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    // no gain/loss entry when residual is zero
    expect(entries.find((e) => e.accountId === accounts.gainLoss)).toBeUndefined()
  })

  it("balances with ZERO proceeds (write-off, fully depreciated)", () => {
    // gross 5M, fully depreciated (book 0), scrapped for 0 -> no gain/loss
    const entries = buildAssetDisposalEntries({ grossCost: 5_000_000, bookValue: 0, proceeds: 0, assetName: "Printer", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    // AccumDep 5M debit = FixedAsset 5M credit ; no cash line
    expect(entries.find((e) => e.accountId === accounts.cashBank)).toBeUndefined()
    expect(debit).toBeCloseTo(5_000_000, 2)
  })

  it("balances when written off at a loss with zero proceeds (book value remains)", () => {
    // gross 8M, book 3M (5M depreciated), scrapped for 0 -> loss 3M
    const entries = buildAssetDisposalEntries({ grossCost: 8_000_000, bookValue: 3_000_000, proceeds: 0, assetName: "AC", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    const loss = entries.find((e) => e.accountId === accounts.gainLoss)
    expect(loss?.debit).toBeCloseTo(3_000_000, 2)
  })

  it("handles a never-depreciated asset sold at a gain", () => {
    // gross 1M, book 1M (no depreciation), sold for 1.5M -> gain 500k, no accumDep line
    const entries = buildAssetDisposalEntries({ grossCost: 1_000_000, bookValue: 1_000_000, proceeds: 1_500_000, assetName: "Tanah", accounts })
    const { debit, credit } = sum(entries)
    expect(debit).toBeCloseTo(credit, 2)
    expect(entries.find((e) => e.accountId === accounts.accumDep)).toBeUndefined()
    const gain = entries.find((e) => e.accountId === accounts.gainLoss)
    expect(gain?.credit).toBeCloseTo(500_000, 2)
  })

  it("rounds fractional rupiah without breaking balance", () => {
    const entries = buildAssetDisposalEntries({ grossCost: 1_000_000.33, bookValue: 333_333.33, proceeds: 200_000.5, assetName: "Pompa", accounts })
    const { debit, credit } = sum(entries)
    expect(Math.abs(debit - credit)).toBeLessThanOrEqual(0.01)
  })
})
