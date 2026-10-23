import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import {
  computeMonthlyDepreciation,
  isAnalyticalDepreciationMethod,
  isRegisteredDepreciationMethod,
} from "@/lib/finance/asset-depreciation"
import { journalBookValue } from "@/lib/finance/asset-book-value"
import {
  resolveDepreciationAccounts,
  hasCompleteDepreciationAccounts,
} from "@/lib/finance/depreciation-accounts"
import { apiError } from "@/lib/api-response"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { DocumentSequenceService } from "@/lib/services/document-sequence.service"

/**
 * Cron: Run monthly asset depreciation for all active assets.
 * Schedule: 1st of every month at 01:00 (0 1 1 * *)
 *
 * Vonis BOT 4 F-2026-10-22-062-V yang dikunci di sini:
 *  - Dasar hitung = nilai buku JURNAL POSTED (Putusan 1), bukan cache
 *    `Asset.currentValue`. Aset tanpa jurnal perolehan (legacy subledger-only)
 *    tidak disusutkan GL; tampil sebagai error berisik "belum berjurnal".
 *  - Metode di luar daftar terdaftar ditolak Zod saat simpan dan ditolak lagi
 *    di sini; metode analitis NON-GL (`units_of_production`,
 *    `sum_of_years_digits`) ditolak berisik per aset, tanpa jurnal (Putusan 2).
 *  - Hitung Decimal, bulanan dibulatkan ke sen, bulan terakhir berhenti persis
 *    di residu (Putusan 4, di `computeMonthlyDepreciation`).
 *  - Satu jurnal per (aset, masa): unique (referenceType, referenceId) schema
 *    dengan referenceType `ASSET_DEPRECIATION_YYYYMM`; replay bulan sama =
 *    nol jurnal baru. `assertPeriodOpen` di dalam tx posting per aset.
 *  - Mulai penyusutan = bulan pengeluaran, bulan penuh, jurnal bertanggal
 *    awal masa (perilaku existing dipertahankan sebagai putusan).
 */
