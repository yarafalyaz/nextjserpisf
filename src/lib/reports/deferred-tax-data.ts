/**
 * Pemuatan data untuk laporan **Perbedaan Temporer Pajak Tangguhan (tahap stok)**.
 *
 * Mengikuti pola `depreciation-difference-data.ts`: membaca aset yang belum
 * dilepas beserta kategorinya (kelompok fiskal PMK 72/2023) dan jurnal aset
 * POSTED-nya. Nilai buku komersial = nilai buku JURNAL POSTED
 * (`journalBookValue`, vonis F-2026-10-22-062-V Putusan 1), bukan cache
 * `currentValue`; aset legacy tanpa jurnal perolehan POSTED dinyatakan
 * `hasPostedBooks: false` dan dikecualikan builder (bukan diberi angka nol).
 * Aset yang sudah dilepas tidak diikutkan.
 *
 * Tarif badan dan tanggal akhir tahun pajak dipasok pemanggil dari master
 * bertanggal efektif; builder menolak tarif tidak sah (F-2026-10-23-112-V
 * Putusan 3). Read-model ini tidak menulis jurnal apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import { journalBookValue, type AssetJournalInput } from "@/lib/finance/asset-book-value"
import {
  ASSET_ACQUISITION_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
} from "@/lib/reports/asset-journal"
import {
  buildDeferredTaxTemporaryDifference,
  DEFERRED_TAX_NOTICE,
  type DeferredTaxAssetInput,
  type DeferredTaxResult,
} from "@/lib/reports/deferred-tax"

export { DEFERRED_TAX_NOTICE }

export interface DeferredTaxReport {
  report: DeferredTaxResult
  notice: string
}

export async function loadDeferredTax(input: {
  /** Tarif badan persen dari master bertanggal efektif; null = belum dipasok. */
  taxRatePercent: number | null
  /** Tanggal akhir tahun pajak yang dinilai. */
  asOf: Date
}): Promise<DeferredTaxReport> {
  const [assets, journals, settings] = await Promise.all([
    prisma.asset.findMany({
      where: { status: { not: "disposed" } },
      select: {
        id: true,
        code: true,
        name: true,
        purchaseDate: true,
        purchaseCost: true,
        category: {
          select: {
            name: true,
            taxGroupCode: true,
            taxTypeListed: true,
            taxDjpDetermination: true,
            assetAccountId: true,
            accumulatedDepreciationAccountId: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.journal.findMany({
      where: {
        deletedAt: null,
        status: "POSTED",
        OR: [
          { referenceType: ASSET_ACQUISITION_TYPE },
          { referenceType: ASSET_DISPOSAL_TYPE },
          { referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX } },
        ],
      },
      select: {
        referenceType: true,
        referenceId: true,
        entries: { select: { accountId: true, debit: true, credit: true } },
      },
    }),
    prisma.systemSetting.findFirst({
      select: { accumulatedDepreciationAccountId: true },
    }),
  ])

  const journalsByAsset = new Map<number, AssetJournalInput[]>()
  for (const journal of journals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const list: AssetJournalInput[] = journalsByAsset.get(journal.referenceId) ?? []
    list.push({
      referenceType: journal.referenceType,
      lines: journal.entries.map((entry) => ({
        accountId: entry.accountId,
        debit: entry.debit,
        credit: entry.credit,
      })),
    })
    journalsByAsset.set(journal.referenceId, list)
  }
  const envAssetAccount = Number.parseInt(process.env.FIXED_ASSET_ACCOUNT_ID || "0") || null
  const envAccumAccount =
    Number.parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || null

  const inputs: DeferredTaxAssetInput[] = assets.map((asset) => {
    const posted = journalBookValue(journalsByAsset.get(asset.id) ?? [], {
      fixedAssetAccountId: asset.category?.assetAccountId ?? envAssetAccount,
      accumulatedDepreciationAccountId:
        asset.category?.accumulatedDepreciationAccountId ??
        settings?.accumulatedDepreciationAccountId ??
        envAccumAccount,
    })
    return {
      code: asset.code,
      name: asset.name,
      categoryName: asset.category?.name ?? null,
      purchaseCost: Number(asset.purchaseCost),
      bookValue: posted.bookValue.toNumber(),
      purchaseDate: asset.purchaseDate ?? null,
      taxGroupCode: asset.category?.taxGroupCode ?? null,
      taxTypeListed: asset.category?.taxTypeListed ?? null,
      taxDjpDetermination: asset.category?.taxDjpDetermination ?? false,
      hasPostedBooks: posted.hasAcquisitionJournal,
    }
  })

  const report = buildDeferredTaxTemporaryDifference({
    assets: inputs,
    taxRatePercent: input.taxRatePercent,
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
