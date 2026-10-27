/**
 * Data laporan aset tetap (registry, mutasi, disposisi) untuk halaman dan PDF —
 * satu sumber, sehingga angka di layar dan di PDF tidak mungkin berbeda.
 *
 * Riwayat aset dibatasi sampai `historyUntil` milik laporan: registry hanya butuh
 * riwayat sampai tanggal posisi, mutasi/disposisi sampai akhir periode. Tanpa
 * batas itu, laporan bulan ini ikut menarik seluruh riwayat penyusutan bertahun-
 * tahun — mahal dan tidak terpakai.
 */

import { prisma } from "@/lib/db/prisma"
import { buildAssetRegister, type AssetRegisterResult } from "@/lib/reports/asset-register"
import { buildAssetMovement, type AssetMovementResult } from "@/lib/reports/asset-movement"
import {
  buildAssetDisposals,
  type AssetDisposalReportResult,
} from "@/lib/reports/asset-disposal-schedule"
import { buildAssetHistory, type AssetHistoryResult } from "@/lib/reports/asset-history"
import {
  buildAssetJournal,
  ASSET_ACQUISITION_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
  type AssetJournalResult,
} from "@/lib/reports/asset-journal"
import { asOfLabelOf } from "@/lib/reports/statement-data"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import type { AssetLedgerAsset, AssetLedgerEntry } from "@/lib/reports/asset-ledger"

interface AssetLedger {
  assets: AssetLedgerAsset[]
  entries: AssetLedgerEntry[]
}

async function loadAssetLedger(historyUntil: Date): Promise<AssetLedger> {
  const [assets, entries] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        purchaseDate: true,
        purchaseCost: true,
        status: true,
        category: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.assetHistory.findMany({
      where: { date: { lte: historyUntil } },
      select: { assetId: true, type: true, amount: true, date: true },
      orderBy: { date: "asc" },
    }),
  ])

  return {
    assets: assets.map((asset) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      categoryName: asset.category?.name ?? null,
      purchaseDate: asset.purchaseDate,
      purchaseCost: Number(asset.purchaseCost),
      status: asset.status,
    })),
    entries: entries.map((entry) => ({
      assetId: entry.assetId,
      type: entry.type,
      amount: Number(entry.amount ?? 0),
      date: entry.date,
    })),
  }
}

export interface AssetRegisterReport {
  register: AssetRegisterResult
  /** Tanggal posisi, mis. "13 Oktober 2026". */
  asOfLabel: string
  periodLabel: string
  periodCaption: string
}

/** Posisi aset per tanggal (lihat `asset-register.ts` untuk aturan akumulasi). */
export async function loadAssetRegister(
  asOfDate: Date,
  includeDisposed: boolean,
): Promise<AssetRegisterReport> {
  const ledger = await loadAssetLedger(asOfDate)
  const asOfLabel = asOfLabelOf(asOfDate)

  return {
    register: buildAssetRegister({
      assets: ledger.assets,
      entries: ledger.entries,
      asOf: asOfDate,
      includeDisposed,
    }),
    asOfLabel,
    periodLabel: `Per ${asOfLabel}`,
    periodCaption: `Per ${asOfLabel}`,
  }
}

export interface AssetMovementReport {
  movement: AssetMovementResult
  periodLabel: string
  periodCaption: string
}

/** Mutasi aset (saldo awal → penambahan → penyusutan → pelepasan → saldo akhir). */
export async function loadAssetMovement(period: {
  start: Date
  end: Date
}): Promise<AssetMovementReport> {
  const ledger = await loadAssetLedger(period.end)
  const short = (date: Date) =>
    date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })

  return {
    movement: buildAssetMovement({ ...ledger, start: period.start, end: period.end }),
    periodLabel: `Periode ${short(period.start)} – ${short(period.end)}`,
    periodCaption: `Periode ${short(period.start)} – ${short(period.end)}`,
  }
}

export interface AssetDisposalReport {
  disposal: AssetDisposalReportResult
  periodLabel: string
  periodCaption: string
}

export interface AssetHistoryReport {
  history: AssetHistoryResult
  periodLabel: string
  periodCaption: string
}

/**
 * Garis waktu aset tetap pada satu periode: perolehan, penyusutan, pelepasan, dan
 * perpindahan lokasi. Riwayat dan transfer dibaca dalam rentang periode itu saja
 * (bukan seluruh riwayat) — kolom tanggalnya sudah berindeks, dan laporan yang
 * menarik riwayat bertahun-tahun untuk satu bulan hanya membebani database.
 */