export async function GET(request: Request) {
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  try {
    const now = new Date()
    const month = now.getMonth() + 1 // 1-12
    const year = now.getFullYear()
    const periodEnd = new Date(year, month, 0) // Last day of current month
    const periodStart = new Date(year, month - 1, 1)
    const referenceType = `ASSET_DEPRECIATION_${year}${String(month).padStart(2, "0")}`

    const assets = await prisma.asset.findMany({
      where: {
        status: "active",
        purchaseDate: { lte: periodEnd },
        category: {
          OR: [{ depreciationRate: { gt: 0 } }, { usefulLife: { gt: 0 } }],
        },
      },
      include: { category: true },
    })

    let processed = 0
    let errors = 0
    let skipped = 0
    const errorDetails: string[] = []

    const settings = await prisma.systemSetting.findFirst({
      select: {
        depreciationExpenseAccountId: true,
        accumulatedDepreciationAccountId: true,
      },
    })
    const envAccount = (key: string) => Number.parseInt(process.env[key] || "0") || 0

    // Fast-fail awal periode tertutup; penjaga otoritatif tetap
    // `assertPeriodOpen(periodStart, tx)` di dalam tx tiap aset (Putusan 4).
    await assertPeriodOpen(periodStart)

    // Idempotensi dibaca dari JURNAL (sumber tunggal), bukan history cache:
    // aset yang jurnal masa ini sudah POSTED tidak diposting ulang.
    const assetIds = assets.map((a) => a.id)
    const [postedThisPeriod, postedJournals] = assetIds.length
      ? await Promise.all([
          prisma.journal.findMany({
            where: {
              referenceType,
              referenceId: { in: assetIds },
              status: "POSTED",
              deletedAt: null,
            },
            select: { referenceId: true },
          }),
          prisma.journal.findMany({
            where: {
              referenceId: { in: assetIds },
              status: "POSTED",
              deletedAt: null,
              OR: [
                { referenceType: "ASSET_ACQUISITION" },
                { referenceType: "ASSET_DISPOSAL" },
                { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
              ],
            },
            select: {
              referenceType: true,
              referenceId: true,
              entries: { select: { accountId: true, debit: true, credit: true } },
            },
          }),
        ])
      : [[], []]
    const depreciatedAssetIds = new Set(postedThisPeriod.map((r) => r.referenceId))
    const journalsByAsset = new Map<number, typeof postedJournals>()
    for (const journal of postedJournals) {
      if (journal.referenceId == null) continue
      const list = journalsByAsset.get(journal.referenceId) ?? []
      list.push(journal)
      journalsByAsset.set(journal.referenceId, list)
    }

    const toProcess: {
      asset: (typeof assets)[number]
      monthlyDepreciation: Prisma.Decimal
      newBookValue: Prisma.Decimal
      expenseAccountId: number
      accumulatedAccountId: number
    }[] = []
    let missingAccounts = 0
    let notJournaled = 0
    let rejectedMethods = 0

    for (const asset of assets) {
      const category = asset.category
      if (!category) continue
      if (depreciatedAssetIds.has(asset.id)) {
        skipped++
        continue
      }

      // Gerbang metode (Putusan 2): string tak terdaftar dan metode analitis
      // NON-GL ditolak berisik per aset — tidak jatuh diam-diam ke garis lurus.
      if (!isRegisteredDepreciationMethod(asset.depreciationMethod)) {
        rejectedMethods++
        errors++
        errorDetails.push(
          `Asset ${asset.id} (${asset.name}): metode penyusutan "${asset.depreciationMethod}" tidak terdaftar`,
        )
        continue
      }
      if (isAnalyticalDepreciationMethod(asset.depreciationMethod)) {
        rejectedMethods++
        errors++
        errorDetails.push(
          `Asset ${asset.id} (${asset.name}): metode ${asset.depreciationMethod} analitis NON-GL, tidak diposting jurnal`,
        )
        continue
      }

      const fixedAssetAccountId =
        category.assetAccountId ?? (envAccount("FIXED_ASSET_ACCOUNT_ID") || null)
      const accounts = resolveDepreciationAccounts({
        categoryExpenseAccountId: category.depreciationExpenseAccountId,
        categoryAccumDepAccountId: category.accumulatedDepreciationAccountId,
        settingsExpenseAccountId: settings?.depreciationExpenseAccountId ?? null,
        settingsAccumDepAccountId: settings?.accumulatedDepreciationAccountId ?? null,
        envExpenseAccountId: process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID,
        envAccumDepAccountId: process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID,
      })

      // Dasar jurnal POSTED (Putusan 1). Tanpa jurnal perolehan, aset ini
      // legacy subledger-only: jangan susutkan GL tanpa saldo bruto lawan.
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
          accumulatedDepreciationAccountId: accounts.accumulatedAccountId || null,
        },
      )
      if (!posted.hasAcquisitionJournal) {
        notJournaled++
        errors++
        errorDetails.push(
          `Asset ${asset.id} (${asset.name}): belum berjurnal (tidak ada jurnal perolehan POSTED), penyusutan GL dilewati berisik`,
        )
        continue
      }

      const result = computeMonthlyDepreciation({
        purchaseCost: posted.grossCostPosted,
        bookValue: posted.bookValue,
        residualValue: asset.residualValue,
        depreciationMethod: asset.depreciationMethod,
        categoryDepreciationRate: category.depreciationRate ?? null,
        categoryUsefulLife: category.usefulLife ?? null,
      })
      if (result.status === "reject") {
        rejectedMethods++
        errors++
        errorDetails.push(
          `Asset ${asset.id} (${asset.name}): metode penyusutan "${result.method}" ditolak cron`,
        )
        continue
      }
      if (result.status === "skip") {
        skipped++
        continue
      }

      if (!hasCompleteDepreciationAccounts(accounts)) {
        missingAccounts++
        errors++
        errorDetails.push(
          `Asset ${asset.id} (${asset.name}): akun beban/akumulasi penyusutan belum dipetakan (kategori atau Mapping Akun)`,
        )
        continue
      }

      toProcess.push({
        asset,
        monthlyDepreciation: result.amount,
        newBookValue: posted.bookValue.sub(result.amount),
        expenseAccountId: accounts.expenseAccountId,
        accumulatedAccountId: accounts.accumulatedAccountId,
      })
    }

    const journalSeqs = await DocumentSequenceService.nextBatch("JOURNAL", toProcess.length)

    const results = await Promise.allSettled(
      toProcess.map(({ asset, monthlyDepreciation, newBookValue, expenseAccountId, accumulatedAccountId }, i) => {
        const journalNumber = `JRN-${year}${String(month).padStart(2, "0")}-${String(journalSeqs[i]).padStart(5, "0")}`
        return prisma.$transaction(async (tx) => {
          // Penjaga periode otoritatif di DALAM tx (Putusan 4): penolakan
          // periode tertutup menggagalkan tx aset ini dan tercatat sebagai
          // error, bukan skip senyap; currentValue/history tidak berubah.
          await assertPeriodOpen(periodStart, tx)
          await tx.asset.update({
            where: { id: asset.id },
            data: { currentValue: newBookValue },
          })
          await tx.assetHistory.create({
            data: {
              assetId: asset.id,
              type: "depreciation",
              description: `Penyusutan bulan ${month}/${year} - ${asset.name}`,
              amount: monthlyDepreciation,
              date: periodStart,
            },
          })
          await tx.journal.create({
            data: {
              journalNumber,
              transactionDate: periodStart,
              referenceType,
              referenceId: asset.id,
              description: `Penyusutan aset: ${asset.name} (${asset.code}) - ${month}/${year}`,
              type: "DEPRECIATION",
              status: "POSTED",
              totalDebit: monthlyDepreciation,
              totalCredit: monthlyDepreciation,
              entries: {
                create: [
                  {
                    accountId: expenseAccountId,
                    debit: monthlyDepreciation,
                    credit: new Prisma.Decimal(0),
                    memo: `Beban penyusutan - ${asset.name}`,
                  },
                  {
                    accountId: accumulatedAccountId,
                    debit: new Prisma.Decimal(0),
                    credit: monthlyDepreciation,
                    memo: `Akumulasi penyusutan - ${asset.name}`,
                  },
                ],
              },
            },
          })
        })
      }),
    )

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        processed++
      } else {
        errors++
        const message = r.reason instanceof Error ? r.reason.message : "Unknown error"
        const { asset } = toProcess[i]
        errorDetails.push(`Asset ${asset.id} (${asset.name}): ${message}`)
      }
    })

    return NextResponse.json({
      period: `${month}/${year}`,
      totalAssets: assets.length,
      processed,
      skipped,
      errors,
      missingAccounts,
      notJournaled,
      rejectedMethods,
      errorDetails: errorDetails.slice(0, 10),
    })
  } catch (error) {
    console.error(error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan sistem")
  }
}
