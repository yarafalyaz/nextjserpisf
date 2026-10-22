import { describe, expect, it } from "vitest"

import { aggregateTransferMoves, remainingQtyByItem } from "@/lib/reports/transfer-in-transit-data"

describe("remainingQtyByItem sisa in-transit (F-081-S §7)", () => {
  it("qty 10 diterima 4 -> sisa 6, bukan qty penuh", () => {
    const byItem = remainingQtyByItem([{ itemId: 7, qty: 10, receivedQty: 4 }])
    expect(byItem.get(7)).toBe(6)
  })

  it("baris duplikat item sama diagregasi per sisa baris", () => {
    const byItem = remainingQtyByItem([
      { itemId: 7, qty: 3, receivedQty: 3 },
      { itemId: 7, qty: 2, receivedQty: 1 },
      { itemId: 8, qty: 5, receivedQty: 0 },
    ])
    expect(byItem.get(7)).toBe(1)
    expect(byItem.get(8)).toBe(5)
  })

  it("baris lunas (receivedQty = qty) tidak tampil", () => {
    const byItem = remainingQtyByItem([{ itemId: 7, qty: 4, receivedQty: 4 }])
    expect(byItem.size).toBe(0)
  })
})

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
