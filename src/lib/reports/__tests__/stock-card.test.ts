import { describe, it, expect } from "vitest"
import { buildStockCard, openingBalance, type StockCardMove } from "../stock-card"

function move(overrides: Partial<StockCardMove>): StockCardMove {
  return {
    id: 1,
    date: new Date(2026, 9, 1),
    documentNo: "SM-0001",
    moveType: "receipt",
    impact: "IN",
    qty: 0,
    cost: 0,
    referenceType: null,
    referenceId: null,
    description: null,
    warehouseCode: "WH-0001",
    ...overrides,
  }
}

describe("openingBalance", () => {
  it("nets IN against OUT", () => {
    const opening = openingBalance([
      { qty: 10, cost: 1000, impact: "IN" },
      { qty: 4, cost: 1000, impact: "OUT" },
    ])
    expect(opening).toEqual({ qty: 6, value: 6000 })
  })

  it("is zero for no prior moves", () => {
    expect(openingBalance([])).toEqual({ qty: 0, value: 0 })
  })
})

describe("buildStockCard", () => {
  const moves: StockCardMove[] = [
    move({ id: 1, qty: 10, cost: 1000, impact: "IN", documentNo: "SM-0001" }),
    move({ id: 2, qty: 4, cost: 1000, impact: "OUT", documentNo: "SM-0002" }),
    move({ id: 3, qty: 6, cost: 1200, impact: "IN", documentNo: "SM-0003" }),
  ]

  it("starts the running balance from the opening balance", () => {
    const card = buildStockCard(moves, { qty: 5, value: 5000 })
    expect(card.openingQty).toBe(5)
    expect(card.openingValue).toBe(5000)
    expect(card.rows[0].balanceQty).toBe(15)
    expect(card.rows[0].balanceValue).toBe(15000)
  })

  it("adds IN and subtracts OUT row by row", () => {
    const card = buildStockCard(moves, { qty: 0, value: 0 })
    expect(card.rows.map((r) => r.balanceQty)).toEqual([10, 6, 12])
    expect(card.rows.map((r) => r.balanceValue)).toEqual([10000, 6000, 13200])
  })

  it("computes each row value as qty × cost", () => {
    const card = buildStockCard(moves, { qty: 0, value: 0 })
    expect(card.rows.map((r) => r.value)).toEqual([10000, 4000, 7200])
  })

  it("sums totals and closes on opening + in − out", () => {
    const card = buildStockCard(moves, { qty: 5, value: 5000 })
    expect(card.totalInQty).toBe(16)
    expect(card.totalOutQty).toBe(4)
    expect(card.totalInValue).toBe(17200)
    expect(card.totalOutValue).toBe(4000)
    expect(card.closingQty).toBe(5 + 16 - 4)
    expect(card.closingValue).toBe(5000 + 17200 - 4000)
  })

  it("preserves chronological order and does not mutate the input", () => {
    const input = [...moves]
    const card = buildStockCard(input, { qty: 0, value: 0 })
    expect(card.rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect((input[0] as unknown as Record<string, unknown>).balanceQty).toBeUndefined()
  })

  it("keeps currency arithmetic free of float drift", () => {
    const card = buildStockCard(
      [move({ qty: 0.3, cost: 1, impact: "IN" }), move({ qty: 0.1, cost: 1, impact: "OUT" })],
      { qty: 0.3, value: 0.3 },
    )
    expect(card.rows[0].balanceQty).toBe(0.6)
    expect(card.rows[1].balanceQty).toBe(0.5)
  })

  it("handles an empty period (opening only)", () => {
    const card = buildStockCard([], { qty: 7, value: 7000 })
    expect(card.rows).toEqual([])
    expect(card.closingQty).toBe(7)
    expect(card.closingValue).toBe(7000)
  })
})
