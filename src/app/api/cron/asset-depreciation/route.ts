import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { computeMonthlyDepreciation } from "@/lib/finance/asset-depreciation"
import {
  resolveDepreciationAccounts,
  hasCompleteDepreciationAccounts,
} from "@/lib/finance/depreciation-accounts"
import { apiError } from "@/lib/api-response"
import { DocumentSequenceService } from "@/lib/services/document-sequence.service"

/**
 * Cron: Run monthly asset depreciation for all active assets.
 * Schedule: 1st of every month at 01:00 (0 1 1 * *)
 * 
 * Mirrors Laravel: PostDepreciation + RunAssetDepreciation commands
 * 
 * Logic:
 * - Find all active assets with a category that has depreciation_rate or useful_life
 * - Calculate monthly depreciation (straight-line)
 * - Create asset history entries for depreciation
 * - Update asset current_value
 * - Create journal entries (debit depreciation expense, credit accumulated depreciation)
 */
export async function GET(request: Request) {
  // Verify cron secret
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  try {
    const now = new Date()
    const month = now.getMonth() + 1 // 1-12
    const year = now.getFullYear()
    const periodEnd = new Date(year, month - 1 + 1, 0) // Last day of current month

    // Find all active assets with depreciation info via category
    //
    // Period convention (explicit): an asset purchased at ANY point in a month
    // starts depreciating in that SAME month, charged a full month (first
    // depreciation dated the 1st). `purchaseDate: { lte: periodEnd }` therefore
    // includes assets bought mid-month. This is a deliberate policy choice (common
    // and simplest to reconcile); switch to a pro-rata or "month-after" policy by
    // changing this bound AND the posting date below together.
    const assets = await prisma.asset.findMany({
      where: {
        status: "active",
        purchaseDate: { lte: periodEnd },
        category: {
          OR: [
            { depreciationRate: { gt: 0 } },
            { usefulLife: { gt: 0 } },
          ],
        },
      },
      include: { category: true },
    })

    let processed = 0
    let errors = 0
    let skipped = 0
    const errorDetails: string[] = []

    // Global fallback account mappings (UI: Pengaturan → Mapping Akun). The env
    // vars are kept only as a last resort for pre-UI deployments.
    const settings = await prisma.systemSetting.findFirst({
      select: { depreciationExpenseAccountId: true, accumulatedDepreciationAccountId: true },
    })

    const periodStart = new Date(year, month - 1, 1)
    const periodEndExclusive = new Date(year, month, 1)

    // N+1 elimination: instead of one assetHistory.findFirst per asset to check
    // "already depreciated this period", fetch ALL of this period's depreciation
    // rows for the candidate assets in a single query and resolve via a Set.
    const alreadyDepreciated = assets.length
      ? await prisma.assetHistory.findMany({
          where: {
            assetId: { in: assets.map((a) => a.id) },
            type: "depreciation",
            date: { gte: periodStart, lt: periodEndExclusive },
          },
          select: { assetId: true },
        })
      : []
    const depreciatedAssetIds = new Set(alreadyDepreciated.map((r) => r.assetId))

    // Pure pass: compute each asset's monthly depreciation and collect only the
    // ones that will actually post a journal. No DB round-trips in this loop.
    // Accounts are resolved PER ASSET: the category mapping takes precedence over
    // the global settings mapping, which takes precedence over the env fallback.
    const toProcess: {
      asset: (typeof assets)[number]
      monthlyDepreciation: number
      expenseAccountId: number
      accumulatedAccountId: number
    }[] = []
    let missingAccounts = 0
    for (const asset of assets) {
      const category = asset.category
      if (!category) continue

      // Fix #37: skip assets already depreciated this period (idempotent re-run).
      if (depreciatedAssetIds.has(asset.id)) {
        skipped++
        continue
      }

      // Calculate monthly depreciation (residual-aware, method-dependent).
      // Pure math lives in computeMonthlyDepreciation (unit-tested); returns 0
      // to signal "skip" (already at residual, or no usable method/rate).
      const monthlyDepreciation = computeMonthlyDepreciation({
        purchaseCost: Number(asset.purchaseCost),
        currentValue: Number(asset.currentValue),
        residualValue: Number(asset.residualValue),
        depreciationMethod: asset.depreciationMethod,
        categoryDepreciationRate: category.depreciationRate
          ? Number(category.depreciationRate)
          : null,
        categoryUsefulLife: category.usefulLife ?? null,
      })

      if (monthlyDepreciation <= 0) { skipped++; continue }

      // Category mapping wins; settings mapping is the global fallback; env last.
      const accounts = resolveDepreciationAccounts({
        categoryExpenseAccountId: category.depreciationExpenseAccountId,
        categoryAccumDepAccountId: category.accumulatedDepreciationAccountId,
        settingsExpenseAccountId: settings?.depreciationExpenseAccountId ?? null,
        settingsAccumDepAccountId: settings?.accumulatedDepreciationAccountId ?? null,
        envExpenseAccountId: process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID,
        envAccumDepAccountId: process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID,
      })

      // Cannot post a depreciation journal without both accounts. Count it as an
      // error (not a silent skip) so an under-configured deployment is visible
      // in the cron result instead of quietly depreciating nothing.
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
        monthlyDepreciation,
        expenseAccountId: accounts.expenseAccountId,
        accumulatedAccountId: accounts.accumulatedAccountId,
      })
    }

    // Reserve a contiguous block of journal numbers in ONE atomic round-trip,
    // replacing the per-asset documentSequence.upsert (N counter bumps → 1).
    // Same "JOURNAL" key the manual journal/asset acquisition paths use, so the
    // JRN-YYYYMM-NNNNN run stays contiguous with the rest of the GL.
    const journalSeqs = await DocumentSequenceService.nextBatch("JOURNAL", toProcess.length)

    // Fire the per-asset posting transactions concurrently. Each is its own
    // atomic $transaction (asset value + history + balanced journal), and the
    // period-encoded referenceType keeps them idempotent against double runs.
    const results = await Promise.allSettled(
      toProcess.map(({ asset, monthlyDepreciation, expenseAccountId, accumulatedAccountId }, i) => {
        const newValue = Number(asset.currentValue) - monthlyDepreciation
        const depreciationDecimal = new Prisma.Decimal(monthlyDepreciation.toFixed(2))
        const newValueDecimal = new Prisma.Decimal(newValue.toFixed(2))
        const journalNumber = `JRN-${year}${String(month).padStart(2, "0")}-${String(journalSeqs[i]).padStart(5, "0")}`

        return prisma.$transaction([
          // Update asset current value
          prisma.asset.update({
            where: { id: asset.id },
            data: { currentValue: newValueDecimal },
          }),
          // Create asset history entry
          prisma.assetHistory.create({
            data: {
              assetId: asset.id,
              type: "depreciation",
              description: `Penyusutan bulan ${month}/${year} - ${asset.name}`,
              amount: depreciationDecimal,
              date: periodStart,
            },
          }),
          // Create journal entry for depreciation
          prisma.journal.create({
            data: {
              journalNumber,
              transactionDate: periodStart,
              // Period-specific referenceType: journals are unique on
              // (referenceType, referenceId). Using a bare "ASSET_DEPRECIATION" with
              // referenceId=asset.id collides from the 2nd month onward (same pair),
              // which silently stopped depreciation after month 1. Encoding the period
              // makes each asset+month unique AND gives idempotency against double runs.
              referenceType: `ASSET_DEPRECIATION_${year}${String(month).padStart(2, "0")}`,
              referenceId: asset.id,
              description: `Penyusutan aset: ${asset.name} (${asset.code}) - ${month}/${year}`,
              type: "DEPRECIATION",
              status: "POSTED",
              totalDebit: depreciationDecimal,
              totalCredit: depreciationDecimal,
              entries: {
                create: [
                  {
                    // Debit: Depreciation Expense
                    accountId: expenseAccountId,
                    debit: depreciationDecimal,
                    credit: new Prisma.Decimal(0),
                    memo: `Beban penyusutan - ${asset.name}`,
                  },
                  {
                    // Credit: Accumulated Depreciation
                    accountId: accumulatedAccountId,
                    debit: new Prisma.Decimal(0),
                    credit: depreciationDecimal,
                    memo: `Akumulasi penyusutan - ${asset.name}`,
                  },
                ],
              },
            },
          }),
        ])
      })
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
      errorDetails: errorDetails.slice(0, 10),
    })
  } catch (error) {
    console.error(error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan sistem")
  }
}
