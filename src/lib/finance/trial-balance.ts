/**
 * Pure trial-balance aggregation, extracted from the Neraca Saldo report page
 * (`src/app/(dashboard)/laporan/neraca-saldo/page.tsx`) so the core invariant
 * (Σ debit == Σ credit) can be unit-tested without standing up Prisma.
 *
 * A trial balance places each account into the debit or credit column purely by
 * the SIGN of its net balance (debit − credit), NOT by the account's normal
 * balance type. A net debit balance lands in the debit column; a net credit
 * balance lands in the credit column. This single rule is what guarantees the
 * two columns sum equal when every journal entry is balanced.
 *
 * (A prior bug branched on account type and flipped credit-normal accounts —
 * LIABILITY/EQUITY/REVENUE — into the wrong column, which made the totals never
 * balance whenever any such account had a balance.)
 */

export interface TrialBalanceEntryInput {
  id: number
  code: string
  name: string
  type: string
  /** Sum of all debit postings for this account in the period. */
  totalDebit: number
  /** Sum of all credit postings for this account in the period. */
  totalCredit: number
}

export interface TrialBalanceLine {
  id: number
  code: string
  name: string
  type: string
  /** Net debit balance (0 if the account nets to a credit). */
  totalDebit: number
  /** Net credit balance (0 if the account nets to a debit). */
  totalCredit: number
}

export interface TrialBalanceResult {
  lines: TrialBalanceLine[]
  grandTotalDebit: number
  grandTotalCredit: number
  isBalanced: boolean
}

/**
 * Build trial-balance lines from per-account debit/credit sums. Accounts whose
 * net balance is zero are dropped (nothing to show). Totals and the balance
 * check are computed over the retained lines.
 */
export function computeTrialBalance(
  accounts: TrialBalanceEntryInput[],
): TrialBalanceResult {
  const lines: TrialBalanceLine[] = accounts
    .map((acc) => {
      const netBalance = acc.totalDebit - acc.totalCredit
      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        totalDebit: Math.max(0, netBalance),
        totalCredit: Math.max(0, -netBalance),
      }
    })
    .filter((a) => a.totalDebit > 0 || a.totalCredit > 0)

  const grandTotalDebit = lines.reduce((sum, a) => sum + a.totalDebit, 0)
  const grandTotalCredit = lines.reduce((sum, a) => sum + a.totalCredit, 0)
  const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.01

  return { lines, grandTotalDebit, grandTotalCredit, isBalanced }
}
