/**
 * Pemuatan data untuk laporan **Perbedaan Penyusutan (akuntansi vs pajak)**.
 *
 * Membaca aset yang belum dilepas beserta kategorinya (tarif/umur akuntansi,
 * kelompok fiskal PMK 72/2023, metode fiskal tersimpan F-109-V) dan baris
 * tahun saldo fiskal terbekukan aset, plus jurnal aset POSTED-nya. Dasar
 * akuntansi = nilai buku JURNAL POSTED (`journalBookValue`, vonis
 * F-2026-10-22-062-V Putusan 1), bukan cache `currentValue`; aset legacy
 * tanpa jurnal perolehan memakai cache sebagai dasar baca laporan saja
 * (mutasi tetap dilarang memakainya — lihat cron/disposal). Aset dilepas
 * tidak diikutkan.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { journalBookValue, type AssetJournalInput } from "@/lib/finance/asset-book-value"
import type { FiscalYearRow } from "@/lib/finance/asset-fiscal-balance"
import {
  ASSET_ACQUISITION_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
} from "@/lib/reports/asset-journal"
import {
  buildDepreciationDifference,
  type DepreciationAssetInput,
  type DepreciationDifferenceResult,
} from "@/lib/reports/depreciation-difference"

export interface DepreciationDifferenceReport {
  report: DepreciationDifferenceResult
}

export interface AssetJournalBookRow {
  id: number
  code: string
  name: string
  categoryName: string | null
  purchaseDate: Date | null
  purchaseCost: number
  bookValue: number
  hasPostedBooks: boolean
  taxGroupCode: string | null
  taxTypeListed: boolean | null
  taxDjpDetermination: boolean
  /** Metode fiskal tersimpan kategori (F-109-V P1); null = belum dipilih. */
  fiscalMethod: string | null
  /** Baris tahun saldo fiskal terbekukan aset ini (F-109-V P4). */
  fiscalYearRows: FiscalYearRow[]
}

/**
 * Dasar bersama laporan aset berbasis jurnal POSTED (dipakai juga deferred-tax-data).
 * Tetap POSTED-saja (TASK-022): query terfilter referenceType aset; jurnal
 * lawan reversal ber-referenceType "Journal" tersaring keluar, jadi
 * memasukkan REVERSED akan menghitung asli tanpa lawannya.
 * Neto nol hanya untuk pasangan reversal satu tingkat.
 * TASK-025: reversal ganda ditolak di sumber (jurnal ber-referenceType
 * "Journal" tidak boleh di-reverse lagi), jadi batas satu tingkat ini
 * ditegakkan di jalur generik, bukan hanya diasumsikan.
 */
