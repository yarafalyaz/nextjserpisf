import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import {
  computeMonthlyDepreciation,
  isAnalyticalDepreciationMethod,
  isRegisteredDepreciationMethod,
} from "@/lib/finance/asset-depreciation"
import { resolveAnalyticalAssetStatus } from "@/lib/finance/asset-analytical-posting"
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
 *    di sini (Putusan 2).
 *  - Hitung Decimal, bulanan dibulatkan ke sen, bulan terakhir berhenti persis
 *    di residu (Putusan 4, di `computeMonthlyDepreciation`).
 *  - Satu jurnal per (aset, masa): unique (referenceType, referenceId) schema
 *    dengan referenceType `ASSET_DEPRECIATION_YYYYMM`; replay bulan sama =
 *    nol jurnal baru. `assertPeriodOpen` di dalam tx posting per aset.
 *  - Mulai penyusutan = bulan pengeluaran, bulan penuh, jurnal bertanggal
 *    awal masa (perilaku existing dipertahankan sebagai putusan).
 *
 * Vonis BOT 4 F-2026-10-23-118-V Putusan 2: metode analitis
 * (`units_of_production`, `sum_of_years_digits`) BOLEH GL hanya lewat inti
 * ini — parameter terbekukan per aset + dokumen unit aktual +
 * `assertPeriodOpen` dalam tx + idempotensi per masa, tanpa kategori
 * fiskal. Aset analitis melewati gerbang kategori (rate/usefulLife fiskal
 * tidak dipakai komersial); `held_for_sale` tidak dipilih sama sekali dan
 * `status` tak terdaftar di query top-level dibatalkan berisik di
 * `resolveAnalyticalAssetStatus`.
 */
