/**
 * Pure balance-sheet aggregation, extracted from the Neraca report page
 * (`src/app/(dashboard)/laporan/neraca/page.tsx`) so the accounting identity
 * (Assets = Liabilities + Equity, with current-period net income rolled into
 * equity) can be unit-tested without standing up Prisma.
 *
 * Normal-balance convention:
 *   - ASSET, EXPENSE  -> debit-normal  (balance = debit - credit)
 *   - LIABILITY, EQUITY, REVENUE -> credit-normal (balance = credit - debit)
 *
 * Net income = Revenue - Expense, both expressed as positive magnitudes via the
 * convention above, so the identity closes.
 */

export interface BalanceSheetEntryInput {
  accountId: number
  accountName: string
  accountCode: string
  accountType: string
  debit: number
  credit: number
}

export interface BalanceSheetLine {
  name: string
  code: string
  balance: number
}

export interface BalanceSheetResult {
  assets: BalanceSheetLine[]
  liabilities: BalanceSheetLine[]
  equity: BalanceSheetLine[]
  netIncome: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  isBalanced: boolean
}

function isDebitNormal(type: string): boolean {
  return type === "ASSET" || type === "EXPENSE"
}

export function computeBalanceSheet(
  entries: BalanceSheetEntryInput[]
): BalanceSheetResult {
  // Aggregate each account to its normal-balance signed total.
  const accountBalances = new Map<
    number,
    { name: string; code: string; type: string; balance: number }
  >()

  for (const entry of entries) {
    const existing =
      accountBalances.get(entry.accountId) ?? {
        name: entry.accountName,
        code: entry.accountCode,
        type: entry.accountType,
        balance: 0,
      }
    // Debit-normal accounts (ASSET, EXPENSE) carry positive debit balances;
    // credit-normal accounts (LIABILITY, EQUITY, REVENUE) carry positive credit
    // balances. Using the natural sign per type keeps net income and the
    // balancing identity correct.
    if (isDebitNormal(entry.accountType)) {
      existing.balance += Number(entry.debit) - Number(entry.credit)
    } else {
      existing.balance += Number(entry.credit) - Number(entry.debit)
    }
    accountBalances.set(entry.accountId, existing)
  }

  const assets: BalanceSheetLine[] = []
  const liabilities: BalanceSheetLine[] = []
  const equity: BalanceSheetLine[] = []

  let revenueTotal = 0
  let expenseTotal = 0

  for (const [, acc] of accountBalances) {
    if (acc.balance === 0) continue
    const item = { name: acc.name, code: acc.code, balance: acc.balance }
    if (acc.type === "ASSET") assets.push(item)
    else if (acc.type === "LIABILITY") liabilities.push(item)
    else if (acc.type === "EQUITY") equity.push(item)
    else if (acc.type === "REVENUE") revenueTotal += acc.balance
    else if (acc.type === "EXPENSE") expenseTotal += acc.balance
  }

  // Both totals are positive magnitudes (revenue credit-normal, expense
  // debit-normal), so net income is a straight subtraction.
  const netIncome = revenueTotal - expenseTotal
  if (Math.abs(netIncome) >= 0.01) {
    equity.push({ name: "Laba/Rugi Berjalan", code: "NI", balance: netIncome })
  }

  assets.sort((a, b) => a.code.localeCompare(b.code))
  liabilities.sort((a, b) => a.code.localeCompare(b.code))
  equity.sort((a, b) => a.code.localeCompare(b.code))

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0)
  const isBalanced = Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01

  return {
    assets,
    liabilities,
    equity,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced,
  }
}
