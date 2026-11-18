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
  /** Akun kontra akumulasi penurunan nilai (opsional; wajib bila impairment > 0). */
  accumImpairment?: number
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
  /** Kontra impairment POSTED yang ikut dibalik (Dr) saat pelepasan. */
  accumulatedImpairment?: number
}

/**
 * Build the balanced set of disposal journal entries. Throws if the result is
 * not balanced (defense-in-depth: the caller writes journal rows directly,
 * bypassing JournalService's own balance validation).
 */
export function buildAssetDisposalEntries(params: BuildAssetDisposalParams): AssetDisposalEntry[] {
  const { grossCost, bookValue, proceeds, assetName, accounts } = params
  const accumulatedImpairment = params.accumulatedImpairment ?? 0
  if (accumulatedImpairment > 0 && !accounts.accumImpairment) {
    throw new Error("Akun akumulasi penurunan nilai belum dipetakan untuk membalik impairment saat pelepasan aset.")
  }

  const toSen = (n: number) => Math.round(n * 100)
  const grossSen = toSen(grossCost)
  const bookSen = toSen(bookValue)
  const impairmentSen = toSen(accumulatedImpairment)
  const proceedsSen = toSen(proceeds)
  if (
    !Number.isFinite(grossSen) ||
    !Number.isFinite(bookSen) ||
    !Number.isFinite(impairmentSen) ||
    !Number.isFinite(proceedsSen)
  ) {
    throw new Error("Nominal pelepasan aset tidak valid.")
  }

  // bookValue sudah neto impairment, jadi gross − book = penyusutan + impairment.
  // Hitung seluruh kaki dalam bilangan bulat sen agar pembulatan independen tidak menimbulkan selisih debit/kredit.
  const accumDepSen = grossSen - bookSen - impairmentSen
  const gainLossSen = proceedsSen - bookSen

  const entries: AssetDisposalEntry[] = []

  if (proceedsSen > 0) {
    entries.push({ accountId: accounts.cashBank, debit: proceedsSen / 100, credit: 0, memo: `Hasil pelepasan - ${assetName}` })
  }
  if (accumDepSen > 0) {
    entries.push({ accountId: accounts.accumDep, debit: accumDepSen / 100, credit: 0, memo: `Penghapusan akumulasi penyusutan - ${assetName}` })
  }
  if (impairmentSen > 0) {
    entries.push({ accountId: accounts.accumImpairment!, debit: impairmentSen / 100, credit: 0, memo: `Penghapusan akumulasi penurunan nilai - ${assetName}` })
  }
  // Remove the asset at gross cost.
  entries.push({ accountId: accounts.fixedAsset, debit: 0, credit: grossSen / 100, memo: `Penghapusan aset tetap - ${assetName}` })
  // Residual gain (credit) or loss (debit).
  if (gainLossSen > 0) {
    entries.push({ accountId: accounts.gainLoss, debit: 0, credit: gainLossSen / 100, memo: `Laba pelepasan - ${assetName}` })
  } else if (gainLossSen < 0) {
    entries.push({ accountId: accounts.gainLoss, debit: -gainLossSen / 100, credit: 0, memo: `Rugi pelepasan - ${assetName}` })
  }

  const totalDebitSen = entries.reduce((s, e) => s + Math.round(e.debit * 100), 0)
  const totalCreditSen = entries.reduce((s, e) => s + Math.round(e.credit * 100), 0)
  if (totalDebitSen !== totalCreditSen) {
    throw new Error(`Jurnal pelepasan aset tidak balance: D=${totalDebitSen / 100} K=${totalCreditSen / 100}`)
  }

  return entries
}
