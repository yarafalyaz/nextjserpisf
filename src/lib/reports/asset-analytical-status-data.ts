/**
 * Loader status analitis aset — vonis BOT 4 F-2026-10-23-118-V Putusan 2.
 *
 * Mengembalikan status per aset untuk satu masa dari
 * `resolveAnalyticalAssetStatus`: computed / skip{at-residual,unit-nol,
 * held-for-sale,disposed,already-posted,not-started} /
 * reject{missing-parameter,unregistered-status}. Aset `disposed` tetap
 * tampil sebagai skip{disposed} (bukan disembunyikan, bukan computed). Dasar = nilai buku
 * jurnal POSTED (F-062-V Putusan 1); aset tanpa jurnal perolehan tampil
 * `notJournaled`, bukan angka karangan. Konsumen (BOT 2) menampilkan
 * apa adanya — tanpa hitung ulang, tanpa tombol posting analitis.
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { journalBookValue } from "@/lib/finance/asset-book-value"
import {
  resolveAnalyticalAssetStatus,
  type AnalyticalAssetStatus,
} from "@/lib/finance/asset-analytical-posting"
import { ANALYTICAL_DEPRECIATION_METHODS } from "@/lib/finance/asset-depreciation"
import {
  ASSET_ACQUISITION_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
} from "@/lib/reports/asset-journal"

export interface AssetAnalyticalStatusRow {
  assetId: number
  code: string
  name: string
  depreciationMethod: string
  status: AnalyticalAssetStatus
  /** Parameter terbekukan tampil apa adanya (null = belum dibekukan). */
  totalEstimatedUnits: Prisma.Decimal | null
  productionUnitName: string | null
  usefulLifeMonths: number | null
  /** Unit aktual dokumen masa ini; null = dokumen belum ada. */
  actualUnits: Prisma.Decimal | null
  actualSourceName: string | null
  bookValue: Prisma.Decimal
  /** Tanpa jurnal perolehan POSTED: status tidak boleh dipakai posting. */
  notJournaled: boolean
}

export interface AssetAnalyticalStatusReport {
  periodYear: number
  periodMonth: number
  rows: AssetAnalyticalStatusRow[]
}

export async function loadAssetAnalyticalStatuses(
  periodYear: number,
  periodMonth: number,
): Promise<AssetAnalyticalStatusReport> {
  const referenceType = `ASSET_DEPRECIATION_${periodYear}${String(periodMonth).padStart(2, "0")}`
  const methods = [...ANALYTICAL_DEPRECIATION_METHODS]

  const [assets, settings] = await Promise.all([
    prisma.asset.findMany({
      where: { depreciationMethod: { in: methods } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        depreciationMethod: true,
        purchaseDate: true,
        residualValue: true,
        totalEstimatedUnits: true,
        productionUnitName: true,
        usefulLifeMonths: true,
        category: {
          select: { assetAccountId: true, accumulatedDepreciationAccountId: true },
        },
        usageRecords: {
          where: { periodYear, periodMonth },
          select: { actualUnits: true, sourceName: true },
          take: 1,
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.systemSetting.findFirst({
      select: { accumulatedDepreciationAccountId: true },
    }),
  ])
  if (assets.length === 0) return { periodYear, periodMonth, rows: [] }

  const assetIds = assets.map((a) => a.id)
  // Tetap POSTED-saja (TASK-022): agregasi terfilter referenceType aset;
  // jurnal lawan reversal ber-referenceType "Journal" sehingga tersaring
  // keluar — memasukkan REVERSED akan menghitung asli tanpa lawannya.
  // POSTED-saja sudah neto nol untuk pasangan reversal satu tingkat.
  const journals = await prisma.journal.findMany({
    where: {
      referenceId: { in: assetIds },
      status: "POSTED",
      deletedAt: null,
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
  })
  const journalsByAsset = new Map<number, typeof journals>()
  for (const journal of journals) {
    if (journal.referenceId == null) continue
    const list = journalsByAsset.get(journal.referenceId) ?? []
    list.push(journal)
    journalsByAsset.set(journal.referenceId, list)
  }
  const postedThisPeriod = new Set(
    journals
      .filter((j) => j.referenceType === referenceType && j.referenceId != null)
      .map((j) => j.referenceId as number),
  )
  const envAssetAccount =
    Number.parseInt(process.env.FIXED_ASSET_ACCOUNT_ID || "0") || null
  const envAccumAccount =
    Number.parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || null

  const rows: AssetAnalyticalStatusRow[] = assets.map((asset) => {
    const fixedAssetAccountId = asset.category?.assetAccountId ?? envAssetAccount
    const accumulatedAccountId =
      asset.category?.accumulatedDepreciationAccountId ??
      settings?.accumulatedDepreciationAccountId ??
      envAccumAccount
    const posted = journalBookValue(
      (journalsByAsset.get(asset.id) ?? []).map((j) => ({
        referenceType: j.referenceType ?? "",
        lines: j.entries.map((e) => ({
          accountId: e.accountId,
          debit: e.debit,
          credit: e.credit,
        })),
      })),
      {
        fixedAssetAccountId: fixedAssetAccountId || null,
        accumulatedDepreciationAccountId: accumulatedAccountId || null,
      },
    )
    const usage = asset.usageRecords[0] ?? null
    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      depreciationMethod: asset.depreciationMethod,
      status: resolveAnalyticalAssetStatus({
        depreciationMethod: asset.depreciationMethod,
        status: asset.status,
        purchaseCost: posted.grossCostPosted,
        bookValue: posted.bookValue,
        residualValue: asset.residualValue,
        totalEstimatedUnits: asset.totalEstimatedUnits,
        usefulLifeMonths: asset.usefulLifeMonths,
        actualUnits: usage?.actualUnits ?? null,
        purchaseDate: asset.purchaseDate,
        periodYear,
        periodMonth,
        alreadyPosted: postedThisPeriod.has(asset.id),
      }),
      totalEstimatedUnits: asset.totalEstimatedUnits,
      productionUnitName: asset.productionUnitName,
      usefulLifeMonths: asset.usefulLifeMonths,
      actualUnits: usage?.actualUnits ?? null,
      actualSourceName: usage?.sourceName ?? null,
      bookValue: posted.bookValue,
      notJournaled: !posted.hasAcquisitionJournal,
    }
  })

  return { periodYear, periodMonth, rows }
}
