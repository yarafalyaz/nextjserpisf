/**
 * Nilai buku aset dari jurnal POSTED — vonis BOT 4 F-2026-10-22-062-V Putusan 1.
 *
 * Sumber nilai buku TUNGGAL = jurnal POSTED (status POSTED, belum terhapus):
 *   nilai buku = debit akun Aset Tetap pada jurnal perolehan
 *              − kredit akun Akumulasi Penyusutan pada jurnal penyusutan
 *              − kredit akun Aset Tetap pada jurnal pelepasan.
 * `Asset.currentValue` dan Σ `AssetHistory type=depreciation` adalah CACHE
 * turunan; rekonsiliasi membandingkannya ke angka jurnal ini, tidak pernah
 * sebaliknya. Mutasi (penyusutan berikut, disposal) wajib memakai dasar ini.
 *
 * Baris jurnal di sini sudah disaring pemanggil (hanya jurnal aset POSTED
 * milik aset ini, per akun kategori aset itu). Pure (tanpa Prisma/DOM);
 * uang Decimal presisi schema Decimal(15,2).
 */

import { Prisma } from "@prisma/client"

export interface AssetJournalLineInput {
  accountId: number
  debit: Prisma.Decimal | number | string
  credit: Prisma.Decimal | number | string
}

export interface AssetJournalInput {
  /** ASSET_ACQUISITION | ASSET_DISPOSAL | ASSET_DEPRECIATION_YYYYMM */
  referenceType: string
  lines: AssetJournalLineInput[]
}

export interface AssetCategoryAccounts {
  fixedAssetAccountId: number | null
  accumulatedDepreciationAccountId: number | null
}

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

function sumOnAccount(
  journals: AssetJournalInput[],
  referenceKind: "acquisition" | "depreciation" | "disposal",
  accountId: number | null,
  side: "debit" | "credit",
): Prisma.Decimal {
  if (accountId == null) return new Prisma.Decimal(0)
  let total = new Prisma.Decimal(0)
  for (const journal of journals) {
    const kind =
      journal.referenceType === "ASSET_ACQUISITION"
        ? "acquisition"
        : journal.referenceType === "ASSET_DISPOSAL"
          ? "disposal"
          : journal.referenceType.startsWith("ASSET_DEPRECIATION_")
            ? "depreciation"
            : null
    if (kind !== referenceKind) continue
    for (const line of journal.lines) {
      if (line.accountId !== accountId) continue
      total = total.add(dec(side === "debit" ? line.debit : line.credit))
    }
  }
  return total
}

export interface JournalBookValue {
  /** Debit Aset Tetap dari jurnal perolehan POSTED. */
  grossCostPosted: Prisma.Decimal
  /** Kredit Akumulasi Penyusutan dari jurnal penyusutan POSTED. */
  accumulatedPosted: Prisma.Decimal
  /** Kredit Aset Tetap dari jurnal pelepasan POSTED. */
  disposalGrossPosted: Prisma.Decimal
  /** grossCostPosted − accumulatedPosted − disposalGrossPosted. */
  bookValue: Prisma.Decimal
  /** Pernah ada jurnal perolehan POSTED (aset berjurnal vs legacy subledger-only). */
  hasAcquisitionJournal: boolean
}

/**
 * Nilai buku jurnal satu aset. Aset tanpa jurnal perolehan = `bookValue` 0
 * dan `hasAcquisitionJournal` false (temuan rekonsiliasi "belum berjurnal",
 * bukan angka yang boleh dipakai mutasi GL).
 */
export function journalBookValue(
  journals: AssetJournalInput[],
  accounts: AssetCategoryAccounts,
): JournalBookValue {
  const grossCostPosted = sumOnAccount(journals, "acquisition", accounts.fixedAssetAccountId, "debit")
  const accumulatedPosted = sumOnAccount(journals, "depreciation", accounts.accumulatedDepreciationAccountId, "credit")
  const disposalGrossPosted = sumOnAccount(journals, "disposal", accounts.fixedAssetAccountId, "credit")
  return {
    grossCostPosted,
    accumulatedPosted,
    disposalGrossPosted,
    bookValue: grossCostPosted.sub(accumulatedPosted).sub(disposalGrossPosted),
    hasAcquisitionJournal: journals.some((j) => j.referenceType === "ASSET_ACQUISITION"),
  }
}