export async function loadAssetJournalBookRows(): Promise<AssetJournalBookRow[]> {
  const [assets, journals, settings] = await Promise.all([
    prisma.asset.findMany({
      where: { status: { not: "disposed" } },
      select: {
        id: true, code: true, name: true, purchaseDate: true, purchaseCost: true,
        category: { select: { name: true, taxGroupCode: true, taxTypeListed: true, taxDjpDetermination: true, fiscalMethod: true, assetAccountId: true, accumulatedDepreciationAccountId: true } },
        fiscalYearRows: { orderBy: { taxYear: "asc" } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.journal.findMany({
      where: { deletedAt: null, status: "POSTED", OR: [{ referenceType: ASSET_ACQUISITION_TYPE }, { referenceType: ASSET_DISPOSAL_TYPE }, { referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX } }] },
      select: { referenceType: true, referenceId: true, entries: { select: { accountId: true, debit: true, credit: true } } },
    }),
    prisma.systemSetting.findFirst({ select: { accumulatedDepreciationAccountId: true } }),
  ])
  const journalsByAsset = new Map<number, AssetJournalInput[]>()
  for (const journal of journals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const list: AssetJournalInput[] = journalsByAsset.get(journal.referenceId) ?? []
    list.push({ referenceType: journal.referenceType, lines: journal.entries.map((entry) => ({ accountId: entry.accountId, debit: entry.debit, credit: entry.credit })) })
    journalsByAsset.set(journal.referenceId, list)
  }
  const envAssetAccount = Number.parseInt(process.env.FIXED_ASSET_ACCOUNT_ID || "0") || null
  const envAccumAccount = Number.parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || null
  return assets.map((asset) => {
    const posted = journalBookValue(journalsByAsset.get(asset.id) ?? [], {
      fixedAssetAccountId: asset.category?.assetAccountId ?? envAssetAccount,
      accumulatedDepreciationAccountId: asset.category?.accumulatedDepreciationAccountId ?? settings?.accumulatedDepreciationAccountId ?? envAccumAccount,
    })
    return {
      id: asset.id, code: asset.code, name: asset.name,
      categoryName: asset.category?.name ?? null,
      purchaseDate: asset.purchaseDate ?? null,
      purchaseCost: Number(asset.purchaseCost),
      bookValue: posted.bookValue.toNumber(),
      hasPostedBooks: posted.hasAcquisitionJournal,
      taxGroupCode: asset.category?.taxGroupCode ?? null,
      taxTypeListed: asset.category?.taxTypeListed ?? null,
      taxDjpDetermination: asset.category?.taxDjpDetermination ?? false,
      fiscalMethod: asset.category?.fiscalMethod ?? null,
      fiscalYearRows: asset.fiscalYearRows.map(toFiscalYearRow),
    }
  })
}

/** Baris DB -> kontrak builder murni (snapshot apa adanya, P4). */
function toFiscalYearRow(row: {
  taxYear: number
  yearIndex: number
  openingBalance: { toString(): string } | number
  depreciation: { toString(): string } | number
  closingBalance: { toString(): string } | number
  method: string
  groupCode: string
  ratePercent: { toString(): string } | number
  source: string
}): FiscalYearRow {
  return {
    taxYear: row.taxYear,
    yearIndex: row.yearIndex,
    openingBalance: decimalOf(row.openingBalance),
    depreciation: decimalOf(row.depreciation),
    closingBalance: decimalOf(row.closingBalance),
    method: row.method,
    groupCode: row.groupCode,
    ratePercent: decimalOf(row.ratePercent),
    source: (row.source === "opening" || row.source === "estimasi-tahun-berjalan"
      ? row.source
      : "computed") as FiscalYearRow["source"],
  }
}

function decimalOf(value: { toString(): string } | number) {
  return new Prisma.Decimal(value.toString())
}

export async function loadDepreciationDifference(): Promise<DepreciationDifferenceReport> {
  // Query jurnal di bawah tetap POSTED-saja — alasan sama seperti
  // loadAssetJournalBookRows (TASK-022).
  const [assets, journals, settings] = await Promise.all([
    prisma.asset.findMany({
      where: { status: { not: "disposed" } },
      select: {
        id: true,
        code: true,
        name: true,
        purchaseDate: true,
        purchaseCost: true,
        currentValue: true,
        residualValue: true,
        depreciationMethod: true,
        category: {
          select: {
            name: true,
            depreciationRate: true,
            usefulLife: true,
            taxDepreciationRate: true,
            taxUsefulLife: true,
            taxGroupCode: true,
            taxTypeListed: true,
            taxDjpDetermination: true,
            fiscalMethod: true,
            assetAccountId: true,
            accumulatedDepreciationAccountId: true,
          },
        },
        fiscalYearRows: { orderBy: { taxYear: "asc" } },
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

  const inputs: DepreciationAssetInput[] = assets.map((asset) => {
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
      // Dasar jurnal; legacy belum-berjurnal jatuh ke cache hanya untuk
      // keterbacaan laporan (bukan dasar mutasi GL).
      bookValue: posted.hasAcquisitionJournal
        ? posted.bookValue.toNumber()
        : Number(asset.currentValue),
      residualValue: Number(asset.residualValue),
      depreciationMethod: asset.depreciationMethod,
      categoryDepreciationRate: asset.category?.depreciationRate
        ? Number(asset.category.depreciationRate)
        : null,
      categoryUsefulLife: asset.category?.usefulLife ?? null,
      taxDepreciationRate: asset.category?.taxDepreciationRate
        ? Number(asset.category.taxDepreciationRate)
        : null,
      taxUsefulLife: asset.category?.taxUsefulLife ?? null,
      taxGroupCode: asset.category?.taxGroupCode ?? null,
      taxTypeListed: asset.category?.taxTypeListed ?? null,
      taxDjpDetermination: asset.category?.taxDjpDetermination ?? false,
      fiscalMethod: asset.category?.fiscalMethod ?? null,
      purchaseDate: asset.purchaseDate ?? null,
      fiscalYearRows: asset.fiscalYearRows.map(toFiscalYearRow),
    }
  })

  return { report: buildDepreciationDifference(inputs) }
}
