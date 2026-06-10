/**
 * Pure helpers for asset-disposal GL entry construction.
 *
 * Extracted from disposeAsset so the double-entry math can be unit-tested in
 * isolation across every branch (gain / loss / break-even / zero-proceeds)
 * without a database. The server action wraps these plain numbers in
 * Prisma.Decimal and persists them inside a transaction.
 *
 * Disposal reverses the full asset lifecycle in one balanced entry:
 *   Dr Cash/Bank        (proceeds, if any)
 *   Dr Accumulated Dep. (depreciation booked to date)
 *   Cr Fixed Asset      (gross acquisition cost)
 *   Dr/Cr Gain/Loss     (residual: proceeds - book value)
 */

export interface AssetDisposalAccounts {
  fixedAsset: number
  cashBank: number
  accumDep: number
  gainLoss: number
}

export interface AssetDisposalEntry {
  accountId: number
  debit: number
  credit: number
  memo: string
}

export interface BuildAssetDisposalParams {
  grossCost: number
  bookValue: number
  proceeds: number
  assetName: string
  accounts: AssetDisposalAccounts
}

/**
 * Build the balanced set of disposal journal entries. Throws if the result is
 * not balanced (defense-in-depth: the caller writes journal rows directly,
 * bypassing JournalService's own balance validation).
 */
export function buildAssetDisposalEntries(params: BuildAssetDisposalParams): AssetDisposalEntry[] {
  const { grossCost, bookValue, proceeds, assetName, accounts } = params

  const accumulatedDep = grossCost - bookValue // depreciation booked so far
  const gainLoss = proceeds - bookValue // positive = gain, negative = loss
  const round = (n: number) => Math.round(n * 100) / 100

  const entries: AssetDisposalEntry[] = []

  if (proceeds > 0) {
    entries.push({ accountId: accounts.cashBank, debit: round(proceeds), credit: 0, memo: `Hasil pelepasan - ${assetName}` })
  }
  if (accumulatedDep > 0) {
    entries.push({ accountId: accounts.accumDep, debit: round(accumulatedDep), credit: 0, memo: `Penghapusan akumulasi penyusutan - ${assetName}` })
  }
  // Remove the asset at gross cost.
  entries.push({ accountId: accounts.fixedAsset, debit: 0, credit: round(grossCost), memo: `Penghapusan aset tetap - ${assetName}` })
  // Residual gain (credit) or loss (debit).
  if (gainLoss > 0) {
    entries.push({ accountId: accounts.gainLoss, debit: 0, credit: round(gainLoss), memo: `Laba pelepasan - ${assetName}` })
  } else if (gainLoss < 0) {
    entries.push({ accountId: accounts.gainLoss, debit: round(-gainLoss), credit: 0, memo: `Rugi pelepasan - ${assetName}` })
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Jurnal pelepasan aset tidak balance: D=${totalDebit} K=${totalCredit}`)
  }

  return entries
}
