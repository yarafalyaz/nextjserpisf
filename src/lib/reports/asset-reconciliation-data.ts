/**
 * Pemuatan data rekonsiliasi tiga jalur aset tetap (vonis F-2026-10-22-062-V
 * Putusan 1): jurnal POSTED vs `Asset.currentValue` vs Σ AssetHistory.
 *
 * Hanya jurnal aset POSTED yang belum terhapus yang dibaca — DRAFT/deleted
 * tidak mengubah buku besar. Akun per aset diambil dari kategori aset itu,
 * pola resolusi yang sama dengan posting (kategori menimpa mapping global
 * menimpa env) supaya rekonsiliasi menilai akun yang benar-benar diposting.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildAssetReconciliation,
  type AssetReconciliationInput,
  type AssetReconciliationResult,
} from "@/lib/reports/asset-reconciliation"
import {
  ASSET_ACQUISITION_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
} from "@/lib/reports/asset-journal"

export interface AssetReconciliationReport {
  reconciliation: AssetReconciliationResult
}

export async function loadAssetReconciliation(): Promise<AssetReconciliationReport> {
  const [assets, historyTotals, journals, settings] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        purchaseCost: true,
        currentValue: true,
        status: true,
        category: {
          select: {
            name: true,
            assetAccountId: true,
            accumulatedDepreciationAccountId: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.assetHistory.groupBy({
      by: ["assetId"],
      where: { type: "depreciation" },
      _sum: { amount: true },
    }),
    // Tetap POSTED-saja (TASK-022): terfilter referenceType aset; jurnal
    // lawan reversal ber-referenceType "Journal" tersaring keluar, jadi
    // memasukkan REVERSED akan menghitung asli tanpa lawannya.
    // Neto nol hanya untuk pasangan reversal satu tingkat.
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

  const historyByAsset = new Map(
    historyTotals.map((row) => [row.assetId, row._sum.amount ?? 0]),
  )
  const journalsByAsset = new Map<number, AssetReconciliationInput["journals"]>()
  for (const journal of journals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const list = journalsByAsset.get(journal.referenceId) ?? []
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

  const inputs: AssetReconciliationInput[] = assets.map((asset) => ({
    assetId: asset.id,
    code: asset.code,
    name: asset.name,
    categoryName: asset.category?.name ?? null,
    purchaseCost: asset.purchaseCost,
    currentValue: asset.currentValue,
    historyDepreciationTotal: historyByAsset.get(asset.id) ?? 0,
    status: asset.status,
    categoryAccounts: {
      fixedAssetAccountId: asset.category?.assetAccountId ?? envAssetAccount,
      accumulatedDepreciationAccountId:
        asset.category?.accumulatedDepreciationAccountId ??
        settings?.accumulatedDepreciationAccountId ??
        envAccumAccount,
    },
    journals: journalsByAsset.get(asset.id) ?? [],
  }))

  return { reconciliation: buildAssetReconciliation(inputs) }
}
