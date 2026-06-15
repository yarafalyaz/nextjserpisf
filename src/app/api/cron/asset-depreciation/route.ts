import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { computeMonthlyDepreciation } from "@/lib/finance/asset-depreciation"
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

    // Fix #36: Validate account IDs exist before processing
    const depExpAccountId = parseInt(process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID || "0")
    const accDepAccountId = parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0")
    if (!depExpAccountId || !accDepAccountId) {
      return NextResponse.json({
        error: "DEPRECIATION_EXPENSE_ACCOUNT_ID dan ACCUMULATED_DEPRECIATION_ACCOUNT_ID harus di-set di environment variables",
      }, { status: 500 })
    }

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
    const toProcess: { asset: (typeof assets)[number]; monthlyDepreciation: number }[] = []
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
      toProcess.push({ asset, monthlyDepreciation })
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
      toProcess.map(({ asset, monthlyDepreciation }, i) => {
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
                    accountId: depExpAccountId,
                    debit: depreciationDecimal,
                    credit: new Prisma.Decimal(0),
                    memo: `Beban penyusutan - ${asset.name}`,
                  },
                  {
                    // Credit: Accumulated Depreciation
                    accountId: accDepAccountId,
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
      errorDetails: errorDetails.slice(0, 10),
    })
  } catch (error) {
    console.error(error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan sistem")
  }
}
