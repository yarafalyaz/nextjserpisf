import { describe, expect, it } from "vitest"

import { aggregateTransferMoves } from "@/lib/reports/transfer-in-transit-data"

describe("transfer-in-transit-data sen precision", () => {
  it("akumulasi 17 move 0,24 persis sen, bukan 4.080000000000002", () => {
    const moves = Array.from({ length: 17 }, () => ({
      referenceId: 1,
      itemId: 9,
      qty: 1,
      cost: 0.24,
    }))
    const byKey = aggregateTransferMoves(moves)
    const entry = byKey.get("1-9")
    expect(entry?.qty).toBe(17)
    expect(entry?.value).toBe(4.08)
    // unitCost turunan di loader: 4.08 / 17 persis 0.24
    expect(entry && entry.qty > 0 ? entry.value / entry.qty : null).toBe(0.24)
  })

  it("move qty×cost pecahan sen dibulatkan per move (3 × 0,335)", () => {
    const byKey = aggregateTransferMoves([{ referenceId: 2, itemId: 5, qty: 3, cost: 0.335 }])
    expect(byKey.get("2-5")?.value).toBe(1.01)
  })

  it("move tanpa referenceId dilewati", () => {
    const byKey = aggregateTransferMoves([{ referenceId: null, itemId: 5, qty: 3, cost: 10 }])
    expect(byKey.size).toBe(0)
  })
})