export async function loadAssetHistory(period: {
  start: Date
  end: Date
}): Promise<AssetHistoryReport> {
  const [assets, history, transfers] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        location: true,
        purchaseDate: true,
        purchaseCost: true,
        category: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.assetHistory.findMany({
      where: { date: { gte: period.start, lte: period.end } },
      select: { assetId: true, type: true, description: true, amount: true, date: true },
      orderBy: { date: "asc" },
    }),
    prisma.assetTransfer.findMany({
      where: { transferDate: { gte: period.start, lte: period.end } },
      select: {
        assetId: true,
        fromLocation: true,
        toLocation: true,
        fromEmployeeId: true,
        toEmployeeId: true,
        transferDate: true,
      },
    }),
  ])

  // AssetTransfer hanya menyimpan id karyawan (tanpa relasi), jadi namanya
  // diambil sekali untuk semua baris — bukan satu query per transfer.
  const employeeIds = [
    ...new Set(
      transfers
        .flatMap((transfer) => [transfer.fromEmployeeId, transfer.toEmployeeId])
        .filter((id): id is number => id !== null),
    ),
  ]
  const employees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, name: true },
      })
    : []
  const employeeName = new Map(employees.map((employee) => [employee.id, employee.name]))

  return {
    history: buildAssetHistory({
      assets: assets.map((asset) => ({
        id: asset.id,
        code: asset.code,
        name: asset.name,
        categoryName: asset.category?.name ?? null,
        location: asset.location,
        purchaseDate: asset.purchaseDate,
        purchaseCost: Number(asset.purchaseCost),
      })),
      history: history.map((entry) => ({
        assetId: entry.assetId,
        type: entry.type,
        description: entry.description,
        amount: Number(entry.amount ?? 0),
        date: entry.date,
      })),
      transfers: transfers.map((transfer) => ({
        assetId: transfer.assetId,
        fromLocation: transfer.fromLocation,
        toLocation: transfer.toLocation,
        fromEmployeeName:
          transfer.fromEmployeeId !== null ? (employeeName.get(transfer.fromEmployeeId) ?? null) : null,
        toEmployeeName:
          transfer.toEmployeeId !== null ? (employeeName.get(transfer.toEmployeeId) ?? null) : null,
        date: transfer.transferDate,
      })),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}

export interface AssetJournalReport {
  journal: AssetJournalResult
  periodLabel: string
  periodCaption: string
}

/**
 * Jurnal aset tetap: perolehan, penyusutan bulanan, dan pelepasan.
 *
 * Hanya jurnal berstatus POSTED yang ditampilkan — jurnal draft belum mengubah
 * buku besar, jadi menampilkannya di laporan jurnal akan membuat laporan ini
 * tidak sama dengan buku besar. Penyaring penyusutan memakai AWALAN
 * `ASSET_DEPRECIATION_` karena referenceType-nya memuat periode; lihat komentar
 * di `asset-journal.ts`.
 */
export async function loadAssetJournal(period: {
  start: Date
  end: Date
}): Promise<AssetJournalReport> {
  // Tetap POSTED-saja (TASK-022): terfilter referenceType aset; jurnal
  // lawan reversal ber-referenceType "Journal" tersaring keluar, jadi
  // memasukkan REVERSED akan menghitung asli tanpa lawannya.
  // Neto nol hanya untuk pasangan reversal satu tingkat.
  const journals = await prisma.journal.findMany({
    where: {
      deletedAt: null,
      status: "POSTED",
      transactionDate: { gte: period.start, lte: period.end },
      OR: [
        { referenceType: ASSET_ACQUISITION_TYPE },
        { referenceType: ASSET_DISPOSAL_TYPE },
        { referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX } },
      ],
    },
    select: {
      id: true,
      journalNumber: true,
      transactionDate: true,
      referenceType: true,
      referenceId: true,
      description: true,
      entries: {
        select: { debit: true, credit: true, account: { select: { code: true, name: true } } },
      },
    },
    orderBy: { transactionDate: "asc" },
  })

  const assetIds = [
    ...new Set(
      journals.map((journal) => journal.referenceId).filter((id): id is number => id !== null),
    ),
  ]
  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, code: true, name: true },
      })
    : []

  return {
    journal: buildAssetJournal({
      journals: journals.map((journal) => ({
        id: journal.id,
        journalNumber: journal.journalNumber,
        date: journal.transactionDate,
        referenceType: journal.referenceType ?? "",
        referenceId: journal.referenceId,
        description: journal.description,
        lines: journal.entries.map((entry) => ({
          accountCode: entry.account.code,
          accountName: entry.account.name,
          debit: Number(entry.debit),
          credit: Number(entry.credit),
        })),
      })),
      assets: new Map(assets.map((asset) => [asset.id, { code: asset.code, name: asset.name }])),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}

/** Aset yang dilepas pada satu periode, beserta hasil dan laba/ruginya. */
export async function loadAssetDisposals(period: {
  start: Date
  end: Date
}): Promise<AssetDisposalReport> {
  const ledger = await loadAssetLedger(period.end)
  const short = (date: Date) =>
    date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })

  return {
    disposal: buildAssetDisposals({ ...ledger, start: period.start, end: period.end }),
    periodLabel: `Periode ${short(period.start)} – ${short(period.end)}`,
    periodCaption: `Periode ${short(period.start)} – ${short(period.end)}`,
  }
}
