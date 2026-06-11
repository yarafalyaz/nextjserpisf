import { safeAdd, safeSubtract } from "@/lib/utils/math"

/**
 * Pure petty-cash running-balance chain math, extracted from
 * `src/actions/finance.actions.ts` so the balance computation and the
 * overdraw (negative-balance) detection can be unit-tested without Prisma.
 *
 * The petty cash ledger is a single ordered chain: each record carries a
 * balanceBefore (the running balance prior to it) and balanceAfter. Records
 * are ordered chronologically (date asc, then id asc as a stable tiebreaker).
 * IN adds to the balance, OUT subtracts.
 */

export interface PettyCashChainRecord {
  id: number
  documentNo?: string | null
  /** "IN" | "OUT" */
  type: string
  amount: number
}

export interface PettyCashChainBalance {
  id: number
  balanceBefore: number
  balanceAfter: number
}

/**
 * Compute balanceBefore/balanceAfter for every record in the given order.
 * Input MUST already be sorted chronologically (date asc, id asc).
 */
export function computePettyCashChain(
  records: PettyCashChainRecord[]
): PettyCashChainBalance[] {
  const out: PettyCashChainBalance[] = []
  let running = 0
  for (const rec of records) {
    const before = running
    const after = rec.type === "IN" ? safeAdd(before, rec.amount, 0) : safeSubtract(before, rec.amount, 0)
    out.push({ id: rec.id, balanceBefore: before, balanceAfter: after })
    running = after
  }
  return out
}

/**
 * Return the first record whose recomputed balanceAfter is negative, or null
 * if the chain never goes negative. Used to reject backdated OUT entries
 * inserted mid-chain and edits that push a later balance below zero — cases the
 * per-record pre-check at insert time cannot see because it only knows the
 * tail balance, not the post-reorder chain.
 */
export function findFirstNegativeBalance(
  records: PettyCashChainRecord[]
): { record: PettyCashChainRecord; balanceAfter: number } | null {
  let running = 0
  for (const rec of records) {
    running = rec.type === "IN" ? safeAdd(running, rec.amount, 0) : safeSubtract(running, rec.amount, 0)
    if (running < 0) {
      return { record: rec, balanceAfter: running }
    }
  }
  return null
}
