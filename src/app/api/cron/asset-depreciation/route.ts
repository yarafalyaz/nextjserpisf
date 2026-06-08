import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"

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
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
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

      const purchaseCost = Number(asset.purchaseCost)
      const currentValue = Number(asset.currentValue)
      const residualValue = Number(asset.residualValue)

      // Skip if already at/below residual value (fully depreciated)
      const depreciableFloor = Math.max(0, residualValue)
      if (currentValue <= depreciableFloor) { skipped++; continue }

      // Calculate monthly depreciation (residual-aware, method-dependent)
      let monthlyDepreciation = 0
      const isDeclining = asset.depreciationMethod === "declining_balance"

      if (isDeclining && category.depreciationRate) {
        // Declining balance: currentValue * annualRate / 12 (book value method)
        const rate = Number(category.depreciationRate) / 100
        monthlyDepreciation = currentValue * rate / 12
      } else if (category.usefulLife && category.usefulLife > 0) {
        // Straight-line on depreciable base: (cost - residual) / months
        monthlyDepreciation = (purchaseCost - depreciableFloor) / (category.usefulLife * 12)
      } else if (category.depreciationRate) {
        // Rate-based straight-line on depreciable base
        const rate = Number(category.depreciationRate) / 100
        monthlyDepreciation = (purchaseCost - depreciableFloor) * rate / 12
      }

      if (monthlyDepreciation <= 0) { skipped++; continue }

      // Never depreciate below the residual value
      if (currentValue - monthlyDepreciation < depreciableFloor) {
        monthlyDepreciation = currentValue - depreciableFloor
      }

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
