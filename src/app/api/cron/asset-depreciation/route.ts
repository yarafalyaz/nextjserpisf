import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { computeMonthlyDepreciation } from "@/lib/finance/asset-depreciation"
import { apiError } from "@/lib/api-response"

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

  for (const asset of assets) {
    try {
      const category = asset.category
      if (!category) continue

      // Fix #37: Check if already depreciated this period
      const existingDepreciation = await prisma.assetHistory.findFirst({
        where: {
          assetId: asset.id,
          type: "depreciation",
          date: {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          },
        },
      })
      if (existingDepreciation) {
        skipped++
        continue
      }

      const currentValue = Number(asset.currentValue)

      // Calculate monthly depreciation (residual-aware, method-dependent).
      // Pure math lives in computeMonthlyDepreciation (unit-tested); returns 0
      // to signal "skip" (already at residual, or no usable method/rate).
      const monthlyDepreciation = computeMonthlyDepreciation({
        purchaseCost: Number(asset.purchaseCost),
        currentValue,
        residualValue: Number(asset.residualValue),
        depreciationMethod: asset.depreciationMethod,
        categoryDepreciationRate: category.depreciationRate
          ? Number(category.depreciationRate)
          : null,
        categoryUsefulLife: category.usefulLife ?? null,
      })

      if (monthlyDepreciation <= 0) { skipped++; continue }

      const newValue = currentValue - monthlyDepreciation
      const depreciationDecimal = new Prisma.Decimal(monthlyDepreciation.toFixed(2))
      const newValueDecimal = new Prisma.Decimal(newValue.toFixed(2))

      // Generate journal number
      const journalSeq = await prisma.documentSequence.upsert({
        where: { key: "JOURNAL" },
        update: { currentValue: { increment: 1 } },
        create: { key: "JOURNAL", currentValue: 1 },
      })
      const journalNumber = `JRN-${year}${String(month).padStart(2, "0")}-${String(journalSeq.currentValue).padStart(5, "0")}`

      await prisma.$transaction([
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
            date: new Date(year, month - 1, 1),
          },
        }),
        // Create journal entry for depreciation
        prisma.journal.create({
          data: {
            journalNumber,
            transactionDate: new Date(year, month - 1, 1),
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
                  accountId: parseInt(process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID || "0") || 0,
                  debit: depreciationDecimal,
                  credit: new Prisma.Decimal(0),
                  memo: `Beban penyusutan - ${asset.name}`,
                },
                {
                  // Credit: Accumulated Depreciation
                  accountId: parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || 0,
                  debit: new Prisma.Decimal(0),
                  credit: depreciationDecimal,
                  memo: `Akumulasi penyusutan - ${asset.name}`,
                },
              ],
            },
          },
        }),
      ])

      processed++
    } catch (e) {
      errors++
      const message = e instanceof Error ? e.message : "Unknown error"
      errorDetails.push(`Asset ${asset.id} (${asset.name}): ${message}`)
    }
  }

  return NextResponse.json({
    period: `${month}/${year}`,
    totalAssets: assets.length,
    processed,
    skipped,
    errors,
    errorDetails: errorDetails.slice(0, 10),
  })
}
