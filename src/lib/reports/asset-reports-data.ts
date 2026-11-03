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
  ASSET_CHANGE_EVENT_TYPE,
  ASSET_DEPRECIATION_PREFIX,
  ASSET_DISPOSAL_TYPE,
  type AssetJournalResult,
} from "@/lib/reports/asset-journal"
import { asOfLabelOf } from "@/lib/reports/statement-data"
import { formatDayMonthYear } from "@/lib/utils/format"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import type {
  AssetLedgerAsset,
  AssetLedgerEntry,
  AssetLedgerJournal,
} from "@/lib/reports/asset-ledger"

interface AssetLedger {
  assets: AssetLedgerAsset[]
  entries: AssetLedgerEntry[]
  journals: AssetLedgerJournal[]
}

async function loadAssetLedger(historyUntil: Date): Promise<AssetLedger> {
  const [assets, entries, eventJournals, settings] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        purchaseDate: true,
        purchaseCost: true,
        status: true,
        category: {
          select: {
            name: true,
            assetAccountId: true,
            accumulatedDepreciationAccountId: true,
            accumulatedImpairmentAccountId: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.assetHistory.findMany({
      where: { date: { lte: historyUntil } },
      select: { assetId: true, type: true, amount: true, date: true },
      orderBy: { date: "asc" },
    }),
    // Jurnal peristiwa POSTED: revaluasi/impairment/reklasifikasi tidak
    // menulis AssetHistory, jadi register/mutasi/pelepasan wajib membacanya
    // dari jurnal (sumber nilai buku tunggal F-2026-10-22-062-V) — pola
    // query yang sama dengan rekonsiliasi. POSTED-saja (TASK-022).
    prisma.journal.findMany({
      where: {
        deletedAt: null,
        status: "POSTED",
        referenceType: ASSET_CHANGE_EVENT_TYPE,
        transactionDate: { lte: historyUntil },
      },
      select: {
        referenceType: true,
        referenceId: true,
        transactionDate: true,
        entries: { select: { accountId: true, debit: true, credit: true } },
      },
      orderBy: { transactionDate: "asc" },
    }),
    prisma.systemSetting.findFirst({
      select: { accumulatedDepreciationAccountId: true },
    }),
  ])

  const envAssetAccount = Number.parseInt(process.env.FIXED_ASSET_ACCOUNT_ID || "0") || null
  const envAccumAccount =
    Number.parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || null
  const accountsByAsset = new Map(
    assets.map((asset) => [
      asset.id,
      {
        fixedAssetAccountId: asset.category?.assetAccountId ?? envAssetAccount,
        accumulatedDepreciationAccountId:
          asset.category?.accumulatedDepreciationAccountId ??
          settings?.accumulatedDepreciationAccountId ??
          envAccumAccount,
        accumulatedImpairmentAccountId: asset.category?.accumulatedImpairmentAccountId ?? null,
      },
    ]),
  )

  // Himpunan akun peristiwa per aset dari jurnal peristiwa aset itu sendiri
  // (akun asal + tujuan reklasifikasi). Peran akun dibedakan dari akun
  // kategori berjalan; akun peristiwa lain (surplus, beban penurunan nilai,
  // utang pajak) tidak masuk himpunan mana pun dan tak memengaruhi delta.
  const assetEventAccountIds = new Map<
    number,
    { fixed: Set<number>; accumulated: Set<number>; impairment: Set<number> }
  >()
  for (const journal of eventJournals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const accounts = accountsByAsset.get(journal.referenceId)
    if (!accounts) continue
    let sets = assetEventAccountIds.get(journal.referenceId)
    if (!sets) {
      sets = { fixed: new Set(), accumulated: new Set(), impairment: new Set() }
      assetEventAccountIds.set(journal.referenceId, sets)
    }
    if (accounts.fixedAssetAccountId != null) sets.fixed.add(accounts.fixedAssetAccountId)
    if (accounts.accumulatedDepreciationAccountId != null) {
      sets.accumulated.add(accounts.accumulatedDepreciationAccountId)
    }
    if (accounts.accumulatedImpairmentAccountId != null) {
      sets.impairment.add(accounts.accumulatedImpairmentAccountId)
    }
  }

  // Akun asal reklasifikasi tak dikenal dari kategori berjalan. Ia dikenali
  // dari pola pasangan jurnal reklasifikasi itu sendiri: bruto berpasangan
  // Dr akun-baru / Cr akun-lama dan akumulasi berpasangan terbalik, selalu
  // dalam jurnal yang sama. Kaki asing yang berpasangan (jumlah neto lawan
  // persis) dengan akun berjalan mewarisi peran akun berjalan itu; akun
  // peristiwa lain (surplus, beban penurunan nilai, utang pajak) tak pernah
  // berpasangan sebesar itu dengan akun berjalan sehingga tak terklasifikasi.
  for (const journal of eventJournals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const sets = assetEventAccountIds.get(journal.referenceId)
    if (!sets) continue
    const classifyForeign = (line: { accountId: number; debit: unknown; credit: unknown }) => {
      if (
        sets.fixed.has(line.accountId) ||
        sets.accumulated.has(line.accountId) ||
        sets.impairment.has(line.accountId)
      ) {
        return
      }
      const net = Number(line.debit) - Number(line.credit)
      if (Math.abs(net) <= 0.005) return
      for (const partner of journal.entries) {
        if (partner.accountId === line.accountId) continue
        const partnerNet = Number(partner.debit) - Number(partner.credit)
        if (Math.abs(partnerNet + net) > 0.005) continue
        if (sets.fixed.has(partner.accountId)) sets.fixed.add(line.accountId)
        else if (sets.accumulated.has(partner.accountId)) sets.accumulated.add(line.accountId)
        else if (sets.impairment.has(partner.accountId)) sets.impairment.add(line.accountId)
        else continue
        break
      }
    }
    for (const line of journal.entries) classifyForeign(line)
  }

  const journals: AssetLedgerJournal[] = []
  for (const journal of eventJournals) {
    if (journal.referenceId == null || !journal.referenceType) continue
    const accounts = accountsByAsset.get(journal.referenceId)
    if (!accounts) continue
    // Putaran 101: delta neto WAJIB dihitung atas himpunan akun PERISTIWA aset
    // itu sendiri, bukan hanya akun kategori BERJALAN. Reklasifikasi menulis
    // Dr akun-baru / Cr akun-lama; membaca satu akun berjalan saja menghitung
    // kaki masuk tanpa kaki keluar, sehingga bruto + akumulasi terdobel
    // persis nilai buku saat reklasifikasi (register/mutasi/pelepasan tampil
    // 2x lipat). Kumpulan akun diambil dari baris jurnal aset ini sendiri:
    // reklasifikasi hanya menulis akun kategori asal/tujuan aset yang sama.
    const assetAccountIds = assetEventAccountIds.get(journal.referenceId)
    let grossDelta = 0
    let accumulatedNet = 0
    let impairmentNetCredit = 0
    for (const line of journal.entries) {
      const net = Number(line.debit) - Number(line.credit)
      if (assetAccountIds?.fixed.has(line.accountId)) grossDelta += net
      if (assetAccountIds?.accumulated.has(line.accountId)) accumulatedNet += net
      if (assetAccountIds?.impairment.has(line.accountId)) impairmentNetCredit += -net
    }
    journals.push({
      assetId: journal.referenceId,
      referenceType: journal.referenceType,
      date: journal.transactionDate,
      grossDelta,
      // Akumulasi tampil selalu >= 0: neto debit peristiwa mengurangi.
      accumulatedDelta: -accumulatedNet,
      impairmentDelta: Math.max(0, impairmentNetCredit),
    })
  }

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
    journals,
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
      journals: ledger.journals,
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
    formatDayMonthYear(date)

  return {
    movement: buildAssetMovement({
      assets: ledger.assets,
      entries: ledger.entries,
      journals: ledger.journals,
      start: period.start,
      end: period.end,
    }),
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
  // TASK-025: reversal ganda ditolak di sumber (jurnal ber-referenceType
  // "Journal" tidak boleh di-reverse lagi), jadi batas satu tingkat ini
  // ditegakkan di jalur generik, bukan hanya diasumsikan.
  const journals = await prisma.journal.findMany({
    where: {
      deletedAt: null,
      status: "POSTED",
      transactionDate: { gte: period.start, lte: period.end },
      OR: [
        { referenceType: ASSET_ACQUISITION_TYPE },
        { referenceType: ASSET_DISPOSAL_TYPE },
        { referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX } },
        { referenceType: ASSET_CHANGE_EVENT_TYPE },
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
    formatDayMonthYear(date)

  return {
    disposal: buildAssetDisposals({
      assets: ledger.assets,
      entries: ledger.entries,
      journals: ledger.journals,
      start: period.start,
      end: period.end,
    }),
    periodLabel: `Periode ${short(period.start)} – ${short(period.end)}`,
    periodCaption: `Periode ${short(period.start)} – ${short(period.end)}`,
  }
}
