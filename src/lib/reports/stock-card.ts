/**
 * Kartu Stok (per-item stock card) aggregation.
 *
 * Pure by design (no Prisma) so the running-balance arithmetic can be unit-tested
 * the same way as `aging.ts` / `payables-summary.ts`.
 *
 * Convention: a move with impact IN increases the balance, OUT decreases it.
 * Values use the move's own unit cost (`StockMove.cost`), matching the existing
 * Mutasi Stok report — this is a movement ledger, not a FIFO revaluation.
 */

import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"

export interface StockCardMove {
  id: number
  date: Date
  documentNo: string
  moveType: string | null
  impact: "IN" | "OUT"
  qty: number
  /** Unit cost of this movement. */
  cost: number
  referenceType: string | null
  referenceId: number | null
  description: string | null
  warehouseCode: string | null
}

export interface StockCardRow extends StockCardMove {
  /** qty × cost */
  value: number
  balanceQty: number
  balanceValue: number
}

export interface StockCardResult {
  openingQty: number
  openingValue: number
  rows: StockCardRow[]
  totalInQty: number
  totalOutQty: number
  totalInValue: number
  totalOutValue: number
  closingQty: number
  closingValue: number
}

/**
 * Build the stock card: prepend the opening balance as the running start, then
 * walk the moves in order accumulating qty and value.
 */
export function buildStockCard(
  moves: StockCardMove[],
  opening: { qty: number; value: number },
): StockCardResult {
  let balanceQty = safeAdd(0, opening.qty, 2)
  let balanceValue = safeAdd(0, opening.value, 2)

  let totalInQty = 0
  let totalOutQty = 0
  let totalInValue = 0
  let totalOutValue = 0

  const rows: StockCardRow[] = moves.map((move) => {
    const value = safeMultiply(move.qty, move.cost, 2)
    const isIn = move.impact === "IN"

    if (isIn) {
      totalInQty = safeAdd(totalInQty, move.qty, 2)
      totalInValue = safeAdd(totalInValue, value, 2)
      balanceQty = safeAdd(balanceQty, move.qty, 2)
      balanceValue = safeAdd(balanceValue, value, 2)
    } else {
      totalOutQty = safeAdd(totalOutQty, move.qty, 2)
      totalOutValue = safeAdd(totalOutValue, value, 2)
      balanceQty = safeSubtract(balanceQty, move.qty, 2)
      balanceValue = safeSubtract(balanceValue, value, 2)
    }

    return { ...move, value, balanceQty, balanceValue }
  })

  return {
    openingQty: safeAdd(0, opening.qty, 2),
    openingValue: safeAdd(0, opening.value, 2),
    rows,
    totalInQty,
    totalOutQty,
    totalInValue,
    totalOutValue,
    closingQty: balanceQty,
    closingValue: balanceValue,
  }
}

/** Opening balance (qty + value) from the moves that precede the period. */
export function openingBalance(
  priorMoves: { qty: number; cost: number; impact: "IN" | "OUT" }[],
): { qty: number; value: number } {
  let qty = 0
  let value = 0
  for (const move of priorMoves) {
    const moveValue = safeMultiply(move.qty, move.cost, 2)
    if (move.impact === "IN") {
      qty = safeAdd(qty, move.qty, 2)
      value = safeAdd(value, moveValue, 2)
    } else {
      qty = safeSubtract(qty, move.qty, 2)
      value = safeSubtract(value, moveValue, 2)
    }
  }
  return { qty, value }
}
