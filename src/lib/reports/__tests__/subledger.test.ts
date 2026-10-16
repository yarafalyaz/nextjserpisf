import { describe, it, expect } from "vitest"
import { buildSubledger, openingFromEntries, periodEntries, type SubledgerEntry } from "../subledger"

function entry(overrides: Partial<SubledgerEntry>): SubledgerEntry {
  return {
    key: "SalesInvoice:1",
    date: new Date(2026, 9, 1),
    documentNo: "INV-0001",
    href: null,
    description: null,
    debit: 0,
    credit: 0,
    ...overrides,
  }
}

describe("buildSubledger", () => {
  const entries: SubledgerEntry[] = [
    entry({ key: "A", debit: 1000 }),
    entry({ key: "B", credit: 400 }),
    entry({ key: "C", debit: 600 }),
  ]

  it("starts from the opening balance", () => {
    const ledger = buildSubledger(entries, 500)
    expect(ledger.openingBalance).toBe(500)
    expect(ledger.rows[0].balance).toBe(1500)
  })

  it("accumulates debit − credit row by row", () => {
    const ledger = buildSubledger(entries, 0)
    expect(ledger.rows.map((r) => r.balance)).toEqual([1000, 600, 1200])
  })

  it("totals debits and credits and closes correctly", () => {
    const ledger = buildSubledger(entries, 500)
    expect(ledger.totalDebit).toBe(1600)
    expect(ledger.totalCredit).toBe(400)
    expect(ledger.closingBalance).toBe(500 + 1600 - 400)
  })

  it("does not mutate the input entries", () => {
    const input = [...entries]
    buildSubledger(input, 0)
    expect((input[0] as unknown as Record<string, unknown>).balance).toBeUndefined()
  })

  it("keeps money arithmetic free of float drift", () => {
    const ledger = buildSubledger([entry({ debit: 0.3 }), entry({ credit: 0.1 })], 0.3)
    expect(ledger.rows[0].balance).toBe(0.6)
    expect(ledger.rows[1].balance).toBe(0.5)
  })
})

describe("openingFromEntries", () => {
  const entries = [
    { date: new Date(2026, 8, 20), debit: 1000, credit: 0 },
    { date: new Date(2026, 9, 5), debit: 0, credit: 300 },
  ]

  it("sums only the entries before the period start", () => {
    expect(openingFromEntries(entries, new Date(2026, 9, 1))).toBe(1000)
  })

  it("is zero when nothing precedes the period", () => {
    expect(openingFromEntries(entries, new Date(2026, 8, 1))).toBe(0)
  })
})

describe("periodEntries", () => {
  it("keeps only entries inside the window (inclusive)", () => {
    const rows = [
      { date: new Date(2026, 8, 30), value: "before" },
      { date: new Date(2026, 9, 1), value: "start" },
      { date: new Date(2026, 9, 15), value: "inside" },
      { date: new Date(2026, 9, 31), value: "end" },
      { date: new Date(2026, 10, 1), value: "after" },
    ]
    const kept = periodEntries(rows, new Date(2026, 9, 1), new Date(2026, 9, 31))
    expect(kept.map((r) => r.value)).toEqual(["start", "inside", "end"])
  })
})