export async function POST(request: Request) {
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

    // Aset analitis melewati gerbang kategori (rate/usefulLife fiskal tidak
    // dipakai komersial, F-118-V Putusan 2); GL standar tetap wajib kategori.
    const assets = await prisma.asset.findMany({
      where: {
        status: "active",
        purchaseDate: { lte: periodEnd },
        OR: [
          {
            depreciationMethod: {
              in: ["units_of_production", "sum_of_years_digits"],
            },
          },
          {
            category: {
              OR: [{ depreciationRate: { gt: 0 } }, { usefulLife: { gt: 0 } }],
            },
          },
        ],
      },
      include: {
        category: true,
        usageRecords: {
          where: { periodYear: year, periodMonth: month },
          take: 1,
        },
      },
    })

    let processed = 0
    let errors = 0
    let skipped = 0
    let analyticalSkipped = 0
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
                // Jurnal peristiwa (revaluasi/restatement/reklasifikasi)
                // wajib ikut: tanpa ini nilai buku membeku pra-peristiwa.
                { referenceType: "ASSET_CHANGE_EVENT" },
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
      const analytical = isAnalyticalDepreciationMethod(asset.depreciationMethod)
      if (!category && !analytical) continue
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
      const fixedAssetAccountId =
        category?.assetAccountId ?? (envAccount("FIXED_ASSET_ACCOUNT_ID") || null)
      const accounts = resolveDepreciationAccounts({
        categoryExpenseAccountId: category?.depreciationExpenseAccountId ?? null,
        categoryAccumDepAccountId:
          category?.accumulatedDepreciationAccountId ?? null,
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
          accumulatedImpairmentAccountId:
            category?.accumulatedImpairmentAccountId ?? null,
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

      // F-118-V Putusan 2: analitis lewat resolver inti (parameter beku +
      // dokumen unit). skip/reject berisik, tanpa jurnal; fiskal tak ikut.
      const result = analytical
        ? resolveAnalyticalAssetStatus({
            depreciationMethod: asset.depreciationMethod,
            status: asset.status,
            purchaseCost: posted.grossCostPosted,
            bookValue: posted.bookValue,
            residualValue: asset.residualValue,
            totalEstimatedUnits: asset.totalEstimatedUnits,
            usefulLifeMonths: asset.usefulLifeMonths,
            actualUnits: asset.usageRecords?.[0]?.actualUnits ?? null,
            purchaseDate: asset.purchaseDate,
            periodYear: year,
            periodMonth: month,
            alreadyPosted: false,
          })
        : computeMonthlyDepreciation({
            purchaseCost: posted.grossCostPosted,
            bookValue: posted.bookValue,
            residualValue: asset.residualValue,
            depreciationMethod: asset.depreciationMethod,
            categoryDepreciationRate: category?.depreciationRate ?? null,
            categoryUsefulLife: category?.usefulLife ?? null,
          })
      if (result.status === "reject") {
        rejectedMethods++
        errors++
        const rejectMessage =
          analytical && result.reason === "missing-parameter"
            ? `Asset ${asset.id} (${asset.name}): parameter analitis "${result.parameter}" belum dibekukan/dicatat, tidak diposting jurnal`
            : analytical && result.reason === "unregistered-status"
              ? `Asset ${asset.id} (${asset.name}): status "${result.method}" tidak terdaftar, penyusutan analitis dibatalkan`
              : `Asset ${asset.id} (${asset.name}): metode penyusutan "${"method" in result ? result.method : ""}" ditolak cron`
        errorDetails.push(rejectMessage)
        continue
      }
      if (result.status === "skip") {
        if (analytical) {
          analyticalSkipped++
          errorDetails.push(
            `Asset ${asset.id} (${asset.name}): skip analitis ${result.reason}`,
          )
        } else {
          skipped++
        }
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
          // Serialisasi per aset SEBELUM menulis: dua run konkuren untuk
          // aset sama antre di baris ini, lalu cek ulang jurnal masa ini di
          // bawah melihat jurnal pemenang. Tanpa kunci, yang kalah menabrak
          // unique journals_active_reference_unique (P2002) dan terhitung
          // error berisik padahal hasil akhirnya idempoten. Guard typeof:
          // tx stub tanpa $queryRaw tidak pecah (pola hooks repo).
          if (typeof tx.$queryRaw === "function") {
            await tx.$queryRaw`SELECT id FROM assets WHERE id = ${asset.id} FOR UPDATE`
          }
          const alreadyPosted = await tx.journal.findFirst({
            where: { referenceType, referenceId: asset.id, status: "POSTED", deletedAt: null },
            select: { id: true },
          })
          if (alreadyPosted) return "skipped-posted" as const

          // Nilai segar dibaca ulang DI BAWAH kunci baris aset untuk SEMUA
          // metode: scan + hitung luar adalah snapshot — disposeAsset
          // mengunci baris yang sama, jadi disposal yang commit di jendela
          // terlihat di sini (status bukan active atau jurnal ASSET_DISPOSAL
          // POSTED) dan aset itu dilewati. Tanpa ini jalur non-UOP memposting
          // jurnal penyusutan atas aset disposed dan menimpa currentValue
          // dari 0 kembali ke nilai basi. Cabang UOP juga memakai bacaan
          // segar yang sama (unit aktual bisa dikoreksi operator lewat
          // upsertAssetUsageRecord sesudah daftar toProcess dibentuk).
          const analytical = isAnalyticalDepreciationMethod(asset.depreciationMethod)
          const freshAsset = await tx.asset.findUnique({
            where: { id: asset.id },
            select: {
              status: true,
              residualValue: true,
              totalEstimatedUnits: true,
              usefulLifeMonths: true,
              purchaseDate: true,
            },
          })
          if (!freshAsset || freshAsset.status !== "active") return "skipped-posted" as const
          const freshJournals = await tx.journal.findMany({
            where: {
              referenceId: asset.id,
              status: "POSTED",
              deletedAt: null,
              OR: [
                { referenceType: "ASSET_ACQUISITION" },
                { referenceType: "ASSET_DISPOSAL" },
                { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
                { referenceType: "ASSET_CHANGE_EVENT" },
              ],
            },
            select: {
              referenceType: true,
              entries: { select: { accountId: true, debit: true, credit: true } },
            },
          })
          if (freshJournals.some((j) => j.referenceType === "ASSET_DISPOSAL")) {
            return "skipped-posted" as const
          }
          const freshBook = journalBookValue(
            freshJournals.map((j) => ({
              referenceType: j.referenceType ?? "",
              lines: j.entries.map((e) => ({
                accountId: e.accountId,
                debit: e.debit,
                credit: e.credit,
              })),
            })),
            {
              fixedAssetAccountId:
                asset.category?.assetAccountId ??
                (envAccount("FIXED_ASSET_ACCOUNT_ID") || null),
              accumulatedDepreciationAccountId: accumulatedAccountId || null,
              accumulatedImpairmentAccountId:
                asset.category?.accumulatedImpairmentAccountId ?? null,
            },
          )

          let effectiveDepreciation = monthlyDepreciation
          let effectiveBookValue = newBookValue
          if (analytical) {
            const freshRecord =
              asset.depreciationMethod === "units_of_production"
                ? await tx.assetUsageRecord.findFirst({
                    where: { assetId: asset.id, periodYear: year, periodMonth: month },
                    select: { actualUnits: true },
                  })
                : null
            const freshResult = resolveAnalyticalAssetStatus({
              depreciationMethod: asset.depreciationMethod,
              status: freshAsset.status,
              purchaseCost: freshBook.grossCostPosted,
              bookValue: freshBook.bookValue,
              residualValue: freshAsset.residualValue ?? asset.residualValue,
              totalEstimatedUnits: freshAsset.totalEstimatedUnits ?? asset.totalEstimatedUnits,
              usefulLifeMonths: freshAsset.usefulLifeMonths ?? asset.usefulLifeMonths,
              actualUnits: freshRecord?.actualUnits ?? null,
              purchaseDate: freshAsset.purchaseDate ?? asset.purchaseDate,
              periodYear: year,
              periodMonth: month,
              alreadyPosted: false,
            })
            if (freshResult.status !== "computed") return "skipped-posted" as const
            effectiveDepreciation = freshResult.amount
            effectiveBookValue = freshBook.bookValue.sub(freshResult.amount)
          } else {
            if (!freshBook.hasAcquisitionJournal) return "skipped-posted" as const
            const freshResult = computeMonthlyDepreciation({
              purchaseCost: freshBook.grossCostPosted,
              bookValue: freshBook.bookValue,
              residualValue: freshAsset.residualValue ?? asset.residualValue,
              depreciationMethod: asset.depreciationMethod,
              categoryDepreciationRate: asset.category?.depreciationRate ?? null,
              categoryUsefulLife: asset.category?.usefulLife ?? null,
            })
            if (freshResult.status !== "computed") return "skipped-posted" as const
            effectiveDepreciation = freshResult.amount
            effectiveBookValue = freshBook.bookValue.sub(freshResult.amount)
          }

          // Penjaga periode otoritatif di DALAM tx (Putusan 4): penolakan
          // periode tertutup menggagalkan tx aset ini dan tercatat sebagai
          // error, bukan skip senyap; currentValue/history tidak berubah.
          await assertPeriodOpen(periodStart, tx)
          await tx.asset.update({
            where: { id: asset.id },
            data: { currentValue: effectiveBookValue },
          })
          await tx.assetHistory.create({
            data: {
              assetId: asset.id,
              type: "depreciation",
              description: `Penyusutan bulan ${month}/${year} - ${asset.name}`,
              amount: effectiveDepreciation,
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
              totalDebit: effectiveDepreciation,
              totalCredit: effectiveDepreciation,
              entries: {
                create: [
                  {
                    accountId: expenseAccountId,
                    debit: effectiveDepreciation,
                    credit: new Prisma.Decimal(0),
                    memo: `Beban penyusutan - ${asset.name}`,
                  },
                  {
                    accountId: accumulatedAccountId,
                    debit: new Prisma.Decimal(0),
                    credit: effectiveDepreciation,
                    memo: `Akumulasi penyusutan - ${asset.name}`,
                  },
                ],
              },
            },
          })
          return "ok" as const
        })
      }),
    )

    results.forEach((r, i) => {
      const { asset } = toProcess[i]
      if (r.status === "fulfilled") {
        // Tabrakan idempoten yang dideteksi di dalam tx: bukan error.
        if (r.value === "skipped-posted") skipped++
        else processed++
        return
      }
      // Pertahanan lapis dua: P2002 dari journal.create = run lain sudah
      // memposting masa ini untuk aset yang sama; perlakukan skip idempoten.
      const code = (r.reason as { code?: unknown } | null)?.code
      if (code === "P2002") {
        skipped++
        return
      }
      errors++
      // Detail asli (pesan Prisma/internal) hanya ke log server; respons
      // hanya label generik per aset.
      console.error(`[cron/asset-depreciation] Asset ${asset.id} (${asset.name}) gagal diproses:`, r.reason)
      errorDetails.push(`Asset ${asset.id} (${asset.name}): gagal diproses`)
    })

    return NextResponse.json({
      period: `${month}/${year}`,
      totalAssets: assets.length,
      processed,
      skipped,
      analyticalSkipped,
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
