import { describe, it, expect } from "vitest"
import {
  classifyCounterpart,
  classifyJournal,
  foldActivities,
  type JournalLine,
} from "@/lib/finance/cash-flow"

const line = (p: Partial<JournalLine> & { accountId: number }): JournalLine => ({
  type: "ASSET",
  code: "",
  name: "",
  debit: 0,
  credit: 0,
  ...p,
})

describe("classifyCounterpart", () => {
  it("classifies equity as financing", () => {
    expect(classifyCounterpart({ type: "EQUITY", code: "3000", name: "Modal" })).toBe("financing")
  })

  it("classifies fixed-asset codes as investing", () => {
    expect(classifyCounterpart({ type: "ASSET", code: "1-3-01", name: "Mesin" })).toBe("investing")
    expect(classifyCounterpart({ type: "ASSET", code: "1300", name: "Aset Tetap" })).toBe("investing")
  })

  it("classifies non-fixed assets (receivable/inventory) as operating", () => {
    expect(classifyCounterpart({ type: "ASSET", code: "1100", name: "Piutang Usaha" })).toBe("operating")
    expect(classifyCounterpart({ type: "ASSET", code: "1200", name: "Persediaan" })).toBe("operating")
  })

  it("classifies loans / bank debt as financing, trade payables as operating", () => {
    expect(classifyCounterpart({ type: "LIABILITY", code: "2500", name: "Hutang Bank" })).toBe("financing")
    expect(classifyCounterpart({ type: "LIABILITY", code: "2501", name: "Pinjaman Jangka Panjang" })).toBe("financing")
    expect(classifyCounterpart({ type: "LIABILITY", code: "2000", name: "Hutang Usaha" })).toBe("operating")
  })

  it("classifies revenue/expense as operating", () => {
    expect(classifyCounterpart({ type: "REVENUE", code: "4000", name: "Pendapatan" })).toBe("operating")
    expect(classifyCounterpart({ type: "EXPENSE", code: "5100", name: "Beban" })).toBe("operating")
  })
})

describe("classifyJournal", () => {
  const cash = (id: number) => id === 1

  it("returns null for a pure inter-cash transfer (no net cash delta)", () => {
    const result = classifyJournal(
      [
        line({ accountId: 1, debit: 500 }), // Kas
        line({ accountId: 2, credit: 500 }), // Bank (also cash)
      ],
      (id) => id === 1 || id === 2,
    )
    expect(result).toBeNull()
  })

  it("returns null when there is a cash delta but no counterpart", () => {
    // Defensive: an unbalanced single-line journal cannot be classified.
    const result = classifyJournal([line({ accountId: 1, debit: 500 })], cash)
    expect(result).toBeNull()
  })

  it("attributes a cash sale to operating and keeps the signed delta", () => {
    const result = classifyJournal(
      [
        line({ accountId: 1, debit: 1_000_000 }), // cash in
        line({ accountId: 9, type: "REVENUE", code: "4000", name: "Pendapatan", credit: 1_000_000 }),
      ],
      cash,
    )
    expect(result).toEqual({ activity: "operating", cashDelta: 1_000_000 })
  })

  it("attributes a cash outflow to the dominant counterpart activity", () => {
    // Buy a machine: cash out, fixed asset in.
    const result = classifyJournal(
      [
        line({ accountId: 7, type: "ASSET", code: "1300", name: "Aset Tetap", debit: 5_000_000 }),
        line({ accountId: 1, credit: 5_000_000 }),
      ],
      cash,
    )
    expect(result).toEqual({ activity: "investing", cashDelta: -5_000_000 })
  })

  it("attribution follows the LARGEST counterpart when several exist", () => {
    // Cash out 3jt: 2jt to expense (operating, larger), 1jt to equipment (investing).
    const result = classifyJournal(
      [
        line({ accountId: 1, credit: 3_000_000 }),
        line({ accountId: 5, type: "EXPENSE", code: "5100", name: "Beban", debit: 2_000_000 }),
        line({ accountId: 7, type: "ASSET", code: "1300", name: "Aset Tetap", debit: 1_000_000 }),
      ],
      cash,
    )
    expect(result?.activity).toBe("operating")
    expect(result?.cashDelta).toBe(-3_000_000)
  })
})

describe("foldActivities", () => {
  it("skips nulls and sums per activity", () => {
    const totals = foldActivities([
      { activity: "operating", cashDelta: 100 },
      null,
      { activity: "investing", cashDelta: -40 },
      { activity: "financing", cashDelta: 25 },
      { activity: "operating", cashDelta: 10 },
    ])
    expect(totals).toEqual({ operating: 110, investing: -40, financing: 25 })
  })

  it("returns zeros when nothing is classified", () => {
    expect(foldActivities([null, null])).toEqual({ operating: 0, investing: 0, financing: 0 })
  })

  it("per-activity totals sum to the net cash flow", () => {
    const totals = foldActivities([
      { activity: "operating", cashDelta: 500 },
      { activity: "investing", cashDelta: -200 },
      { activity: "financing", cashDelta: 100 },
    ])
    const net = totals.operating + totals.investing + totals.financing
    expect(net).toBe(400)
  })
})
