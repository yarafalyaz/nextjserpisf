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
  /** ASSET_ACQUISITION | ASSET_DISPOSAL | ASSET_DEPRECIATION_YYYYMM | ASSET_CHANGE_EVENT */
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

/**
 * Neto (debit − kredit) satu akun atas jurnal PERISTIWA (ASSET_CHANGE_EVENT
 * POSTED). Peristiwa menulis akun yang sama dari dua arah berlawanan
 * (revaluasi naik: Dr aset/Cr surplus, tutup akumulasi: Dr akumulasi;
 * penurunan: Cr aset), jadi total satu-arah ala sumOnAccount menyesatkan —
 * nilai buku wajib membaca NETO-nya. Konstanta referenceType ditulis literal
 * di sini supaya tak ada import antar modul finance.
 */
function sumEventNetOnAccount(journals: AssetJournalInput[], accountId: number | null): Prisma.Decimal {
  if (accountId == null) return new Prisma.Decimal(0)
  let total = new Prisma.Decimal(0)
  for (const journal of journals) {
    if (journal.referenceType !== "ASSET_CHANGE_EVENT") continue
    for (const line of journal.lines) {
      if (line.accountId !== accountId) continue
      total = total.add(dec(line.debit)).sub(dec(line.credit))
    }
  }
  return total
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
  /**
   * Bruto Aset Tetap termasuk neto peristiwa: Dr perolehan + neto
   * (debit−kredit) akun Aset Tetap pada jurnal ASSET_CHANGE_EVENT POSTED
   * (revaluasi/restatement/reklasifikasi masuk-keluar).
   */
  grossCostPosted: Prisma.Decimal
  /**
   * Akumulasi penyusutan termasuk neto peristiwa: Cr penyusutan − neto
   * debit akun Akumulasi Penyusutan pada jurnal peristiwa (revaluasi
   * menutup akumulasi lewat Dr, reklasifikasi memindahkannya).
   */
  accumulatedPosted: Prisma.Decimal
  /** Kredit Aset Tetap dari jurnal pelepasan POSTED. */
  disposalGrossPosted: Prisma.Decimal
  /**
   * grossCostPosted − accumulatedPosted − disposalGrossPosted −
   * accumulatedImpairmentPosted. Bila input tak memuat jurnal peristiwa,
   * suku peristiwa nol → angka persis seperti sebelum field ini ada.
   */
  bookValue: Prisma.Decimal
  /** Pernah ada jurnal perolehan POSTED (aset berjurnal vs legacy subledger-only). */
  hasAcquisitionJournal: boolean
  /**
   * Akumulasi penurunan nilai POSTED (kontra). Pemanggil memasok
   * `accumulatedImpairmentAccountId` pada `accounts` untuk membacanya dari
   * jurnal peristiwa; tanpa itu nilainya 0 dan bookValue tak membedakan
   * kontra impairment (lapisan kedua, mengikuti service loadPostedFacts).
   */
  accumulatedImpairmentPosted: Prisma.Decimal
}

/**
 * Nilai buku jurnal satu aset. Aset tanpa jurnal perolehan = `bookValue` 0
 * dan `hasAcquisitionJournal` false (temuan rekonsiliasi "belum berjurnal",
 * bukan angka yang boleh dipakai mutasi GL).
 *
 * Jurnal peristiwa (ASSET_CHANGE_EVENT) hanya ikut BILA pemanggil memuatnya
 * ke `journals` — fungsi ini murni atas input yang diberi. Service peristiwa
 * (loadPostedFacts) sudah memasukkan jurnal event lampau untuk peristiwa
 * berikutnya; pembaca lain (cron, disposal, laporan) wajib memuatnya juga,
 * kalau tidak nilai buku membeku di angka pra-peristiwa.
 */
export function journalBookValue(
  journals: AssetJournalInput[],
  accounts: AssetCategoryAccounts & { accumulatedImpairmentAccountId?: number | null },
): JournalBookValue {
  const grossCostPosted = sumOnAccount(journals, "acquisition", accounts.fixedAssetAccountId, "debit").add(
    sumEventNetOnAccount(journals, accounts.fixedAssetAccountId),
  )
  const accumulatedPosted = sumOnAccount(
    journals,
    "depreciation",
    accounts.accumulatedDepreciationAccountId,
    "credit",
  ).sub(sumEventNetOnAccount(journals, accounts.accumulatedDepreciationAccountId))
  const disposalGrossPosted = sumOnAccount(journals, "disposal", accounts.fixedAssetAccountId, "credit")
  // Kontra impairment: neto kredit peristiwa pada akun akumulasi penurunan
  // nilai (ASSET_ACQUISITION/DISPOSAL/DEPRECIATION tak pernah menyentuhnya).
  const accumulatedImpairmentPosted = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    sumEventNetOnAccount(journals, accounts.accumulatedImpairmentAccountId ?? null).negated(),
  )
  return {
    grossCostPosted,
    accumulatedPosted,
    disposalGrossPosted,
    bookValue: grossCostPosted
      .sub(accumulatedPosted)
      .sub(disposalGrossPosted)
      .sub(accumulatedImpairmentPosted),
    hasAcquisitionJournal: journals.some((j) => j.referenceType === "ASSET_ACQUISITION"),
    accumulatedImpairmentPosted,
  }
}
