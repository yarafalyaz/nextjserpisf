import { describe, it, expect } from "vitest"
import { computeTrialBalance, type TrialBalanceEntryInput } from "../trial-balance"

/**
 * Characterization + regression tests for the Neraca Saldo (trial balance)
 * aggregation. The key invariant: Σ debit == Σ credit when every journal entry
 * is balanced.
 *
 * Regression target: column placement is by the SIGN of the net balance, NOT by
 * account type. A previous bug branched on account type and flipped credit-normal
 * accounts (LIABILITY/EQUITY/REVENUE) into the wrong column, which made the
 * totals never balance whenever any such account carried a balance.
 */

function acc(
  id: number,
  type: string,
  totalDebit: number,
  totalCredit: number
): TrialBalanceEntryInput {
  return { id, code: `${id}`.padStart(4, "0"), name: `Acc ${id}`, type, totalDebit, totalCredit }
}

describe("computeTrialBalance", () => {
  it("places a debit-normal account (ASSET) with net debit in the debit column", () => {
    const { lines } = computeTrialBalance([acc(1, "ASSET", 5000, 0)])
    expect(lines).toHaveLength(1)
    expect(lines[0].totalDebit).toBe(5000)
    expect(lines[0].totalCredit).toBe(0)
  })

  it("places a credit-normal account (LIABILITY) with net credit in the CREDIT column", () => {
    // Regression: previously this landed in the debit column due to a type-based flip.
    const { lines } = computeTrialBalance([acc(2, "LIABILITY", 0, 5000)])
    expect(lines).toHaveLength(1)
    expect(lines[0].totalCredit).toBe(5000)
    expect(lines[0].totalDebit).toBe(0)
  })

  it("places EQUITY and REVENUE credit balances in the credit column", () => {
    const { lines } = computeTrialBalance([
      acc(3, "EQUITY", 0, 10000),
      acc(4, "REVENUE", 0, 7500),
    ])
    expect(lines.find((l) => l.type === "EQUITY")!.totalCredit).toBe(10000)
    expect(lines.find((l) => l.type === "REVENUE")!.totalCredit).toBe(7500)
    expect(lines.every((l) => l.totalDebit === 0)).toBe(true)
  })

  it("balances Σdebit == Σkredit for a full balanced set of accounts", () => {
    // Cash 15000 D ; Equipment 5000 D ; Payable 8000 C ; Equity 5000 C ; Revenue 12000 C ; Expense 5000 D
    // Debits: 15000 + 5000 + 5000 = 25000 ; Credits: 8000 + 5000 + 12000 = 25000
    const { grandTotalDebit, grandTotalCredit, isBalanced } = computeTrialBalance([
      acc(1, "ASSET", 15000, 0),
      acc(2, "ASSET", 5000, 0),
      acc(3, "LIABILITY", 0, 8000),
      acc(4, "EQUITY", 0, 5000),
      acc(5, "REVENUE", 0, 12000),
      acc(6, "EXPENSE", 5000, 0),
    ])
    expect(grandTotalDebit).toBe(25000)
    expect(grandTotalCredit).toBe(25000)
    expect(isBalanced).toBe(true)
  })

  it("uses net balance when an account has both debit and credit postings", () => {
    // Cash with 10000 debit and 3000 credit nets to 7000 debit.
    const { lines } = computeTrialBalance([acc(1, "ASSET", 10000, 3000)])
    expect(lines[0].totalDebit).toBe(7000)
    expect(lines[0].totalCredit).toBe(0)
  })

  it("drops accounts whose net balance is zero", () => {
    const { lines } = computeTrialBalance([
      acc(1, "ASSET", 5000, 5000),
      acc(2, "ASSET", 1000, 0),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe(2)
  })

  it("classifies a contra-asset (ASSET with net credit) into the credit column by sign", () => {
    // Accumulated depreciation is an ASSET-typed account that carries a credit
    // balance; by sign it belongs in the credit column, and the TB still balances.
    const { lines } = computeTrialBalance([acc(1, "ASSET", 0, 2000)])
    expect(lines[0].totalCredit).toBe(2000)
    expect(lines[0].totalDebit).toBe(0)
  })
})
